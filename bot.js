// ========== BOT.JS - BOT DISCORD + API ==========

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const { connectDatabase, createLicense, verifyLicense, revokeLicense, getStats, License, Log } = require('./database');
const { 
  recordReferral, 
  getReferralStats, 
  updateReferralOnPurchase,
  getOrCreateReferral
} = require('./referral-system');

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

// ✅ NOUVEAU CODE - CORS avec Chrome Extension
app.use(cors({
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origine (comme Postman)
    if (!origin) return callback(null, true);
    
    // Autoriser toutes les extensions Chrome
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    
    // Autoriser localhost pour dev
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Autoriser ton domaine Netlify si tu en as un
    if (origin.includes('netlify.app')) {
      return callback(null, true);
    }
    
    // Bloquer les autres
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
  const { key, discordUserId, isRealUsage } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!key) {
    return res.status(400).json({ valid: false, error: 'Clé requise' });
  }
  
  if (!discordUserId) {
    return res.status(400).json({ valid: false, error: 'Discord User ID requis' });
  }
  
  const usageType = isRealUsage ? '[USAGE]' : '[CHECK]';
  console.log(`[API] ${usageType} Licence: ${key} depuis ${ip} (Discord: ${discordUserId})`);
  
  const result = await verifyLicense(key, ip, discordUserId, isRealUsage || false);
  
  res.json(result);
});
// Enregistrer un parrainage
app.post('/api/referral/record', async (req, res) => {
  const { referrerCode, referredUserId, referredUsername } = req.body;
  
  if (!referrerCode || !referredUserId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Code parrain et Discord User ID requis' 
    });
  }
  
  console.log(`[API] [REFERRAL] ${referredUsername} utilise code: ${referrerCode}`);
  
  const result = await recordReferral(referrerCode, referredUserId, referredUsername);
  
  res.json(result);
});

// Stats de parrainage
app.get('/api/referral/:discordUserId', async (req, res) => {
  const { discordUserId } = req.params;
  
  try {
    const stats = await getReferralStats(discordUserId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[API] [REFERRAL] Erreur:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});
// Obtenir info sur une licence
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
      lastVerified: license.lastVerified,
      usageCount: license.usageCount,
      verificationCount: license.verificationCount,
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
        .setDescription('Clé de licence')
        .setRequired(false)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Utilisateur Discord')
        .setRequired(false)
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
        .setRequired(false)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Utilisateur Discord')
        .setRequired(false)
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
        .setRequired(false)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Utilisateur Discord')
        .setRequired(false)
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
  
  // Commande /extend
  new SlashCommandBuilder()
    .setName('extend')
    .setDescription('[ADMIN] Prolonger une licence')
    .addIntegerOption(option =>
      option
        .setName('days')
        .setDescription('Nombre de jours à ajouter')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(365)
    )
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('Clé de licence')
        .setRequired(false)
    )
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Utilisateur Discord')
        .setRequired(false)
    ),
  
  // Commande /userinfo
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('[ADMIN] Info rapide sur un utilisateur')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Utilisateur Discord')
        .setRequired(true)
    ),
  
  // Commande /userlogs
  new SlashCommandBuilder()
    .setName('userlogs')
    .setDescription('[ADMIN] Logs rapides d\'un utilisateur')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Utilisateur Discord')
        .setRequired(true)
    ),
  
  // Commande /licenses
  new SlashCommandBuilder()
    .setName('licenses')
    .setDescription('[ADMIN] Liste toutes les licences')
    .addStringOption(option =>
      option
        .setName('filter')
        .setDescription('Filtrer par statut')
        .setRequired(false)
        .addChoices(
          { name: '✅ Actives uniquement', value: 'active' },
          { name: '⏰ Expirent bientôt (7j)', value: 'expiring' },
          { name: '🚫 Révoquées', value: 'revoked' },
          { name: '⏱️ Expirées', value: 'expired' },
          { name: '📊 Toutes', value: 'all' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('Nombre max de résultats (défaut: 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    ),
  
  // Commande /cleanup
  new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('[ADMIN] Nettoyer les anciennes licences')
    .addIntegerOption(option =>
      option
        .setName('days')
        .setDescription('Supprimer les licences expirées/révoquées depuis X jours')
        .setRequired(true)
        .setMinValue(30)
        .setMaxValue(365)
    )
    .addBooleanOption(option =>
      option
        .setName('confirm')
        .setDescription('Confirmer la suppression (True = oui)')
        .setRequired(true)
    ),
  // Commande /referral
  new SlashCommandBuilder()
    .setName('referral')
    .setDescription('Voir vos statistiques de parrainage'),

  // Commande /refer (ADMIN)
  new SlashCommandBuilder()
    .setName('refer')
    .setDescription('[ADMIN] Enregistrer un parrainage manuellement')
    .addUserOption(option =>
      option
        .setName('referrer')
        .setDescription('Utilisateur parrain')
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName('referred')
        .setDescription('Utilisateur filleul')
        .setRequired(true)
    ),
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
  const adminCommands = ['generate', 'revoke', 'check', 'stats', 'logs', 'link', 'unlink', 'extend', 'userinfo', 'userlogs', 'licenses', 'cleanup'];
  
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
        
      case 'userinfo':
        await handleUserInfoCommand(interaction);
        break;
        
      case 'userlogs':
        await handleUserLogsCommand(interaction);
        break;
        
      case 'licenses':
        await handleLicensesCommand(interaction);
        break;
        
      case 'cleanup':
        await handleCleanupCommand(interaction);
        break;
        case 'referral':
      await handleReferralCommand(interaction);
      break;
      
    case 'refer':
      await handleReferCommand(interaction);
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
      { name: '🎮 Votes effectués', value: license.usageCount.toString(), inline: true },
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
      name: 'Dernier vote',
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
      { name: '🔥 Installation', value: '1. Achetez une licence avec `/buy`\n2. Téléchargez l\'extension\n3. Entrez votre clé de licence\n4. **Entrez votre Discord User ID (obligatoire)**\n5. Profitez !', inline: false },
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
          { name: '🆔 Discord User ID', value: `**⚠️ IMPORTANT - À COPIER :**\n\`${targetUser.id}\`\n\nCette licence est **automatiquement liée** à votre compte Discord.\nVous **DEVEZ** entrer cet ID lors de l'activation !`, inline: false },
          { name: '🔥 Installation', value: '1. Installez l\'extension Chrome\n2. Ouvrez le popup d\'activation\n3. Entrez votre clé de licence\n4. **Entrez votre Discord User ID** (obligatoire)\n5. Profitez !', inline: false }
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
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'Non spécifiée';
  
  if (!key && !user) {
    return interaction.reply({
      content: '❌ Vous devez fournir soit une clé, soit un utilisateur.',
      ephemeral: true
    });
  }
  
  let license;
  
  if (user) {
    license = await License.findOne({ 
      discordUserId: user.id,
      status: 'active'
    });
    
    if (!license) {
      return interaction.reply({
        content: `❌ Aucune licence active trouvée pour <@${user.id}>`,
        ephemeral: true
      });
    }
  } else {
    license = await License.findOne({ key });
    
    if (!license) {
      return interaction.reply({
        content: '❌ Licence introuvable',
        ephemeral: true
      });
    }
  }
  
  const result = await revokeLicense(license.key, reason);
  
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
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'Utilisateur', value: `<@${license.discordUserId}>`, inline: true },
      { name: 'Raison', value: reason, inline: false }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCheckCommand(interaction) {
  const key = interaction.options.getString('key');
  const user = interaction.options.getUser('user');
  
  if (!key && !user) {
    return interaction.reply({
      content: '❌ Vous devez fournir soit une clé, soit un utilisateur.',
      ephemeral: true
    });
  }
  
  let license;
  
  if (user) {
    license = await License.findOne({ 
      discordUserId: user.id,
      status: 'active'
    });
    
    if (!license) {
      license = await License.findOne({ discordUserId: user.id })
        .sort({ createdAt: -1 });
      
      if (!license) {
        return interaction.reply({
          content: `❌ Aucune licence trouvée pour <@${user.id}>`,
          ephemeral: true
        });
      }
    }
  } else {
    license = await License.findOne({ key });
    
    if (!license) {
      return interaction.reply({
        content: '❌ Licence introuvable',
        ephemeral: true
      });
    }
  }
  
  await handleCheckWithLicense(interaction, license);
}

async function handleCheckWithLicense(interaction, license) {
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
      { name: '🎮 Votes effectués', value: license.usageCount.toString(), inline: true },
      { name: '🔍 Vérifications', value: license.verificationCount.toString(), inline: true },
      { name: 'IPs différentes', value: license.ipAddresses.length.toString(), inline: true },
      { name: 'Créée le', value: `<t:${Math.floor(license.createdAt.getTime() / 1000)}:F>`, inline: true }
    );
  
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
      name: '🎮 Dernier vote',
      value: `<t:${Math.floor(license.lastUsed.getTime() / 1000)}:R>`,
      inline: true
    });
  }
  
  if (license.lastVerified) {
    embed.addFields({
      name: '🔍 Dernière vérification',
      value: `<t:${Math.floor(license.lastVerified.getTime() / 1000)}:R>`,
      inline: true
    });
  }
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStatsCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const stats = await getStats();
    
    const topUsers = await License.find({ status: 'active' })
      .sort({ usageCount: -1 })
      .limit(5);
    
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
      );
    
    if (topUsers.length > 0) {
      const topUsersText = topUsers.map((license, index) => {
        const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
        return `${medal} <@${license.discordUserId}> - ${license.usageCount} votes`;
      }).join('\n');
      
      embed.addFields({
        name: '🏆 Top 5 Utilisateurs',
        value: topUsersText,
        inline: false
      });
    }
    
    embed.setFooter({ text: 'Auto Vote Bot' });
    embed.setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('❌ [STATS] Erreur:', error);
    await interaction.editReply({
      content: '❌ Erreur lors de la récupération des statistiques'
    });
  }
}

async function handleLogsCommand(interaction) {
  const key = interaction.options.getString('key');
  const user = interaction.options.getUser('user');
  
  if (!key && !user) {
    return interaction.reply({
      content: '❌ Vous devez fournir soit une clé, soit un utilisateur.',
      ephemeral: true
    });
  }
  
  let license;
  
  if (user) {
    license = await License.findOne({ discordUserId: user.id })
      .sort({ createdAt: -1 });
    
    if (!license) {
      return interaction.reply({
        content: `❌ Aucune licence trouvée pour <@${user.id}>`,
        ephemeral: true
      });
    }
  } else {
    license = await License.findOne({ key });
    
    if (!license) {
      return interaction.reply({
        content: '❌ Licence introuvable',
        ephemeral: true
      });
    }
  }
  
  const logs = await Log.find({ licenseKey: license.key })
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
    .setDescription(`**Licence:** \`${license.key}\`\n**User:** <@${license.discordUserId}>\n\n${logText}`)
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
  const days = interaction.options.getInteger('days');
  const key = interaction.options.getString('key');
  const user = interaction.options.getUser('user');
  
  if (!key && !user) {
    return interaction.reply({
      content: '❌ Vous devez fournir soit une clé, soit un utilisateur.',
      ephemeral: true
    });
  }
  
  let license;
  
  if (user) {
    license = await License.findOne({ discordUserId: user.id })
      .sort({ createdAt: -1 });
    
    if (!license) {
      return interaction.reply({
        content: `❌ Aucune licence trouvée pour <@${user.id}>`,
        ephemeral: true
      });
    }
  } else {
    license = await License.findOne({ key });
    
    if (!license) {
      return interaction.reply({
        content: '❌ Licence introuvable',
        ephemeral: true
      });
    }
  }
  
  const oldExpiry = new Date(license.expiresAt);
  const newExpiry = new Date(license.expiresAt.getTime() + days * 24 * 60 * 60 * 1000);
  
  license.expiresAt = newExpiry;
  
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
  
  try {
    const discordUser = await client.users.fetch(license.discordUserId);
    const dmEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('🎉 Licence Prolongée !')
      .setDescription(`Votre licence a été prolongée de **${days} jours** !`)
      .addFields(
        { name: 'Nouvelle expiration', value: `<t:${Math.floor(newExpiry.getTime() / 1000)}:F>`, inline: false }
      )
      .setTimestamp();
    
    await discordUser.send({ embeds: [dmEmbed] });
  } catch (error) {
    console.error('Impossible d\'envoyer DM:', error);
  }
}

async function handleUserInfoCommand(interaction) {
  const user = interaction.options.getUser('user');
  
  const license = await License.findOne({ 
    discordUserId: user.id,
    status: 'active'
  });
  
  if (!license) {
    const anyLicense = await License.findOne({ discordUserId: user.id })
      .sort({ createdAt: -1 });
    
    if (!anyLicense) {
      return interaction.reply({
        content: `❌ <@${user.id}> n'a pas de licence`,
        ephemeral: true
      });
    }
    
    return handleCheckWithLicense(interaction, anyLicense);
  }
  
  return handleCheckWithLicense(interaction, license);
}

async function handleUserLogsCommand(interaction) {
  const user = interaction.options.getUser('user');
  
  const license = await License.findOne({ discordUserId: user.id })
    .sort({ createdAt: -1 });
  
  if (!license) {
    return interaction.reply({
      content: `❌ <@${user.id}> n'a pas de licence`,
      ephemeral: true
    });
  }
  
  const logs = await Log.find({ licenseKey: license.key })
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
    .setDescription(`**User:** <@${user.id}>\n**Licence:** \`${license.key}\`\n\n${logText}`)
    .setFooter({ text: `${logs.length} logs affichés` })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLicensesCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const filter = interaction.options.getString('filter') || 'active';
  const limit = interaction.options.getInteger('limit') || 10;
  
  try {
    let query = {};
    const now = new Date();
    
    switch (filter) {
      case 'active':
        query = { status: 'active', expiresAt: { $gte: now } };
        break;
      case 'expiring':
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        query = { 
          status: 'active',
          expiresAt: { $lte: in7Days, $gte: now }
        };
        break;
      case 'revoked':
        query = { status: 'revoked' };
        break;
      case 'expired':
        query = { status: 'expired' };
        break;
      case 'all':
        query = {};
        break;
    }
    
    const licenses = await License.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);
    
    // Mettre à jour statuts expirés
    for (const license of licenses) {
      if (license.status === 'active' && license.expiresAt < now) {
        license.status = 'expired';
        await license.save();
        console.log(`🔄 [CLEANUP] Licence ${license.key} marquée comme expirée`);
      }
    }
    
    // Re-filtrer si actives seulement
    let filteredLicenses = licenses;
    if (filter === 'active') {
      filteredLicenses = licenses.filter(l => l.status === 'active' && l.expiresAt >= now);
    }
    
    if (filteredLicenses.length === 0) {
      return interaction.editReply({
        content: '❌ Aucune licence trouvée avec ce filtre'
      });
    }
    
    const total = await License.countDocuments(query);
    
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle('📋 Liste des Licences')
      .setDescription(`**Filtre:** ${getFilterName(filter)}\n**Affichées:** ${filteredLicenses.length}/${total}`)
      .setTimestamp();
    
    for (const license of filteredLicenses) {
      const daysRemaining = Math.ceil((license.expiresAt - now) / (1000 * 60 * 60 * 24));
      
      let statusEmoji = '';
      let expiryText = '';
      
      switch (license.status) {
        case 'active':
          if (daysRemaining <= 7 && daysRemaining > 0) {
            statusEmoji = '⚠️';
            expiryText = `Expire dans ${daysRemaining}j`;
          } else if (daysRemaining > 0) {
            statusEmoji = '✅';
            expiryText = `${daysRemaining}j restants`;
          } else {
            statusEmoji = '⏱️';
            expiryText = 'Expirée';
          }
          break;
        case 'revoked':
          statusEmoji = '🚫';
          expiryText = 'Révoquée';
          break;
        case 'expired':
          statusEmoji = '⏱️';
          expiryText = 'Expirée';
          break;
      }
      
      const userName = license.discordUserId 
        ? `<@${license.discordUserId}>` 
        : license.username;
      
      const fieldValue = [
        `**Clé:** \`${license.key}\``,
        `**User:** ${userName}`,
        `**Statut:** ${statusEmoji} ${expiryText}`,
        `**Votes:** ${license.usageCount} | **Checks:** ${license.verificationCount}`,
        `**Créée:** <t:${Math.floor(license.createdAt.getTime() / 1000)}:R>`
      ].join('\n');
      
      embed.addFields({
        name: `${license.username}`,
        value: fieldValue,
        inline: false
      });
    }
    
    if (total > limit) {
      embed.setFooter({ 
        text: `⚠️ ${total - limit} licence(s) supplémentaire(s) non affichée(s). Augmente la limite.` 
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('❌ [LICENSES] Erreur:', error);
    await interaction.editReply({
      content: '❌ Erreur lors de la récupération des licences'
    });
  }
}

function getFilterName(filter) {
  const names = {
    'active': '✅ Actives uniquement',
    'expiring': '⚠️ Expirent bientôt (7j)',
    'revoked': '🚫 Révoquées',
    'expired': '⏱️ Expirées',
    'all': '📊 Toutes'
  };
  return names[filter] || filter;
}

async function handleCleanupCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const days = interaction.options.getInteger('days');
  const confirm = interaction.options.getBoolean('confirm');
  
  if (!confirm) {
    return interaction.editReply({
      content: '❌ Vous devez confirmer avec `confirm:True` pour supprimer'
    });
  }
  
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const revokedCount = await License.countDocuments({
      status: 'revoked',
      createdAt: { $lt: cutoffDate }
    });
    
    const expiredCount = await License.countDocuments({
      status: 'expired',
      expiresAt: { $lt: cutoffDate }
    });
    
    if (revokedCount === 0 && expiredCount === 0) {
      return interaction.editReply({
        content: `ℹ️ Aucune licence à nettoyer (plus de ${days} jours)`
      });
    }
    
    const deletedRevoked = await License.deleteMany({
      status: 'revoked',
      createdAt: { $lt: cutoffDate }
    });
    
    const deletedExpired = await License.deleteMany({
      status: 'expired',
      expiresAt: { $lt: cutoffDate }
    });
    
    const deletedLogs = await Log.deleteMany({
      timestamp: { $lt: cutoffDate }
    });
    
    const resultEmbed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('✅ Nettoyage terminé')
      .addFields(
        { name: '🚫 Révoquées supprimées', value: deletedRevoked.deletedCount.toString(), inline: true },
        { name: '⏱️ Expirées supprimées', value: deletedExpired.deletedCount.toString(), inline: true },
        { name: '📋 Logs supprimés', value: deletedLogs.deletedCount.toString(), inline: true }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [resultEmbed] });
    
  } catch (error) {
    console.error('❌ [CLEANUP] Erreur:', error);
    await interaction.editReply({
      content: '❌ Erreur lors du nettoyage'
    });
  }
}

// ========== HANDLERS PARRAINAGE ==========

async function handleReferralCommand(interaction) {
  const stats = await getReferralStats(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('🎁 Votre Programme de Parrainage')
    .setDescription('Invitez vos amis et gagnez des réductions !')
    .addFields(
      { 
        name: '📌 Votre code de parrainage', 
        value: `\`${stats.code}\`\n\n💡 **C'est votre code de parrainage !**\nVos amis l'entrent lors de l'activation de leur licence.`, 
        inline: false 
      },
      { name: '👥 Total parrainés', value: stats.totalReferrals.toString(), inline: true },
      { name: '✅ Actifs (avec licence)', value: stats.activeReferrals.toString(), inline: true },
      { name: '💰 Réduction actuelle', value: `${stats.discount}%`, inline: true }
    );
  
  if (stats.lifetimeEarnings > 0) {
    embed.addFields({
      name: '🎉 Total économisé',
      value: `${stats.lifetimeEarnings.toFixed(2)}€`,
      inline: true
    });
  }
  
  if (stats.referredBy) {
    embed.addFields({
      name: '🙏 Parrainé par',
      value: `<@${stats.referredBy}>`,
      inline: true
    });
  }
  
  embed.addFields({
    name: '📋 Comment ça marche ?',
    value: '1️⃣ Partagez **votre code de parrainage** (ci-dessus) avec vos amis\n2️⃣ Ils l\'entrent dans le champ "Code de parrainage" lors de l\'activation\n3️⃣ Vous gagnez **10% de réduction** par filleul actif\n4️⃣ Les réductions sont **cumulables** (max 50%)',
    inline: false
  });
  
  // Liste des filleuls
  if (stats.hasReferrals && stats.referrals && stats.referrals.length > 0) {
    const referralsList = stats.referrals
      .slice(0, 5)
      .map(r => {
        const status = r.hasActiveLicense ? '✅' : '⏳';
        const spent = r.totalSpent > 0 ? ` (${r.totalSpent}€)` : '';
        return `${status} ${r.username}${spent}`;
      })
      .join('\n');
    
    embed.addFields({
      name: `👥 Vos filleuls (${stats.referrals.length})`,
      value: referralsList,
      inline: false
    });
  }
  
  embed.setFooter({ text: 'Plus vous parrainez, plus vous économisez !' });
  embed.setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleReferCommand(interaction) {
  const isAdmin = ADMIN_IDS.includes(interaction.user.id);
  
  if (!isAdmin) {
    return interaction.reply({
      content: '❌ Cette commande est réservée aux administrateurs.',
      ephemeral: true
    });
  }
  
  const referrer = interaction.options.getUser('referrer');
  const referred = interaction.options.getUser('referred');
  
  const result = await recordReferral(referrer.id, referred.id, referred.username);
  
  if (!result.success) {
    return interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true
    });
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('✅ Parrainage Enregistré')
    .addFields(
      { name: '🎯 Parrain', value: `<@${referrer.id}>`, inline: true },
      { name: '👤 Filleul', value: `<@${referred.id}>`, inline: true }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
// ========== DÉMARRAGE ==========

async function start() {
  console.log('🚀 [BOT] Démarrage...');
  
  const dbConnected = await connectDatabase();
  if (!dbConnected) {
    console.error('❌ [BOT] Impossible de démarrer sans base de données');
    process.exit(1);
  }
  
  await client.login(process.env.DISCORD_TOKEN);
  
  client.once('ready', async () => {
    console.log(`✅ [DISCORD] Connecté: ${client.user.tag}`);
    
    try {
      console.log('🔄 [DISCORD] Tentative enregistrement commandes...');
      await registerCommands();
      console.log('✅ [DISCORD] Commandes enregistrées avec succès');
    } catch (error) {
      console.error('❌ [DISCORD] Erreur enregistrement commandes:', error);
    }
    
    // Nettoyage automatique des statuts expirés
    try {
      console.log('🧹 [CLEANUP] Vérification des licences expirées...');
      
      const expiredLicenses = await License.updateMany(
        {
          status: 'active',
          expiresAt: { $lt: new Date() }
        },
        {
          $set: { status: 'expired' }
        }
      );
      
      if (expiredLicenses.modifiedCount > 0) {
        console.log(`✅ [CLEANUP] ${expiredLicenses.modifiedCount} licence(s) marquée(s) comme expirée(s)`);
      } else {
        console.log('✅ [CLEANUP] Aucune licence expirée à nettoyer');
      }
      
    } catch (error) {
      console.error('❌ [CLEANUP] Erreur nettoyage:', error);
    }
  });
  
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`✅ [API] En écoute sur port ${port}`);
    console.log(`🌐 API URL: http://localhost:${port}`);
  });
}

process.on('unhandledRejection', (error) => {
  console.error('❌ [ERROR] Unhandled rejection:', error);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 [BOT] Arrêt...');
  await client.destroy();
  process.exit(0);
});


start();
