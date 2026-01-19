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
  const { key, discordUserId } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!key) {
    return res.status(400).json({ valid: false, error: 'Clé requise' });
  }
  
  if (!discordUserId) {
    return res.status(400).json({ valid: false, error: 'Discord User ID requis' });
  }
  
  console.log(`[API] Vérification licence: ${key} depuis ${ip} (Discord: ${discordUserId})`);
  
  const result = await verifyLicense(key, ip, discordUserId);
  
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
    
    const daysRemaining = Math.ceil((license.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
    
    res.json({
      key: license.key,
      username: license.username,
      discordUserId: license.discordUserId,
      status: license.status,
      createdAt: license.createdAt,
      expiresAt: license.expiresAt,
      daysRemaining: daysRemaining,
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
        .setDescription('Durée en jours (défaut: 30 jours)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365)
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
  
  // Commande /link
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
  
  // Commande /unlink
  new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('[ADMIN] Délier une licence d\'un Discord User ID')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence')
        .setRequired(true)
    ),
  
  // ✅ NOUVELLE Commande /extend
  new SlashCommandBuilder()
    .setName('extend')
    .setDescription('[ADMIN] Prolonger une licence')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('days')
        .setDescription('Nombre de jours à ajouter')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(365)
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
  const adminCommands = ['generate', 'revoke', 'check', 'stats', 'logs', 'link', 'unlink', 'extend'];
  
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
        
      case 'extend':
        await handleExtendCommand(interaction);
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
      { name: '💎 Prix', value: `${(process.env.LICENSE_PRICE || 500) / 100}€`, inline: true },
      { name: '⏰ Durée', value: '30 jours', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '✨ Fonctionnalités', value: '• Vote automatique multi-serveurs\n• Synchronisation cooldown\n• Notifications Discord\n• Stats détaillées\n• Support 24/7', inline: false },
      { name: '⚠️ Important', value: '• Licence valable 30 jours\n• Liée à votre compte Discord\n• Discord User ID obligatoire', inline: false },
      { name: '🛒 Comment acheter ?', value: '1. Contactez un administrateur\n2. Effectuez le paiement\n3. Recevez votre licence instantanément\n4. Activez avec votre Discord User ID', inline: false }
    )
    .setFooter({ text: 'Auto Vote Bot • Licence 30 jours' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLicenseCommand(interaction) {
  const license = await License.findOne({ 
    discordUserId: interaction.user.id, 
    status: 'active' 
  });
  
  if (!license) {
    return interaction.reply({
      content: '❌ Vous n\'avez pas de licence active.\nUtilisez `/buy` pour en obtenir une !',
      ephemeral: true
    });
  }
  
  const daysRemaining = Math.ceil((license.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
  const isExpiringSoon = daysRemaining <= 7;
  
  const embed = new EmbedBuilder()
    .setColor(isExpiringSoon ? 0xf59e0b : 0x10b981)
    .setTitle('🔑 Votre Licence')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'Statut', value: '✅ Active', inline: true },
      { name: 'Utilisations', value: license.usageCount.toString(), inline: true },
      { name: '📅 Expire', value: `<t:${Math.floor(license.expiresAt.getTime() / 1000)}:F>`, inline: true }
    );
  
  if (daysRemaining > 0) {
    embed.addFields({
      name: '⏰ Temps restant',
      value: `${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}${isExpiringSoon ? ' ⚠️' : ''}`,
      inline: true
    });
  }
  
  if (license.lastUsed) {
    embed.addFields({
      name: 'Dernière utilisation',
      value: `<t:${Math.floor(license.lastUsed.getTime() / 1000)}:R>`,
      inline: false
    });
  }
  
  if (isExpiringSoon) {
    embed.setDescription('⚠️ Votre licence expire bientôt ! Contactez un admin pour renouveler.');
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
      { name: '📥 Installation', value: '1. Achetez une licence avec `/buy`\n2. Téléchargez l\'extension\n3. Entrez votre clé de licence\n4. **Entrez votre Discord User ID (obligatoire)**\n5. Profitez !', inline: false },
      { name: '🆔 Votre Discord User ID', value: `\`${interaction.user.id}\`\n\n⚠️ Vous devez entrer cet ID lors de l'activation de votre licence !`, inline: false },
      { name: '🔗 Comment trouver votre ID ?', value: '[Guide Discord](https://support.discord.com/hc/fr/articles/206346498)', inline: false },
      { name: '🆘 Support', value: 'Besoin d\'aide ? Contactez un administrateur', inline: false }
    )
    .setFooter({ text: 'Auto Vote Bot' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleGenerateCommand(interaction) {
  const targetUser = interaction.options.getUser('user');
  const duration = interaction.options.getInteger('duration') || 30;
  
  const expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
  
  try {
    const license = await createLicense(
      targetUser.id, 
      targetUser.username, 
      { 
        duration: duration,
        discordUserId: targetUser.id
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
          { name: '⏰ Durée', value: `${duration} jours`, inline: true },
          { name: '📅 Expire le', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          { name: '🆔 Discord User ID', value: `**⚠️ IMPORTANT - À COPIER :**\n\`${targetUser.id}\`\n\nCette licence est liée à votre compte Discord.\nVous **DEVEZ** entrer cet ID lors de l'activation !`, inline: false },
          { name: '📥 Installation', value: '1. Installez l\'extension Chrome\n2. Ouvrez le popup d\'activation\n3. Entrez votre clé de licence\n4. **Entrez votre Discord User ID** (obligatoire)\n5. Profitez !', inline: false }
        )
        .setFooter({ text: '⚠️ Gardez cette clé ET votre Discord User ID secrets !' })
        .setTimestamp();
      
      await targetUser.send({ embeds: [dmEmbed] });
    } catch (error) {
      console.error('Impossible d\'envoyer DM:', error);
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('✅ Licence générée')
      .addFields(
        { name: 'Utilisateur', value: `<@${targetUser.id}>`, inline: true },
        { name: 'Discord User ID', value: `\`${targetUser.id}\``, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: 'Clé', value: `\`${license.key}\``, inline: false },
        { name: '⏰ Durée', value: `${duration} jours`, inline: true },
        { name: '📅 Expire le', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: true }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
    
  } catch (error) {
    console.error('❌ Erreur génération licence:', error);
    await interaction.reply({
      content: `❌ Erreur lors de la génération : ${error.message}`,
      ephemeral: true
    });
  }
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
  
  const now = new Date();
  const daysRemaining = Math.ceil((license.expiresAt - now) / (1000 * 60 * 60 * 24));
  const isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;
  
  const embed = new EmbedBuilder()
    .setColor(
      license.status === 'expired' ? 0xef4444 : 
      isExpiringSoon ? 0xf59e0b : 
      0x10b981
    )
    .setTitle('🔍 Informations Licence')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'Utilisateur', value: license.username, inline: true },
      { name: '🆔 Discord User ID', value: `<@${license.discordUserId}>`, inline: true },
      { name: 'Statut', value: `${statusEmoji[license.status]} ${license.status}`, inline: true },
      { name: 'Utilisations', value: license.usageCount.toString(), inline: true },
      { name: 'IPs différentes', value: license.ipAddresses.length.toString(), inline: true },
      { name: 'Créée le', value: `<t:${Math.floor(license.createdAt.getTime() / 1000)}:F>`, inline: true }
    );
  
  // Affichage de l'expiration avec jours restants
  const expirationTimestamp = Math.floor(license.expiresAt.getTime() / 1000);
  let expirationText = `<t:${expirationTimestamp}:F>`;
  
  if (license.status === 'active') {
    if (daysRemaining > 0) {
      expirationText += `\n(${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} restant${daysRemaining > 1 ? 's' : ''})`;
      if (isExpiringSoon) {
        expirationText += ' ⚠️';
      }
    } else {
      expirationText += '\n(Expirée)';
    }
  }
  
  embed.addFields({
    name: '📅 Expire',
    value: expirationText,
    inline: true
  });
  
  if (license.lastUsed) {
    embed.addFields({
      name: 'Dernière utilisation',
      value: `<t:${Math.floor(license.lastUsed.getTime() / 1000)}:R>`,
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
      { name: '🔗 Liées Discord', value: stats.linked.toString(), inline: true },
      { name: '⚠️ Expirent bientôt', value: `${stats.expiringSoon} (7 jours)`, inline: true }
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
    const time = `<t:${Math.floor(log.timestamp.getTime() / 1000)}:R>`;
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
    .setDescription('⚠️ La licence peut maintenant être liée à un autre compte Discord.')
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleExtendCommand(interaction) {
  const key = interaction.options.getString('key');
  const days = interaction.options.getInteger('days');
  
  const license = await License.findOne({ key });
  
  if (!license) {
    return interaction.reply({
      content: '❌ Licence introuvable',
      ephemeral: true
    });
  }
  
  const oldExpiry = new Date(license.expiresAt);
  const newExpiry = new Date(license.expiresAt.getTime() + days * 24 * 60 * 60 * 1000);
  
  license.expiresAt = newExpiry;
  
  // Si la licence était expirée, la réactiver
  if (license.status === 'expired') {
    license.status = 'active';
  }
  
  await license.save();
  
  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('⏰ Licence Prolongée')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'Utilisateur', value: `<@${license.discordUserId}>`, inline: true },
      { name: 'Jours ajoutés', value: `+${days} jours`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: 'Ancienne expiration', value: `<t:${Math.floor(oldExpiry.getTime() / 1000)}:F>`, inline: false },
      { name: 'Nouvelle expiration', value: `<t:${Math.floor(newExpiry.getTime() / 1000)}:F>`, inline: false }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
  
  // Notifier l'utilisateur
  try {
    const user = await client.users.fetch(license.discordUserId);
    const dmEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🎉 Licence Prolongée !')
      .setDescription(`Votre licence a été prolongée de **${days} jours** !`)
      .addFields(
        { name: 'Nouvelle expiration', value: `<t:${Math.floor(newExpiry.getTime() / 1000)}:F>`, inline: false }
      )
      .setTimestamp();
    
    await user.send({ embeds: [dmEmbed] });
  } catch (error) {
    console.error('Impossible d\'envoyer DM:', error);
  }
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
