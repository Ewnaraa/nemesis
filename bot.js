// ========== BOT-OPTIMIZED.JS - VERSION FINALE ==========
// Optimisé pour ta structure Discord

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { connectDatabase, createLicense, verifyLicense, revokeLicense, getStats, License } = require('./database');

// ========== CONFIGURATION ==========
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',') || [];
const PREMIUM_ROLE_NAME = '👑 Premium';
const CHROME_STORE_URL = process.env.CHROME_STORE_URL || 'https://chrome.google.com/webstore/detail/VOTRE-ID-ICI';

// ⚠️ À CONFIGURER : IDs de tes channels Discord
const CHANNELS = {
  INSTALLATION: '1462220093382463498', // #📖-installation
  CHANGELOG: '1462219168551141642',    // #🔔-changelog
  TARIFS: '1462219956295962689',       // #💵-tarifs
  TICKETS: '1462220174395572414',      // #📨-tickets
  FAQ: '1462220144448372948'           // #❓-faq
};

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

app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'Nemesis Vote License API',
    version: '2.4.0'
  });
});

app.post('/api/verify', async (req, res) => {
  const { key } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!key) {
    return res.status(400).json({ valid: false, error: 'Clé requise' });
  }
  
  console.log(`[API] Vérification licence: ${key} depuis ${ip}`);
  
  const result = await verifyLicense(key, ip);
  
  res.json(result);
});

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
  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Acheter une licence Nemesis Vote'),
  
  new SlashCommandBuilder()
    .setName('license')
    .setDescription('Voir votre licence actuelle'),
  
  new SlashCommandBuilder()
    .setName('install')
    .setDescription('Guide d\'installation de l\'extension'),
  
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Aide et commandes disponibles'),
  
  // ADMIN
  new SlashCommandBuilder()
    .setName('generate')
    .setDescription('[ADMIN] Générer une licence')
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
  
  new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('[ADMIN] Révoquer une licence')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Raison')
        .setRequired(false)
    ),
  
  new SlashCommandBuilder()
    .setName('check')
    .setDescription('[ADMIN] Vérifier une licence')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('[ADMIN] Statistiques des licences'),
  
  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('[ADMIN] Logs d\'une licence')
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
    
    console.log('📝 [DISCORD] Enregistrement des commandes...');
    
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    
    console.log('✅ [DISCORD] Commandes enregistrées');
  } catch (error) {
    console.error('❌ [DISCORD] Erreur enregistrement:', error);
  }
}

// ========== GESTION DES COMMANDES ==========

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName, user } = interaction;
  
  const isAdmin = ADMIN_IDS.includes(user.id);
  const adminCommands = ['generate', 'revoke', 'check', 'stats', 'logs'];
  
  if (adminCommands.includes(commandName) && !isAdmin) {
    return interaction.reply({
      content: '❌ Commande réservée aux administrateurs.',
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
      case 'install':
        await handleInstallCommand(interaction);
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
    }
  } catch (error) {
    console.error(`❌ [COMMAND] Erreur ${commandName}:`, error);
    await interaction.reply({
      content: '❌ Une erreur est survenue.',
      ephemeral: true
    });
  }
});

// ========== HANDLERS ==========

async function handleBuyCommand(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('💰 Acheter Nemesis Vote')
    .setDescription('**Extension Chrome pour voter automatiquement !**')
    .addFields(
      { name: '💎 Prix', value: `${process.env.LICENSE_PRICE / 100}€`, inline: true },
      { name: '⏰ Durée', value: process.env.LICENSE_DURATION === '0' ? 'À vie' : `${process.env.LICENSE_DURATION} jours`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '✨ Fonctionnalités', value: '• Vote auto Karnak & Hyperion\n• Sync cooldown automatique\n• Notifications Discord/Chrome\n• Stats détaillées\n• Support 24/7', inline: false },
      { name: '🎮 Serveurs supportés', value: '• Karnak Retro\n• Hyperion\n• Autres bientôt...', inline: false },
      { name: '🛒 Comment acheter ?', value: `Consultez <#${CHANNELS.TARIFS}> pour les prix\nContactez un admin pour le paiement`, inline: false }
    )
    .setFooter({ text: 'Nemesis Vote v2.4.0 • Licence à vie' })
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
  
  // Avertissement si proche de la limite IP
  let ipWarning = '';
  if (license.ipAddresses.length >= 2) {
    ipWarning = '\n⚠️ **Attention:** Vous approchez de la limite de 3 IPs différentes !';
  }
  
  const embed = new EmbedBuilder()
    .setColor(license.ipAddresses.length >= 3 ? 0xf59e0b : 0x10b981)
    .setTitle('🔑 Ma Licence Nemesis Vote')
    .setDescription(`Clé: \`${license.key}\`${ipWarning}`)
    .addFields(
      { name: '📊 Statut', value: '✅ Active', inline: true },
      { name: '🔢 Utilisations', value: license.usageCount.toString(), inline: true },
      { name: '🌐 IPs', value: `${license.ipAddresses.length}/3`, inline: true },
      { name: '⏰ Expire', value: license.expiresAt ? new Date(license.expiresAt).toLocaleDateString('fr-FR') : 'Jamais ♾️', inline: true }
    )
    .setFooter({ text: 'Gardez votre clé secrète • Ne la partagez jamais' })
    .setTimestamp();
  
  if (license.lastUsed) {
    embed.addFields({
      name: '🕐 Dernière utilisation',
      value: new Date(license.lastUsed).toLocaleString('fr-FR'),
      inline: false
    });
  }
  
  const installButton = new ButtonBuilder()
    .setLabel('📥 Installer l\'extension')
    .setURL(CHROME_STORE_URL)
    .setStyle(ButtonStyle.Link);
  
  const row = new ActionRowBuilder().addComponents(installButton);
  
  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleInstallCommand(interaction) {
  const license = await License.findOne({ userId: interaction.user.id, status: 'active' });
  
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('📥 Installation Nemesis Vote')
    .setDescription(license 
      ? '**Suivez ce guide pour installer l\'extension :**'
      : `⚠️ **Vous devez d\'abord acheter une licence !**\n\nConsultez <#${CHANNELS.TARIFS}> puis utilisez \`/buy\``
    );
  
  if (license) {
    embed.addFields(
      { 
        name: '1️⃣ Télécharger', 
        value: `Cliquez sur "📥 Installer" ci-dessous`, 
        inline: false 
      },
      { 
        name: '2️⃣ Installer', 
        value: 'Bouton "Ajouter à Chrome" → Confirmer', 
        inline: false 
      },
      { 
        name: '3️⃣ Activer', 
        value: `Ouvrir l\'extension et entrer:\n\`${license.key}\``, 
        inline: false 
      },
      { 
        name: '4️⃣ Configurer', 
        value: 'Username + Password du jeu\nActiver le bot toggle', 
        inline: false 
      },
      { 
        name: '✅ C\'est prêt !', 
        value: 'Vote automatique toutes les 1h30', 
        inline: false 
      },
      {
        name: '❓ Besoin d\'aide ?',
        value: `<#${CHANNELS.FAQ}> ou <#${CHANNELS.TICKETS}>`,
        inline: false
      }
    )
    .setFooter({ text: 'Guide complet dans #📖-installation' });
    
    const installButton = new ButtonBuilder()
      .setLabel('📥 Installer l\'extension')
      .setURL(CHROME_STORE_URL)
      .setStyle(ButtonStyle.Link);
    
    const guideButton = new ButtonBuilder()
      .setLabel('📖 Guide détaillé')
      .setURL(`https://discord.com/channels/${interaction.guildId}/${CHANNELS.INSTALLATION}`)
      .setStyle(ButtonStyle.Link);
    
    const row = new ActionRowBuilder().addComponents(installButton, guideButton);
    
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

async function handleHelpCommand(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('📖 Aide Nemesis Vote')
    .setDescription('**Commandes disponibles:**')
    .addFields(
      { name: '💰 /buy', value: 'Informations d\'achat', inline: true },
      { name: '🔑 /license', value: 'Ma licence', inline: true },
      { name: '📥 /install', value: 'Guide installation', inline: true },
      { name: '❓ /help', value: 'Cette aide', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📚 Guides', value: `<#${CHANNELS.INSTALLATION}>\n<#${CHANNELS.FAQ}>`, inline: true },
      { name: '💬 Support', value: `<#${CHANNELS.TICKETS}>`, inline: true },
      { name: '🔔 Nouveautés', value: `<#${CHANNELS.CHANGELOG}>`, inline: true }
    )
    .setFooter({ text: 'Nemesis Vote v2.4.0' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleGenerateCommand(interaction) {
  const targetUser = interaction.options.getUser('user');
  const duration = interaction.options.getInteger('duration') || 0;
  
  const expiresAt = duration > 0 ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null;
  
  const license = await createLicense(targetUser.id, targetUser.username, { expiresAt });
  
  // Donner le rôle Premium
  try {
    const member = await interaction.guild.members.fetch(targetUser.id);
    const role = interaction.guild.roles.cache.find(r => r.name === PREMIUM_ROLE_NAME);
    if (role) {
      await member.roles.add(role);
      console.log(`✅ Rôle ${PREMIUM_ROLE_NAME} ajouté à ${targetUser.username}`);
    }
  } catch (error) {
    console.error('❌ Erreur ajout rôle:', error);
  }
  
  // DM à l'utilisateur
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🎉 Licence Nemesis Vote Activée !')
      .setDescription(`**Votre clé de licence :**\n\n\`\`\`${license.key}\`\`\``)
      .addFields(
        { 
          name: '📥 Installation rapide', 
          value: '1. Cliquez sur "Installer" ci-dessous\n2. Ajoutez à Chrome\n3. Ouvrez l\'extension\n4. Entrez votre clé\n5. Configurez vos identifiants\n6. Activez le bot !', 
          inline: false 
        },
        {
          name: '🔒 Sécurité',
          value: '• Maximum 3 ordinateurs différents\n• Licence révocable si abus détecté\n• **Ne partagez jamais votre clé !**',
          inline: false
        },
        {
          name: '💡 Conseils',
          value: `• Consultez <#${CHANNELS.INSTALLATION}> pour le guide complet\n• Activez les notifications Discord pour suivre vos votes\n• Besoin d\'aide ? <#${CHANNELS.TICKETS}>`,
          inline: false
        }
      )
      .setFooter({ text: 'Bienvenue dans Nemesis Vote ! Support 24/7' })
      .setTimestamp();
    
    const installButton = new ButtonBuilder()
      .setLabel('📥 Installer l\'extension')
      .setURL(CHROME_STORE_URL)
      .setStyle(ButtonStyle.Link);
    
    const guideButton = new ButtonBuilder()
      .setLabel('📖 Guide complet')
      .setURL(`https://discord.com/channels/${interaction.guildId}/${CHANNELS.INSTALLATION}`)
      .setStyle(ButtonStyle.Link);
    
    const row = new ActionRowBuilder().addComponents(installButton, guideButton);
    
    await targetUser.send({ embeds: [dmEmbed], components: [row] });
    console.log(`✅ DM envoyé à ${targetUser.username}`);
  } catch (error) {
    console.error('❌ Impossible d\'envoyer DM:', error);
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('✅ Licence Générée')
    .addFields(
      { name: 'Utilisateur', value: `<@${targetUser.id}>`, inline: true },
      { name: 'Clé', value: `\`${license.key}\``, inline: true },
      { name: 'Expire', value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : 'Jamais', inline: true }
    )
    .setFooter({ text: `Générée par ${interaction.user.username}` })
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
    .setTitle('🚫 Licence Révoquée')
    .addFields(
      { name: 'Clé', value: `\`${key}\``, inline: false },
      { name: 'Raison', value: reason, inline: false },
      { name: 'Par', value: `<@${interaction.user.id}>`, inline: true }
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
  
  const color = license.status === 'active' ? 0x10b981 : 0xef4444;
  
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('🔍 Licence - Détails')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'Utilisateur', value: `<@${license.userId}>`, inline: true },
      { name: 'Statut', value: `${statusEmoji[license.status]} ${license.status.toUpperCase()}`, inline: true },
      { name: 'Utilisations', value: license.usageCount.toString(), inline: true },
      { name: 'IPs différentes', value: `${license.ipAddresses.length}/3`, inline: true },
      { name: 'Créée', value: `<t:${Math.floor(license.createdAt.getTime() / 1000)}:R>`, inline: true },
      { name: 'Expire', value: license.expiresAt ? `<t:${Math.floor(license.expiresAt.getTime() / 1000)}:R>` : 'Jamais', inline: true }
    );
  
  if (license.lastUsed) {
    embed.addFields({
      name: 'Dernière utilisation',
      value: `<t:${Math.floor(license.lastUsed.getTime() / 1000)}:R>`,
      inline: false
    });
  }
  
  // Liste des IPs
  if (license.ipAddresses.length > 0) {
    const ips = license.ipAddresses
      .slice(0, 3)
      .map(ip => `\`${ip.ip}\` - <t:${Math.floor(ip.lastSeen.getTime() / 1000)}:R>`)
      .join('\n');
    
    embed.addFields({
      name: '🌐 Adresses IP',
      value: ips,
      inline: false
    });
  }
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStatsCommand(interaction) {
  const stats = await getStats();
  
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('📊 Statistiques Nemesis Vote')
    .addFields(
      { name: 'Total', value: stats.total.toString(), inline: true },
      { name: 'Actives', value: `✅ ${stats.active}`, inline: true },
      { name: 'Révoquées', value: `🚫 ${stats.revoked}`, inline: true },
      { name: 'Expirées', value: `⏰ ${stats.expired}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '\u200B', value: '\u200B', inline: true }
    )
    .setFooter({ text: `Demandé par ${interaction.user.username}` })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLogsCommand(interaction) {
  const key = interaction.options.getString('key');
  
  const { Log } = require('./database');
  const logs = await Log.find({ licenseKey: key })
    .sort({ timestamp: -1 })
    .limit(10);
  
  if (logs.length === 0) {
    return interaction.reply({
      content: '❌ Aucun log trouvé',
      ephemeral: true
    });
  }
  
  const logText = logs.map(log => {
    const emoji = log.success ? '✅' : '❌';
    const time = `<t:${Math.floor(log.timestamp.getTime() / 1000)}:R>`;
    return `${emoji} \`${log.action}\` ${time} - \`${log.ip || 'N/A'}\``;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle('📋 Logs Récents')
    .setDescription(`**Licence:** \`${key}\`\n\n${logText}`)
    .setFooter({ text: `${logs.length} logs affichés` })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ========== DÉMARRAGE ==========

async function start() {
  console.log('🚀 [BOT] Démarrage Nemesis Vote...');
  
  const dbConnected = await connectDatabase();
  if (!dbConnected) {
    console.error('❌ [BOT] Impossible de démarrer sans BDD');
    process.exit(1);
  }
  
  await client.login(process.env.DISCORD_TOKEN);
  
  client.once('ready', async () => {
    console.log(`✅ [DISCORD] Connecté: ${client.user.tag}`);
    console.log(`📊 [DISCORD] ${client.guilds.cache.size} serveur(s)`);
    await registerCommands();
  });
  
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`✅ [API] Port ${port}`);
    console.log(`🌐 [API] ${CHROME_STORE_URL}`);
  });
}

process.on('unhandledRejection', (error) => {
  console.error('❌ [ERROR]', error);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 [BOT] Arrêt...');
  await client.destroy();
  process.exit(0);
});

start();
