// ========== BOT.JS - BOT DISCORD + API ==========

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { connectDatabase, createLicense, verifyLicense, revokeLicense, getStats, License, Log } = require('./database');

// ========== CONFIGURATION ==========
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',') || [];
const PREMIUM_ROLE_NAME = '👑 Premium';

// ========== DISCORD CLIENT ==========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// ========== EXPRESS API ==========
const app = express();
app.use(cors());
app.use(express.json());

// ========== API ROUTES ==========

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'Auto Vote Bot License API',
    version: '1.0.0'
  });
});

// Vérifier une licence
app.post('/api/verify', async (req, res) => {
  const { key, discordUserId } = req.body;  // ✅ Recevoir discordUserId
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!key) {
    return res.status(400).json({ valid: false, error: 'Clé requise' });
  }
  
  console.log(`[API] Vérification licence: ${key} depuis ${ip}${discordUserId ? ` (Discord: ${discordUserId})` : ''}`);
  
  const result = await verifyLicense(key, ip, discordUserId);  // ✅ Passer discordUserId
  
  res.json(result);
});

// Obtenir info sur une licence (pour le bot Discord)
app.get('/api/license/:key', async (req, res) => {
  const { key } = req.params;
  
  try {
    const license = await License.findOne({ key });
    
    if (!license) {
      return res.status(404).json({ error: 'Licence introuvable' });
    }
    
    res.json({
      key: license.key,
      username: license.username,
      discordUserId: license.discordUserId,  // ✅ NOUVEAU
      status: license.status,
      createdAt: license.createdAt,
      expiresAt: license.expiresAt,
      lastUsed: license.lastUsed,
      usageCount: license.usageCount,
      ipCount: license.ipAddresses.length
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ========== DISCORD COMMANDS ==========

const commands = [
  // Commande /buy
  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Acheter une licence Auto Vote Bot'),
  
  // Commande /license
  new SlashCommandBuilder()
    .setName('license')
    .setDescription('Voir votre licence actuelle'),
  
  // Commande /help
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Aide et commandes disponibles'),
  
  // ========== COMMANDES ADMIN ==========
  
  // Commande /generate
  new SlashCommandBuilder()
    .setName('generate')
    .setDescription('[ADMIN] Générer une licence manuelle')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Utilisateur qui recevra la licence')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('duration')
        .setDescription('Durée en jours (0 = illimité)')
        .setRequired(false)
    ),
  
  // Commande /revoke
  new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('[ADMIN] Révoquer une licence')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence à révoquer')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Raison de la révocation')
        .setRequired(false)
    ),
  
  // Commande /check
  new SlashCommandBuilder()
    .setName('check')
    .setDescription('[ADMIN] Vérifier une licence')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence')
        .setRequired(true)
    ),
  
  // Commande /stats
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('[ADMIN] Statistiques des licences'),
  
  // Commande /logs
  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('[ADMIN] Logs d\'une licence')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence')
        .setRequired(true)
    ),
  
  // ✅ NOUVELLE Commande /link
  new SlashCommandBuilder()
    .setName('link')
    .setDescription('[ADMIN] Lier une licence à un Discord User ID')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence')
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Utilisateur Discord')
        .setRequired(true)
    ),
  
  // ✅ NOUVELLE Commande /unlink
  new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('[ADMIN] Délier une licence d\'un Discord User ID')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence')
        .setRequired(true)
    )
];

// ========== ENREGISTRER LES COMMANDES ==========
async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    console.log('🔄 [DISCORD] Enregistrement des commandes...');
    
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    
    console.log('✅ [DISCORD] Commandes enregistrées');
  } catch (error) {
    console.error('❌ [DISCORD] Erreur enregistrement commandes:', error);
  }
}

// ========== GESTION DES COMMANDES ==========

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, user } = interaction;
  
  // Vérifier si admin pour commandes admin
  const isAdmin = ADMIN_IDS.includes(user.id);
  const adminCommands = ['generate', 'revoke', 'check', 'stats', 'logs', 'link', 'unlink'];
  
  if (adminCommands.includes(commandName) && !isAdmin) {
    return interaction.reply({
      content: '❌ Cette commande est réservée aux administrateurs.',
      ephemeral: true
    });
  }
  
  try {
    switch (commandName) {
      case 'buy':
        await handleBuyCommand(interaction);
        break;
        
      case 'license':
        await handleLicenseCommand(interaction);
        break;
        
      case 'help':
        await handleHelpCommand(interaction);
        break;
        
      case 'generate':
        await handleGenerateCommand(interaction);
        break;
        
      case 'revoke':
        await handleRevokeCommand(interaction);
        break;
        
      case 'check':
        await handleCheckCommand(interaction);
        break;
        
      case 'stats':
        await handleStatsCommand(interaction);
        break;
        
      case 'logs':
        await handleLogsCommand(interaction);
        break;
        
      case 'link':
        await handleLinkCommand(interaction);
        break;
        
      case 'unlink':
        await handleUnlinkCommand(interaction);
        break;
    }
  } catch (error) {
    console.error(`❌ [COMMAND] Erreur ${commandName}:`, error);
    await interaction.reply({
      content: '❌ Une erreur est survenue.',
      ephemeral: true
    }).catch(() => {});
  }
});

// ========== HANDLERS DES COMMANDES ==========

async function handleBuyCommand(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('💰 Acheter Auto Vote Bot')
    .setDescription('**Extension Chrome pour voter automatiquement sur vos serveurs Dofus !**')
    .addFields(
      { name: '💎 Prix', value: `${process.env.LICENSE_PRICE / 100}€`, inline: true },
      { name: '⏰ Durée', value: process.env.LICENSE_DURATION === '0' ? 'Illimité' : `${process.env.LICENSE_DURATION} jours`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '✨ Fonctionnalités', value: '• Vote automatique multi-serveurs\n• Synchronisation cooldown\n• Notifications Discord\n• Stats détaillées\n• Support 24/7', inline: false },
      { name: '🛒 Comment acheter ?', value: '1. Contactez un administrateur\n2. Effectuez le paiement\n3. Recevez votre licence instantanément', inline: false }
    )
    .setFooter({ text: 'Auto Vote Bot • Licence à vie' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLicenseCommand(interaction) {
  const license = await License.findOne({ userId: interaction.user.id, status: 'active' });
  
  if (!license) {
    return interaction.reply({
      content: '❌ Vous n\'avez pas de licence active.\nUtilisez `/buy` pour en obtenir une !',
      ephemeral: true
    });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('🔑 Votre Licence')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'Statut', value: '✅ Active', inline: true },
      { name: 'Utilisations', value: license.usageCount.toString(), inline: true },
      { name: 'Expire', value: license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('fr-FR') : 'Jamais', inline: true }
    );
  
  if (license.discordUserId) {
    embed.addFields({
      name: '🆔 Discord User ID',
      value: `Liée à <@${license.discordUserId}>`,
      inline: false
    });
  }
  
  if (license.lastUsed) {
    embed.addFields({
      name: 'Dernière utilisation',
      value: new Date(license.lastUsed).toLocaleString('fr-FR'),
      inline: false
    });
  }
  
  embed.setFooter({ text: 'Gardez votre clé secrète !' });
  embed.setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleHelpCommand(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('📖 Aide - Auto Vote Bot')
    .setDescription('**Commandes disponibles :**')
    .addFields(
      { name: '/buy', value: 'Acheter une licence', inline: true },
      { name: '/license', value: 'Voir votre licence', inline: true },
      { name: '/help', value: 'Afficher cette aide', inline: true },
      { name: '📥 Installation', value: '1. Achetez une licence avec `/buy`\n2. Téléchargez l\'extension\n3. Entrez votre clé de licence\n4. (Optionnel) Entrez votre Discord User ID\n5. Profitez !', inline: false },
      { name: '🔗 Lier votre Discord', value: 'Vous pouvez lier votre licence à votre compte Discord pour plus de sécurité.\nVotre User ID : `' + interaction.user.id + '`', inline: false },
      { name: '🆘 Support', value: 'Besoin d\'aide ? Contactez un administrateur', inline: false }
    )
    .setFooter({ text: 'Auto Vote Bot' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleGenerateCommand(interaction) {
  const targetUser = interaction.options.getUser('user');
  const duration = interaction.options.getInteger('duration') || 0;
  
  const expiresAt = duration > 0 ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
  
  const license = await createLicense(
    targetUser.id, 
    targetUser.username, 
    { 
      expiresAt,
      discordUserId: targetUser.id  // ✅ Lier automatiquement
    }
  );
  
  // Donner le rôle Premium
  try {
    const member = await interaction.guild.members.fetch(targetUser.id);
    const role = interaction.guild.roles.cache.find(r => r.name === PREMIUM_ROLE_NAME);
    if (role) {
      await member.roles.add(role);
    }
  } catch (error) {
    console.error('Erreur ajout rôle:', error);
  }
  
  // Envoyer DM à l'utilisateur
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🎉 Licence générée !')
      .setDescription(`**Votre licence Auto Vote Bot :**\n\n\`${license.key}\``)
      .addFields(
        { name: '📥 Télécharger', value: '[Lien Chrome Web Store](https://chrome.google.com/webstore/...)', inline: false },
        { name: '🆔 Discord User ID', value: `Cette licence est automatiquement liée à votre compte Discord : \`${targetUser.id}\``, inline: false },
        { name: '📖 Installation', value: '1. Installez l\'extension\n2. Ouvrez le popup\n3. Entrez votre clé\n4. (Optionnel) Entrez votre Discord User ID pour plus de sécurité\n5. Profitez !', inline: false }
      )
      .setFooter({ text: 'Gardez cette clé secrète !' });
    
    await targetUser.send({ embeds: [dmEmbed] });
  } catch (error) {
    console.error('Impossible d\'envoyer DM:', error);
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('✅ Licence générée')
    .addFields(
      { name: 'Utilisateur', value: targetUser.username, inline: true },
      { name: 'Clé', value: `\`${license.key}\``, inline: true },
      { name: 'Expire', value: expiresAt ? new Date(expiresAt).toLocaleDateString('fr-FR') : 'Jamais', inline: true },
      { name: '🆔 Discord User ID', value: `Liée à <@${targetUser.id}>`, inline: false }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRevokeCommand(interaction) {
  const key = interaction.options.getString('key');
  const reason = interaction.options.getString('reason') || 'Non spécifiée';
  
  const result = await revokeLicense(key, reason);
  
  if (!result.success) {
    return interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true
    });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('🚫 Licence révoquée')
    .addFields(
      { name: 'Clé', value: `\`${key}\``, inline: false },
      { name: 'Raison', value: reason, inline: false }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCheckCommand(interaction) {
  const key = interaction.options.getString('key');
  
  const license = await License.findOne({ key });
  
  if (!license) {
    return interaction.reply({
      content: '❌ Licence introuvable',
      ephemeral: true
    });
  }
  
  const statusEmoji = {
    'active': '✅',
    'revoked': '🚫',
    'expired': '⏰'
  };
  
  const embed = new EmbedBuilder()
    .setColor(license.status === 'active' ? 0x10b981 : 0xef4444)
    .setTitle('🔍 Informations Licence')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'Utilisateur', value: license.username, inline: true },
      { name: '🆔 Discord User ID', value: license.discordUserId ? `<@${license.discordUserId}>` : 'Non lié', inline: true },  // ✅ NOUVEAU
      { name: 'Statut', value: `${statusEmoji[license.status]} ${license.status}`, inline: true },
      { name: 'Utilisations', value: license.usageCount.toString(), inline: true },
      { name: 'IPs différentes', value: license.ipAddresses.length.toString(), inline: true },
      { name: 'Créée le', value: new Date(license.createdAt).toLocaleDateString('fr-FR'), inline: true },
      { name: 'Expire', value: license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('fr-FR') : 'Jamais', inline: true }
    );
  
  if (license.lastUsed) {
    embed.addFields({
      name: 'Dernière utilisation',
      value: new Date(license.lastUsed).toLocaleString('fr-FR'),
      inline: false
    });
  }
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStatsCommand(interaction) {
  const stats = await getStats();
  
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('📊 Statistiques Licences')
    .addFields(
      { name: 'Total', value: stats.total.toString(), inline: true },
      { name: 'Actives', value: `✅ ${stats.active}`, inline: true },
      { name: 'Révoquées', value: `🚫 ${stats.revoked}`, inline: true },
      { name: 'Expirées', value: `⏰ ${stats.expired}`, inline: true },
      { name: '🔗 Liées Discord', value: stats.linked.toString(), inline: true },  // ✅ NOUVEAU
      { name: '\u200B', value: '\u200B', inline: true }
    )
    .setFooter({ text: 'Auto Vote Bot' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLogsCommand(interaction) {
  const key = interaction.options.getString('key');
  
  const logs = await Log.find({ licenseKey: key })
    .sort({ timestamp: -1 })
    .limit(10);
  
  if (logs.length === 0) {
    return interaction.reply({
      content: '❌ Aucun log trouvé pour cette licence',
      ephemeral: true
    });
  }
  
  const logText = logs.map(log => {
    const emoji = log.success ? '✅' : '❌';
    const time = new Date(log.timestamp).toLocaleString('fr-FR');
    const discord = log.discordUserId ? ` (Discord: ${log.discordUserId})` : '';
    return `${emoji} ${log.action} - ${time} - ${log.ip || 'N/A'}${discord}`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('📋 Logs Récents')
    .setDescription(`**Licence:** \`${key}\`\n\n${logText}`)
    .setFooter({ text: `${logs.length} logs affichés` })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ✅ NOUVEAU Handler
async function handleLinkCommand(interaction) {
  const key = interaction.options.getString('key');
  const targetUser = interaction.options.getUser('user');
  
  const license = await License.findOne({ key });
  
  if (!license) {
    return interaction.reply({
      content: '❌ Licence introuvable',
      ephemeral: true
    });
  }
  
  if (license.discordUserId && license.discordUserId !== targetUser.id) {
    return interaction.reply({
      content: `⚠️ Cette licence est déjà liée à <@${license.discordUserId}>.\nUtilisez \`/unlink\` d'abord pour la délier.`,
      ephemeral: true
    });
  }
  
  license.discordUserId = targetUser.id;
  await license.save();
  
  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('✅ Licence Liée')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'Discord User', value: `<@${targetUser.id}>`, inline: true },
      { name: 'User ID', value: targetUser.id, inline: true }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ✅ NOUVEAU Handler
async function handleUnlinkCommand(interaction) {
  const key = interaction.options.getString('key');
  
  const license = await License.findOne({ key });
  
  if (!license) {
    return interaction.reply({
      content: '❌ Licence introuvable',
      ephemeral: true
    });
  }
  
  if (!license.discordUserId) {
    return interaction.reply({
      content: '⚠️ Cette licence n\'est pas liée à un Discord User ID',
      ephemeral: true
    });
  }
  
  const previousUserId = license.discordUserId;
  license.discordUserId = null;
  await license.save();
  
  const embed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('🔓 Licence Déliée')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'Ancien Discord User', value: `<@${previousUserId}>`, inline: true },
      { name: 'User ID', value: previousUserId, inline: true }
    )
    .setDescription('La licence peut maintenant être liée à un autre compte Discord.')
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ========== DÉMARRAGE ==========

async function start() {
  console.log('🚀 [BOT] Démarrage...');
  
  // Connexion BDD
  const dbConnected = await connectDatabase();
  if (!dbConnected) {
    console.error('❌ [BOT] Impossible de démarrer sans base de données');
    process.exit(1);
  }
  
  // Connexion Discord
  await client.login(process.env.DISCORD_TOKEN);
  
  client.once('ready', async () => {
    console.log(`✅ [DISCORD] Connecté: ${client.user.tag}`);
    await registerCommands();
  });
  
  // Démarrage API
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`✅ [API] En écoute sur port ${port}`);
    console.log(`🌐 API URL: http://localhost:${port}`);
  });
}

// Gestion des erreurs
process.on('unhandledRejection', (error) => {
  console.error('❌ [ERROR] Unhandled rejection:', error);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 [BOT] Arrêt...');
  await client.destroy();
  process.exit(0);
});

// Démarrer
start();
