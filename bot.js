// ========== BOT.JS - BOT DISCORD + API ==========

require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  ChannelType // ✅ AJOUTER
} = require('discord.js');
const { 
  LICENSE_PRICES, 
  RECHARGE_AMOUNTS,
  getBalance,
  addBalance,
  deductBalance,
  getTransactionHistory,
  createPendingRecharge,
  cleanExpiredRecharges
} = require('./shop-system');

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { changelogData } = require('./changelog-data.js');

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
const LOGS_CHANNEL_ID = '1464405330531193078';
const GUILD_ID = '1462219100171534551'; // 

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

// ✅ AJOUTER CETTE LIGNE ICI
app.options('*', cors());

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
  
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             req.ip;
  console.log('[API] [VERIFY] IP réelle:', ip);
  
  if (!key) {
    return res.status(400).json({ valid: false, error: 'Clé requise' });
  }
  
  if (!discordUserId) {
    return res.status(400).json({ valid: false, error: 'Discord User ID requis' });
  }
  
  const usageType = isRealUsage ? '[USAGE]' : '[CHECK]';
  console.log(`[API] ${usageType} Licence: ${key} depuis ${ip} (Discord: ${discordUserId})`);
  
  const result = await verifyLicense(key, ip, discordUserId, isRealUsage || false);
  
  // ✅ LOGS DISCORD
if (result.valid && isRealUsage) {
  const now = new Date();
  const nextVote = new Date(now.getTime() + (91 * 60 * 1000)); // 91 minutes
  
  await sendLogToChannel('success', `Vote réussi`, {
    user: result.license.username,
    licenseKey: key,
    fields: [
      { name: '🎮 Serveur', value: req.body.serverId || 'Inconnu', inline: true },
      { name: '📊 Total Votes', value: `${result.license.usageCount}`, inline: true },
      { name: '🌐 IP', value: ip, inline: true },
      { name: '🕒 Heure', value: `<t:${Math.floor(now.getTime() / 1000)}:T>`, inline: true },
      { 
        name: '⏰ Prochain Vote', 
        value: `<t:${Math.floor(nextVote.getTime() / 1000)}:t> (<t:${Math.floor(nextVote.getTime() / 1000)}:R>)`, 
        inline: true 
      }
    ]
  });
} else if (!result.valid) {
  const now = new Date();
  
  await sendLogToChannel('error', `Vote échoué`, {
    discordUserId: discordUserId,
    fields: [
      { name: '🔑 Clé', value: `\`${key.substring(0, 9)}...\``, inline: true },
      { name: '❌ Erreur', value: result.error, inline: true },
      { name: '🕒 Heure', value: `<t:${Math.floor(now.getTime() / 1000)}:T>`, inline: true }
    ]
  });
}
  
  res.json(result);
});

// ==================== WEBHOOK PAYPAL ====================
app.post('/webhook/paypal', async (req, res) => {
  try {
    console.log('[PAYPAL] 📩 Webhook reçu:', req.body);
    
    // TODO: Vérifier signature PayPal (sécurité)
    
    const payment = req.body;
    
    // Extraire Discord User ID de la note PayPal
    const discordUserId = payment.note || payment.custom || payment.item_name;
    
    if (!discordUserId) {
      console.error('[PAYPAL] ❌ Pas de Discord User ID dans la note');
      return res.status(400).send('Missing Discord ID');
    }
    
    const amount = parseFloat(payment.mc_gross || payment.amount);
    
    if (!amount || amount <= 0) {
      console.error('[PAYPAL] ❌ Montant invalide:', amount);
      return res.status(400).send('Invalid amount');
    }
    
    console.log('[PAYPAL] 💰 Paiement:', {
      discordUserId,
      amount,
      txnId: payment.txn_id
    });
    
    // Créditer le solde
    const newBalance = await addBalance(
      discordUserId,
      amount,
      'Recharge PayPal',
      payment.txn_id
    );
    
    console.log('[PAYPAL] ✅ Solde crédité:', newBalance);
    
    // Notifier l'user sur Discord
    try {
      const user = await client.users.fetch(discordUserId);
      
      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle('✅ Rechargement confirmé')
        .setDescription(`Votre solde a été crédité de **${amount.toFixed(2)}€**`)
        .addFields(
          { name: '💰 Nouveau solde', value: `${newBalance.toFixed(2)}€`, inline: true },
          { name: '🔢 Transaction', value: payment.txn_id || 'N/A', inline: true }
        )
        .setFooter({ text: 'Nemesis Vote • Système de paiement' })
        .setTimestamp();
      
      await user.send({ embeds: [embed] });
      
      console.log('[PAYPAL] 📨 User notifié');
      
    } catch (error) {
      console.error('[PAYPAL] ❌ Erreur notification user:', error);
    }
    
    // Log admin
    await sendLogToChannel('success', `Rechargement PayPal reçu`, {
      fields: [
        { name: '👤 Utilisateur', value: `<@${discordUserId}>`, inline: true },
        { name: '💰 Montant', value: `${amount.toFixed(2)}€`, inline: true },
        { name: '💳 Nouveau solde', value: `${newBalance.toFixed(2)}€`, inline: true },
        { name: '🔢 Transaction', value: payment.txn_id || 'N/A', inline: false }
      ]
    });
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('[PAYPAL] ❌ Erreur webhook:', error);
    res.status(500).send('Error');
  }
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
 
  new SlashCommandBuilder()
  .setName('shop')
  .setDescription('💎 Boutique Nemesis - Recharger solde et acheter licences'),
  // Commande /license
  new SlashCommandBuilder()
    .setName('license')
    .setDescription('Voir votre licence actuelle'),
  
  new SlashCommandBuilder()
  .setName('mylogs')
  .setDescription('📊 Accéder à vos logs personnels'),
  new SlashCommandBuilder()
  .setName('resetlogs')
  .setDescription('[ADMIN] Reset le channel de logs d\'un utilisateur')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('Utilisateur')
      .setRequired(true)
  ),
  
  new SlashCommandBuilder()
  .setName('help')
  .setDescription('📚 Affiche le menu d\'aide interactif')
  .addStringOption(option =>
    option
      .setName('categorie')
      .setDescription('Catégorie spécifique')
      .setRequired(false)
      .addChoices(
        { name: '🔑 Gestion Licences', value: 'licenses' },
        { name: '📊 Stats & Suivi', value: 'stats' },
        { name: '👑 Admin', value: 'admin' },
        { name: '❓ Support', value: 'support' }
      )
  ),
  
  // ========== COMMANDES ADMIN ==========
  new SlashCommandBuilder()
  .setName('changelog')
  .setDescription('📋 Voir les dernières mises à jour'),
  
  new SlashCommandBuilder()
  .setName('clean-invalid')
  .setDescription('[ADMIN] Supprimer les licences corrompues (sans discordUserId ou expiresAt)'),
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
  
new SlashCommandBuilder()
  .setName('fix-channels')
  .setDescription('[ADMIN] Créer les channels manquants pour toutes les licences actives'),

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
  // Dans le tableau commands
new SlashCommandBuilder()
  .setName('unsuspend')
  .setDescription('[ADMIN] Lever la suspension d\'une licence')
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

// ✅ AJOUTER CETTE COMMANDE ICI
new SlashCommandBuilder()
  .setName('reset-ips')
  .setDescription('[ADMIN] Réinitialiser les IPs d\'une licence')
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
  // ✅ HANDLER BOUTONS
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, userId] = interaction.customId.split('_');

  try {
    switch (action) {
      case 'renew':
        await interaction.reply({
          content: '💳 Pour renouveler, contactez un admin ou utilisez `/generate`.',
          ephemeral: true
        });
        break;

      case 'stats':
        const license = await License.findOne({ discordUserId: userId });
        if (!license) {
          return interaction.reply({
            content: '❌ Licence introuvable.',
            ephemeral: true
          });
        }

        const statsEmbed = new EmbedBuilder()
          .setColor('#6366f1')
          .setTitle('📊 Statistiques Détaillées')
          .addFields(
            { name: '📈 Votes Total', value: `${license.usageCount}`, inline: true },
            { name: '✅ Taux Réussite', value: '95%', inline: true }, // À calculer
            { name: '🎁 Tokens Gagnés', value: `${license.usageCount * 2}`, inline: true },
            { name: '🔍 Vérifications', value: `${license.verificationCount}`, inline: true },
            { name: '📱 IPs Uniques', value: `${license.ipAddresses.length}`, inline: true },
            { name: '⏰ Dernier Vote', value: license.lastUsedAt ? `<t:${Math.floor(license.lastUsedAt.getTime() / 1000)}:R>` : 'Jamais', inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
        break;

      case 'logs':
        const logs = await Log.find({ licenseKey: userId }).sort({ timestamp: -1 }).limit(10);
        
        if (logs.length === 0) {
          return interaction.reply({
            content: '📋 Aucun log disponible.',
            ephemeral: true
          });
        }

        const logsEmbed = new EmbedBuilder()
          .setColor('#8b5cf6')
          .setTitle('📋 Derniers Logs')
          .setDescription(
            logs.map(log => {
              const emoji = log.action === 'verify' ? '✅' : log.action === 'usage' ? '🎮' : '📊';
              return `${emoji} \`${log.action}\` - <t:${Math.floor(log.timestamp.getTime() / 1000)}:R>`;
            }).join('\n')
          )
          .setTimestamp();

        await interaction.reply({ embeds: [logsEmbed], ephemeral: true });
        break;
    }
  } catch (error) {
    console.error('[BUTTON] Erreur:', error);
    await interaction.reply({
      content: '❌ Erreur lors du traitement.',
      ephemeral: true
    });
  }
});
  // Vérifier si admin pour commandes admin
  const isAdmin = ADMIN_IDS.includes(user.id);
  const adminCommands = ['generate', 'revoke', 'check', 'stats', 'logs', 'link', 'unlink', 'extend', 'userinfo', 'userlogs', 'licenses', 'cleanup', 'reset-ips'];
  
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
        
      case 'changelog':
        // ✅ VÉRIFICATION ADMIN
  if (!ADMIN_IDS.includes(interaction.user.id)) {
    return interaction.reply({
      content: '❌ Cette commande est réservée aux administrateurs.',
      flags: MessageFlags.Ephemeral
    });
  }
  const versions = ['2.4.0', '2.5.0', '2.6.0','2.6.1'];
  const embeds = [];
  
  for (const version of versions) {
    const info = changelogData[version];
    if (!info) continue;
    
    const embed = new EmbedBuilder()
      .setColor(version === '2.6.1' ? '#10b981' : '#6366f1')
      .setTitle(`${info.title} - v${version}`)
      .setDescription(info.description)
      .setFooter({ text: `Nemesis Vote • ${info.date}` });
    
    if (info.features && info.features.length > 0) {
      embed.addFields({
        name: '✨ Nouveautés',
        value: info.features.join('\n'),
        inline: false
      });
    }
    
    if (info.improvements && info.improvements.length > 0) {
      embed.addFields({
        name: '⚡ Améliorations',
        value: info.improvements.join('\n'),
        inline: false
      });
    }
    
    embeds.push(embed);
  }
  
  await interaction.reply({ 
    content: `📋 **Historique des mises à jour** (demandé par ${interaction.user.username})`,
    embeds: embeds
  });
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
        
        case 'fix-channels':
  await handleFixChannelsCommand(interaction);
  break;
        case 'mylogs':
  await handleMyLogsCommand(interaction);
  break;
        case 'clean-invalid':
  await handleCleanInvalidCommand(interaction);
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
        case 'shop':
  await handleShopCommand(interaction);
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
        case 'resetlogs':
  await handleResetLogsCommand(interaction);
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
        case 'unsuspend':
  await handleUnsuspendCommand(interaction);
  break;
// ✅ AJOUTER CE CASE ICI
case 'reset-ips':
  await handleResetIpsCommand(interaction);
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
// ==================== HANDLER MENU RECHARGE ====================
async function handleRechargeMenu(interaction) {
  try {
    const balance = await getBalance(interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('💳 RECHARGEMENT DE SOLDE')
      .setDescription(`💰 **Solde actuel :** ${balance.toFixed(2)}€\n\nSélectionnez un montant à recharger`)
      .setFooter({ text: 'Nemesis Vote • Rechargement' })
      .setTimestamp();
    
    const menu = new StringSelectMenuBuilder()
      .setCustomId('recharge_amount_menu')
      .setPlaceholder('Montant à recharger...')
      .addOptions(
        RECHARGE_AMOUNTS.map(amount => ({
          label: `${amount}€`,
          description: `Recharger ${amount}€ via PayPal`,
          value: amount.toString(),
          emoji: '💵'
        }))
      );
    
    const row = new ActionRowBuilder().addComponents(menu);
    
    await interaction.update({ 
      embeds: [embed], 
      components: [row]
    });
    
  } catch (error) {
    console.error('[RECHARGE] Erreur menu:', error);
    await interaction.update({
      content: '❌ Erreur lors du chargement du menu.',
      embeds: [],
      components: []
    });
  }
}

// ==================== HANDLER CONFIRMATION RECHARGE ====================
async function handleRechargeConfirm(interaction, amount) {
  try {
    const expiresAt = await createPendingRecharge(interaction.user.id, amount);
    
    const embed = new EmbedBuilder()
      .setColor('#f59e0b')
      .setTitle(`💰 Rechargement de ${amount.toFixed(2)}€`)
      .setDescription('**Instructions de paiement PayPal**')
      .addFields(
        { 
          name: '📧 Email PayPal', 
          value: '`voteno0zly@outlook.com`', 
          inline: false 
        },
        { 
          name: '🔢 ID à mettre dans la note de paiement', 
          value: `\`${interaction.user.id}\``, 
          inline: false 
        },
        { 
          name: '💶 Montant exact', 
          value: `**${amount.toFixed(2)}€**`, 
          inline: true 
        },
        { 
          name: '⏰ Expire dans', 
          value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, 
          inline: true 
        }
      )
      .setFooter({ text: '⚠️ N\'oubliez pas de mettre votre ID dans la note de paiement !' })
      .setTimestamp();
    
    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('recharge_sent')
          .setLabel('✅ J\'ai envoyé le paiement')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('recharge_cancel')
          .setLabel('❌ Annuler')
          .setStyle(ButtonStyle.Danger)
      );
    
    await interaction.update({ 
      embeds: [embed], 
      components: [buttons]
    });
    
  } catch (error) {
    console.error('[RECHARGE] Erreur confirmation:', error);
    await interaction.update({
      content: '❌ Erreur lors de la création de la recharge.',
      embeds: [],
      components: []
    });
  }
}

// ==================== HANDLER MENU ACHAT ====================
async function handleBuyMenu(interaction) {
  try {
    const balance = await getBalance(interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setColor('#8b5cf6')
      .setTitle('🛒 ACHETER UNE LICENCE')
      .setDescription(`💰 **Votre solde :** ${balance.toFixed(2)}€\n\nSélectionnez la durée de votre licence`)
      .setFooter({ text: 'Nemesis Vote • Achat de licence' })
      .setTimestamp();
    
    const options = [
      {
        days: 30,
        price: LICENSE_PRICES[30],
        discount: null
      },
      {
        days: 90,
        price: LICENSE_PRICES[90],
        discount: '-20%'
      },
      {
        days: 180,
        price: LICENSE_PRICES[180],
        discount: '-33%'
      },
      {
        days: 365,
        price: LICENSE_PRICES[365],
        discount: '-42%'
      }
    ];
    
    const menu = new StringSelectMenuBuilder()
      .setCustomId('buy_duration_menu')
      .setPlaceholder('Durée de la licence...')
      .addOptions(
        options.map(opt => {
          const label = opt.discount 
            ? `${opt.days} jours - ${opt.price.toFixed(2)}€ (${opt.discount})`
            : `${opt.days} jours - ${opt.price.toFixed(2)}€`;
          
          const canAfford = balance >= opt.price;
          
          return {
            label: label,
            description: canAfford ? 'Vous pouvez acheter cette licence' : '❌ Solde insuffisant',
            value: opt.days.toString(),
            emoji: '📅'
          };
        })
      );
    
    const row = new ActionRowBuilder().addComponents(menu);
    
    await interaction.update({ 
      embeds: [embed], 
      components: [row]
    });
    
  } catch (error) {
    console.error('[BUY] Erreur menu:', error);
    await interaction.update({
      content: '❌ Erreur lors du chargement du menu.',
      embeds: [],
      components: []
    });
  }
}

// ==================== HANDLER CONFIRMATION ACHAT ====================
async function handleBuyConfirm(interaction, days) {
  try {
    const balance = await getBalance(interaction.user.id);
    const price = LICENSE_PRICES[days];
    
    if (balance < price) {
      return await interaction.update({
        content: `❌ Solde insuffisant. Vous avez ${balance.toFixed(2)}€ mais cette licence coûte ${price.toFixed(2)}€.`,
        embeds: [],
        components: []
      });
    }
    
    const newBalance = balance - price;
    
    const embed = new EmbedBuilder()
      .setColor('#8b5cf6')
      .setTitle('✅ CONFIRMATION D\'ACHAT')
      .setDescription('**Récapitulatif de votre achat**')
      .addFields(
        { 
          name: '📅 Licence', 
          value: `${days} jours`, 
          inline: true 
        },
        { 
          name: '💰 Prix', 
          value: `${price.toFixed(2)}€`, 
          inline: true 
        },
        { 
          name: '💳 Solde actuel', 
          value: `${balance.toFixed(2)}€`, 
          inline: true 
        },
        { 
          name: '📊 Nouveau solde', 
          value: `${newBalance.toFixed(2)}€`, 
          inline: true 
        }
      )
      .setFooter({ text: 'Nemesis Vote • Confirmation d\'achat' })
      .setTimestamp();
    
    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`buy_confirm_${days}`)
          .setLabel('✅ Confirmer l\'achat')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('buy_cancel')
          .setLabel('❌ Annuler')
          .setStyle(ButtonStyle.Danger)
      );
    
    await interaction.update({ 
      embeds: [embed], 
      components: [buttons]
    });
    
  } catch (error) {
    console.error('[BUY] Erreur confirmation:', error);
    await interaction.update({
      content: '❌ Erreur lors de la confirmation.',
      embeds: [],
      components: []
    });
  }
}

// ==================== HANDLER ACHAT FINAL ====================
async function handleBuyFinal(interaction, days) {
  try {
    const price = LICENSE_PRICES[days];
    const balance = await getBalance(interaction.user.id);
    
    if (balance < price) {
      return await interaction.update({
        content: `❌ Solde insuffisant.`,
        embeds: [],
        components: []
      });
    }
    
    // Générer la licence
    const { createLicense } = require('./database');
    const license = await createLicense(interaction.user.id, days);
    
    // Débiter le solde
    const newBalance = await deductBalance(
      interaction.user.id, 
      price, 
      `Achat licence ${days} jours`,
      license.key
    );
    
    const embed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('✅ ACHAT RÉUSSI !')
      .setDescription('**Votre licence a été générée avec succès**')
      .addFields(
        { 
          name: '🔑 Clé de licence', 
          value: `\`${license.key}\``, 
          inline: false 
        },
        { 
          name: '📅 Durée', 
          value: `${days} jours`, 
          inline: true 
        },
        { 
          name: '📆 Expire le', 
          value: `<t:${Math.floor(license.expiresAt.getTime() / 1000)}:D>`, 
          inline: true 
        },
        { 
          name: '💰 Nouveau solde', 
          value: `${newBalance.toFixed(2)}€`, 
          inline: true 
        }
      )
      .setFooter({ text: 'Nemesis Vote • Merci pour votre achat !' })
      .setTimestamp();
    
    await interaction.update({ 
      embeds: [embed], 
      components: []
    });
    
    // Log admin
    await sendLogToChannel('success', `Achat de licence via le shop`, {
      fields: [
        { name: '👤 Utilisateur', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📅 Durée', value: `${days} jours`, inline: true },
        { name: '💰 Prix', value: `${price.toFixed(2)}€`, inline: true },
        { name: '🔑 Clé', value: license.key, inline: false }
      ]
    });
    
  } catch (error) {
    console.error('[BUY] Erreur achat final:', error);
    await interaction.update({
      content: '❌ Erreur lors de l\'achat. Contactez un administrateur.',
      embeds: [],
      components: []
    });
  }
}

// ==================== HANDLER HISTORIQUE ====================
async function handleHistoryMenu(interaction) {
  try {
    const transactions = await getTransactionHistory(interaction.user.id, 10);
    const balance = await getBalance(interaction.user.id);
    
    if (transactions.length === 0) {
      const embed = new EmbedBuilder()
        .setColor('#6366f1')
        .setTitle('📊 HISTORIQUE DES TRANSACTIONS')
        .setDescription('Aucune transaction pour le moment.')
        .addFields({ 
          name: '💰 Solde actuel', 
          value: `${balance.toFixed(2)}€`, 
          inline: true 
        })
        .setFooter({ text: 'Nemesis Vote • Historique' })
        .setTimestamp();
      
      return await interaction.update({ 
        embeds: [embed], 
        components: []
      });
    }
    
    const historyText = transactions.map(tx => {
      const emoji = tx.type === 'credit' ? '✅' : '❌';
      const sign = tx.type === 'credit' ? '+' : '-';
      const date = `<t:${Math.floor(tx.timestamp.getTime() / 1000)}:d>`;
      
      return `${emoji} ${sign}${tx.amount.toFixed(2)}€ - ${tx.reason} (${date})`;
    }).join('\n');
    
    const embed = new EmbedBuilder()
      .setColor('#6366f1')
      .setTitle('📊 HISTORIQUE DES TRANSACTIONS')
      .setDescription(historyText)
      .addFields({ 
        name: '💰 Solde actuel', 
        value: `${balance.toFixed(2)}€`, 
        inline: true 
      })
      .setFooter({ text: 'Nemesis Vote • Historique (10 dernières transactions)' })
      .setTimestamp();
    
    await interaction.update({ 
      embeds: [embed], 
      components: []
    });
    
  } catch (error) {
    console.error('[HISTORY] Erreur:', error);
    await interaction.update({
      content: '❌ Erreur lors du chargement de l\'historique.',
      embeds: [],
      components: []
    });
  }
} // ✅ ACCOLADE FERMANTE ICI

// ✅ SUPPRIME TOUT CE CODE ORPHELIN (lignes avec "const row" etc.)

async function handleFixChannelsCommand(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const licenses = await License.find({ 
      status: 'active',
      logChannelId: null
    });
    
    let created = 0;
    let errors = 0;
    
    for (const license of licenses) {
      try {
        const channel = await createUserLogChannel(license.discordUserId, license.username);
        
        if (channel) {
          license.logChannelId = channel.id;
          await license.save();
          created++;
          console.log(`[FIX-CHANNELS] ✅ Channel créé pour ${license.username}`);
        } else {
          errors++;
          console.log(`[FIX-CHANNELS] ❌ Échec pour ${license.username}`);
        }
      } catch (error) {
        errors++;
        console.error(`[FIX-CHANNELS] Erreur pour ${license.username}:`, error);
      }
    }
    
    await interaction.editReply({
      content: `✅ Terminé !\n\n📊 Channels créés : ${created}\n❌ Erreurs : ${errors}\n📋 Total licences : ${licenses.length}`,
      flags: MessageFlags.Ephemeral
    });
    
  } catch (error) {
    console.error('[FIX-CHANNELS] Erreur:', error);
    await interaction.editReply({
      content: '❌ Erreur lors de la création des channels.',
      flags: MessageFlags.Ephemeral
    });
  }
}
async function handleResetLogsCommand(interaction) {
  try {
    const targetUser = interaction.options.getUser('user');
    
    const license = await License.findOne({ 
      discordUserId: targetUser.id 
    });

    if (!license) {
      return interaction.reply({
        content: '❌ Aucune licence trouvée pour cet utilisateur.',
        flags: MessageFlags.Ephemeral
      });
    }

    license.logChannelId = null;
    await license.save();

    await interaction.reply({
      content: `✅ Channel de logs reset pour ${targetUser.username}. Ils peuvent utiliser \`/mylogs\` pour le recréer.`,
      flags: MessageFlags.Ephemeral
    });

  } catch (error) {
    console.error('[RESETLOGS] Erreur:', error);
    await interaction.reply({
      content: '❌ Erreur.',
      flags: MessageFlags.Ephemeral
    });
  }
}
async function handleResetIpsCommand(interaction) {
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
    license = await License.findOne({ discordUserId: user.id });
  } else {
    license = await License.findOne({ key });
  }
  
  if (!license) {
    return interaction.reply({
      content: '❌ Licence introuvable',
      ephemeral: true
    });
  }
  
  const oldIPCount = license.ipAddresses.length;
  
  // Réinitialiser les IPs
  license.ipAddresses = [];
  await license.save();
  
  await Log.create({
    licenseKey: license.key,
    action: 'IP_RESET',
    success: true,
    discordUserId: license.discordUserId,
    error: `Reset par admin - ${oldIPCount} IPs supprimées`
  });
  
  console.log(`🧹 [RESET-IPS] Licence ${license.key} - ${oldIPCount} IPs supprimées par ${interaction.user.tag}`);
  
  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('🧹 IPs Réinitialisées')
    .setDescription('Les adresses IP ont été réinitialisées avec succès')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: true },
      { name: 'User', value: `<@${license.discordUserId}>`, inline: true },
      { name: 'IPs supprimées', value: oldIPCount.toString(), inline: true }
    )
    .setFooter({ text: 'La licence peut maintenant être utilisée normalement' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleMyLogsCommand(interaction) {
  try {
    console.log('[MYLOGS] Recherche licence pour:', interaction.user.id);
    
    const license = await License.findOne({ 
      discordUserId: interaction.user.id,
      status: 'active'
    });

    console.log('[MYLOGS] Licence trouvée:', license ? 'OUI' : 'NON');

    if (!license) {
      return interaction.reply({
        content: '❌ Aucune licence active trouvée.',
        flags: MessageFlags.Ephemeral
      });
    }

    console.log('[MYLOGS] logChannelId actuel:', license.logChannelId);

    if (!license.logChannelId) {
      console.log('[MYLOGS] Tentative création channel...');
      
      // Essayer de créer le channel
      const channel = await createUserLogChannel(interaction.user.id, license.username);
      
      console.log('[MYLOGS] Channel créé:', channel ? channel.id : 'ECHEC');
      
      if (channel) {
        license.logChannelId = channel.id;
        await license.save();
        console.log('[MYLOGS] Channel ID sauvegardé dans DB');
        
        return interaction.reply({
          content: `📊 Votre channel de logs vient d'être créé : <#${channel.id}>`,
          flags: MessageFlags.Ephemeral
        });
      } else {
        return interaction.reply({
          content: '⚠️ Impossible de créer votre channel de logs. Contactez un admin.',
          flags: MessageFlags.Ephemeral
        });
      }
    }

    console.log('[MYLOGS] Channel existe déjà, vérification...');
    
    // Vérifier que le channel existe vraiment
    try {
      const channel = await client.channels.fetch(license.logChannelId);
      console.log('[MYLOGS] Channel fetch OK:', channel.name);
      
      await interaction.reply({
        content: `📊 Voici votre channel de logs : <#${license.logChannelId}>`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('[MYLOGS] Channel introuvable, reset et recréation...');
      
      // Channel n'existe plus, recréer
      license.logChannelId = null;
      await license.save();
      
      const channel = await createUserLogChannel(interaction.user.id, license.username);
      
      if (channel) {
        license.logChannelId = channel.id;
        await license.save();
        
        return interaction.reply({
          content: `📊 Votre channel de logs a été recréé : <#${channel.id}>`,
          flags: MessageFlags.Ephemeral
        });
      } else {
        return interaction.reply({
          content: '⚠️ Impossible de créer votre channel de logs. Contactez un admin.',
          flags: MessageFlags.Ephemeral
        });
      }
    }

  } catch (error) {
    console.error('[MYLOGS] Erreur:', error);
    await interaction.reply({
      content: '❌ Erreur lors de la récupération de vos logs.',
      flags: MessageFlags.Ephemeral
    });
  }
}
async function handleUnsuspendCommand(interaction) {
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
    license = await License.findOne({ discordUserId: user.id });
  } else {
    license = await License.findOne({ key });
  }
  
  if (!license) {
    return interaction.reply({
      content: '❌ Licence introuvable',
      ephemeral: true
    });
  }
  
  if (license.status !== 'suspended') {
    return interaction.reply({
      content: `⚠️ Cette licence n'est pas suspendue (statut: ${license.status})`,
      ephemeral: true
    });
  }
  
  // Lever la suspension
  license.status = 'active';
  license.suspendedUntil = null;
  await license.save();
  
  const embed = new EmbedBuilder()
    .setColor(0x10b981)
    .setTitle('✅ Suspension Levée')
    .addFields(
      { name: 'Clé', value: `\`${license.key}\``, inline: false },
      { name: 'User', value: `<@${license.discordUserId}>`, inline: true },
      { name: 'IPs', value: `${license.ipAddresses.length} IP(s)`, inline: true },
      { name: 'Statut', value: 'ACTIVE', inline: true }
    )
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
  
  // Notifier le user
  try {
    const discordUser = await client.users.fetch(license.discordUserId);
    await discordUser.send({
      embeds: [new EmbedBuilder()
        .setColor(0x10b981)
        .setTitle('✅ Licence Réactivée')
        .setDescription('Votre licence a été réactivée par un administrateur.')
        .addFields({
          name: 'Note',
          value: 'Assurez-vous de ne pas partager votre licence pour éviter une nouvelle suspension.',
          inline: false
        })
      ]
    });
  } catch (error) {
    console.error('Impossible d\'envoyer DM:', error);
  }
}
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
  const category = interaction.options.getString('categorie');

  // ✅ MENU PRINCIPAL avec séparation claire
  if (!category) {
    const isAdmin = ADMIN_IDS.includes(interaction.user.id);

    const mainEmbed = new EmbedBuilder()
      .setColor('#6366f1')
      .setTitle('📚 Menu d\'Aide Nemesis Vote')
      .setDescription('Sélectionnez une catégorie ci-dessous pour voir les commandes disponibles.')
      .addFields(
        {
          name: '👤 Pour Tous les Utilisateurs',
          value: '━━━━━━━━━━━━━━━━━━━━',
          inline: false
        },
        {
          name: '📊 Mes Informations',
          value: 'Vérifier ma licence, mes stats, mon parrainage',
          inline: false
        },
        {
          name: '❓ Support',
          value: 'Aide, documentation, contact',
          inline: false
        }
      );

    // ✅ Afficher section admin SEULEMENT si admin
    if (isAdmin) {
      mainEmbed.addFields(
        {
          name: '\u200B',
          value: '👑 **Réservé aux Administrateurs**\n━━━━━━━━━━━━━━━━━━━━',
          inline: false
        },
        {
          name: '🔑 Gestion Licences',
          value: 'Générer, révoquer, prolonger, gérer les licences',
          inline: false
        },
        {
          name: '📈 Administration',
          value: 'Stats globales, logs système, maintenance',
          inline: false
        }
      );
    }

    mainEmbed.setFooter({ text: isAdmin ? '👑 Vous avez accès aux commandes admin' : '👤 Utilisateur standard' });

    const menuOptions = [
      {
        label: 'Mes Informations',
        description: 'Vérifier licence, stats, parrainage',
        value: 'user',
        emoji: '📊'
      },
      {
        label: 'Support',
        description: 'Aide et documentation',
        value: 'support',
        emoji: '❓'
      }
    ];

    // ✅ Ajouter options admin SEULEMENT si admin
    if (isAdmin) {
      menuOptions.push(
        {
          label: '─────────────',
          description: 'Commandes Admin',
          value: 'separator',
          emoji: '👑'
        },
        {
          label: 'Gestion Licences',
          description: '[ADMIN] Gérer les licences',
          value: 'licenses',
          emoji: '🔑'
        },
        {
          label: 'Administration',
          description: '[ADMIN] Stats et maintenance',
          value: 'admin',
          emoji: '📈'
        }
      );
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('help_menu')
          .setPlaceholder('📂 Choisir une catégorie')
          .addOptions(menuOptions)
      );

    return interaction.reply({
      embeds: [mainEmbed],
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }

  // ✅ CATÉGORIES DÉTAILLÉES
  const categories = {
    user: {
      title: '👤 Mes Informations',
      color: '#10b981',
      adminOnly: false,
      commands: [
        { 
          name: '/check', 
          desc: 'Vérifier le statut de votre licence',
          usage: '/check key:XXXX-XXXX-XXXX-XXXX'
        },
        { 
          name: '/referral', 
          desc: 'Voir votre code de parrainage et vos filleuls',
          usage: '/referral'
        },
        { 
          name: '/mylogs', // ✅ AJOUTE ICI
        value: '📊 Accéder à votre channel de logs personnels\n**Exemple:** `/mylogs`', 
        inline: false 
      }
      ]
    },
    support: {
      title: '❓ Support & Aide',
      color: '#8b5cf6',
      adminOnly: false,
      commands: [
        { 
          name: '/help', 
          desc: 'Afficher ce menu d\'aide',
          usage: '/help [catégorie]'
        }
      ],
      links: [
        '📖 [Documentation](https://docs.nemesis.vote)',
        '💬 [Discord Support](https://discord.gg/nemesis)',
        '💬 [-> Ticket] #🎫-tickets',
        '📧 Email: support@nemesis.vote'
      ]
    },
    licenses: {
      title: '🔑 Gestion Licences',
      color: '#ef4444',
      adminOnly: true,
      commands: [
        { 
          name: '/generate', 
          desc: 'Générer une nouvelle licence (30 jours)',
          usage: '/generate username:Matt discord_id:123456789'
        },
        { 
          name: '/check', 
          desc: 'Vérifier le statut d\'une licence',
          usage: '/check key:XXXX-XXXX-XXXX-XXXX'
        },
        { 
          name: '/revoke', 
          desc: 'Révoquer définitivement une licence',
          usage: '/revoke key:XXXX raison:"Partage de compte"'
        },
        { 
          name: '/extend', 
          desc: 'Prolonger une licence de 30 jours',
          usage: '/extend key:XXXX-XXXX-XXXX-XXXX'
        },
        { 
          name: '/reset-ips', 
          desc: 'Réinitialiser les IPs d\'une licence',
          usage: '/reset-ips key:XXXX ou user:@Matt'
        },
        { 
          name: '/unsuspend', 
          desc: 'Lever la suspension d\'une licence',
          usage: '/unsuspend key:XXXX ou user:@Matt'
        }
      ]
    },
    admin: {
      title: '📈 Administration',
      color: '#6366f1',
      adminOnly: true,
      commands: [
        { 
          name: '/userinfo', 
          desc: 'Voir les infos détaillées d\'un utilisateur',
          usage: '/userinfo user:@Matt'
        },
        { 
          name: '/userlogs', 
          desc: 'Consulter l\'historique des logs',
          usage: '/userlogs key:XXXX ou user:@Matt'
        },
        { 
          name: '/stats', 
          desc: 'Statistiques globales du système',
          usage: '/stats'
        },
        { 
          name: '/licenses', 
          desc: 'Liste des licences avec filtres',
          usage: '/licenses filter:actives'
        },
        { 
          name: '/cleanup', 
          desc: 'Nettoyer les licences expirées',
          usage: '/cleanup days:30'
        },
         { 
        name: '/resetlogs', // ✅ AJOUTE ICI
        value: '🔄 Reset le channel de logs d\'un utilisateur\n**Exemple:** `/resetlogs user:@User`', 
        inline: false 
      }
      ]
    }
  };

  const cat = categories[category];
  if (!cat) {
    return interaction.reply({
      content: '❌ Catégorie invalide.',
      flags: MessageFlags.Ephemeral
    });
  }

  // ✅ Vérifier si l'utilisateur a le droit d'accéder à cette catégorie
  if (cat.adminOnly && !ADMIN_IDS.includes(interaction.user.id)) {
    return interaction.reply({
      content: '❌ Cette section est réservée aux administrateurs.',
      flags: MessageFlags.Ephemeral
    });
  }

  const embed = new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(cat.title);

  // ✅ Afficher les commandes avec usage
  if (cat.commands) {
    const description = cat.commands.map(cmd => 
      `**${cmd.name}**\n${cmd.desc}\n\`${cmd.usage}\``
    ).join('\n\n');
    
    embed.setDescription(description);
  }

  // ✅ Ajouter liens si présents
  if (cat.links) {
    embed.addFields({
      name: '🔗 Liens Utiles',
      value: cat.links.join('\n')
    });
  }

  // ✅ Footer avec badge admin
  embed.setFooter({ 
    text: cat.adminOnly ? '👑 Commande réservée aux administrateurs' : '👤 Disponible pour tous'
  });

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}


// ✅ HANDLER SELECT MENU
// ==================== HANDLER SELECT MENUS ====================
client.on('interactionCreate', async (interaction) => {
  if (interaction.isStringSelectMenu()) {
    
    // Menu principal shop
    if (interaction.customId === 'shop_menu') {
      const choice = interaction.values[0];
      
      switch (choice) {
        case 'recharge':
          await handleRechargeMenu(interaction);
          break;
        case 'buy':
          await handleBuyMenu(interaction);
          break;
        case 'history':
          await handleHistoryMenu(interaction);
          break;
      }
    }
    
    // Menu montant recharge
    if (interaction.customId === 'recharge_amount_menu') {
      const amount = parseFloat(interaction.values[0]);
      await handleRechargeConfirm(interaction, amount);
    }
    
    // Menu durée achat
    if (interaction.customId === 'buy_duration_menu') {
      const days = parseInt(interaction.values[0]);
      await handleBuyConfirm(interaction, days);
    }
  }
  
  // ==================== HANDLER BUTTONS ====================
  if (interaction.isButton()) {
    
    // Bouton "J'ai envoyé le paiement"
    if (interaction.customId === 'recharge_sent') {
      await interaction.update({
        content: '✅ Parfait ! Dès réception du paiement PayPal, votre solde sera crédité automatiquement.\n\n⏰ Cela peut prendre quelques minutes.',
        embeds: [],
        components: []
      });
    }
    
    // Bouton annuler recharge
    if (interaction.customId === 'recharge_cancel') {
      await interaction.update({
        content: '❌ Rechargement annulé.',
        embeds: [],
        components: []
      });
    }
    
    // Bouton confirmer achat
    if (interaction.customId.startsWith('buy_confirm_')) {
      const days = parseInt(interaction.customId.split('_')[2]);
      await handleBuyFinal(interaction, days);
    }
    
    // Bouton annuler achat
    if (interaction.customId === 'buy_cancel') {
      await interaction.update({
        content: '❌ Achat annulé.',
        embeds: [],
        components: []
      });
    }
  }
});

async function handleCleanInvalidCommand(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await License.deleteMany({
      $or: [
        { discordUserId: { $exists: false } },
        { discordUserId: null },
        { discordUserId: '' },
        { expiresAt: { $exists: false } },
        { expiresAt: null }
      ]
    });

    await interaction.editReply({
      content: `✅ ${result.deletedCount} licence(s) corrompue(s) supprimée(s)`,
      flags: MessageFlags.Ephemeral
    });

  } catch (error) {
    console.error('[CLEAN-INVALID] Erreur:', error);
    await interaction.editReply({
      content: '❌ Erreur lors du nettoyage.',
      flags: MessageFlags.Ephemeral
    });
  }
}

async function handleGenerateCommand(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const targetUser = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration') || 30;

    if (!targetUser) {
      return interaction.editReply({
        content: '❌ Utilisateur requis.',
        flags: MessageFlags.Ephemeral
      });
    }

    const discordUserId = targetUser.id;
    const username = targetUser.username;

    // Vérifier si l'utilisateur a déjà une licence active
    const existingLicense = await License.findOne({
      discordUserId,
      status: { $in: ['active', 'suspended'] }
    });

    if (existingLicense) {
      return interaction.editReply({
        content: `❌ ${username} possède déjà une licence active (\`${existingLicense.key}\`).`,
        flags: MessageFlags.Ephemeral
      });
    }

    // Générer la licence
    const key = generateLicenseKey();
    const expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);

    const newLicense = await License.create({
      key,
      username,
      userId: discordUserId, // Pour compatibilité avec ton schéma
      discordUserId,
      expiresAt,
      status: 'active',
      createdAt: new Date(),
      lastVerified: new Date()
    });

    // ✅ CRÉER LE CHANNEL PRIVÉ
    const userChannel = await createUserLogChannel(discordUserId, username);
    
    if (userChannel) {
      newLicense.logChannelId = userChannel.id;
      await newLicense.save();
      console.log(`[GENERATE] Channel créé pour ${username}: ${userChannel.id}`);
    }

    // Log dans la DB
    await Log.create({
      licenseKey: key,
      action: 'activate',
      ip: 'discord-command',
      timestamp: new Date()
    });

    // ✅ Log dans channel global
    await sendLogToChannel('success', `Nouvelle licence générée`, {
      user: interaction.user.username,
      avatar: interaction.user.displayAvatarURL(),
      fields: [
        { name: 'Clé', value: `\`${key}\``, inline: true },
        { name: 'Utilisateur', value: `${username} (<@${discordUserId}>)`, inline: true },
        { name: 'Durée', value: `${duration} jours`, inline: true },
        { name: 'Channel', value: userChannel ? `<#${userChannel.id}>` : '❌ Erreur', inline: true },
        { name: 'Expire', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true }
      ]
    });

    // Réponse
    const embed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('✅ Licence Générée')
      .addFields(
        { name: 'Clé', value: `\`${key}\``, inline: false },
        { name: 'Utilisateur', value: `${username} (<@${discordUserId}>)`, inline: true },
        { name: 'Discord ID', value: discordUserId, inline: true },
        { name: 'Durée', value: `${duration} jours`, inline: true },
        { name: 'Expire', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
        { name: '📊 Channel Logs', value: userChannel ? `<#${userChannel.id}>` : '❌ Erreur création', inline: false }
      )
      .setFooter({ text: `Généré par ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });

  } catch (error) {
    console.error('[GENERATE] Erreur:', error);
    await interaction.editReply({
      content: '❌ Erreur lors de la génération de la licence.',
      flags: MessageFlags.Ephemeral
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
  
  await sendLogToChannel('warning', `Licence révoquée`, {
      user: interaction.user.username,
      avatar: interaction.user.displayAvatarURL(),
      fields: [
        { name: 'Clé', value: `\`${key}\``, inline: true },
        { name: 'Raison', value: reason || 'Non spécifiée', inline: true }
      ]
    });
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
  try {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('user');
    const discordUserId = targetUser ? targetUser.id : interaction.user.id;
    const username = targetUser ? targetUser.username : interaction.user.username;

    const license = await License.findOne({ discordUserId, status: 'active' });

    if (!license) {
      return interaction.editReply({
        content: `❌ Aucune licence active trouvée pour ${targetUser ? targetUser.username : 'vous'}.`,
        ephemeral: true
      });
    }

    const now = new Date();
    const daysRemaining = Math.ceil((new Date(license.expiresAt) - now) / (1000 * 60 * 60 * 24));

    // ✅ Calculer stats par serveur (supposons que tu stockes ça)
    const karnakVotes = license.usageCount || 0; // À adapter selon ta structure
    const hyperionVotes = 0; // À adapter

    // ✅ EMBED RICHE avec indicateurs visuels
    const embed = new EmbedBuilder()
      .setColor(daysRemaining <= 7 ? '#f59e0b' : '#10b981')
      .setTitle(`👤 Informations - ${username}`)
      .setThumbnail(targetUser ? targetUser.displayAvatarURL() : interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '🔑 Licence',
          value: `\`${license.key}\``,
          inline: true
        },
        {
          name: '📅 Expire',
          value: `${daysRemaining} jour${daysRemaining > 1 ? 's' : ''} ${daysRemaining <= 7 ? '⚠️' : ''}`,
          inline: true
        },
        {
          name: '📊 Utilisation',
          value: `${license.usageCount} vote${license.usageCount > 1 ? 's' : ''}`,
          inline: true
        },
        {
          name: '🎮 Serveurs',
          value: '━━━━━━━━━━━━━━━━',
          inline: false
        },
        {
          name: '🔵 Karnak',
          value: `${karnakVotes > 0 ? '✅' : '⏳'} ${karnakVotes}/30`,
          inline: true
        },
        {
          name: '🟣 Hyperion',
          value: `${hyperionVotes > 0 ? '✅' : '⏳'} ${hyperionVotes}/30`,
          inline: true
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true
        }
      )
      .setFooter({ 
        text: `Activée le ${license.activatedAt.toLocaleDateString('fr-FR')}` 
      })
      .setTimestamp();

    // ✅ BOUTONS INTERACTIFS
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`renew_${discordUserId}`)
          .setLabel('🔄 Renouveler')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(daysRemaining > 7), // Désactivé si > 7 jours
        new ButtonBuilder()
          .setCustomId(`stats_${discordUserId}`)
          .setLabel('📊 Voir Stats')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`logs_${discordUserId}`)
          .setLabel('📋 Logs')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });

  } catch (error) {
    console.error('[USERINFO] Erreur:', error);
    await interaction.editReply({
      content: '❌ Erreur lors de la récupération des informations.',
      ephemeral: true
    });
  }
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

async function createUserLogChannel(discordUserId, username) {
  try {
    const GUILD_ID = '1462219100171534551'; // Ton serveur
    const guild = client.guilds.cache.get(GUILD_ID);
    
    if (!guild) {
      console.error('[CHANNEL] Serveur Discord introuvable');
      return null;
    }

    // ✅ FETCH LE MEMBRE AVANT
    let member;
    try {
      member = await guild.members.fetch(discordUserId);
      console.log(`[CHANNEL] Membre ${username} trouvé sur le serveur`);
    } catch (error) {
      console.error(`[CHANNEL] ❌ Utilisateur ${username} (${discordUserId}) pas sur le serveur`);
      return null;
    }

    // Vérifier si le channel existe déjà
    const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const channelName = `📊-${sanitizedUsername}-logs`;
    
    const existingChannel = guild.channels.cache.find(
      ch => ch.name === channelName
    );

    if (existingChannel) {
      console.log(`[CHANNEL] Channel existe déjà: ${existingChannel.name}`);
      return existingChannel;
    }

    // Trouver ou créer la catégorie
    let category = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildCategory && ch.name === '📁 NEMESIS LOGS'
    );

    if (!category) {
      console.log('[CHANNEL] Création de la catégorie NEMESIS LOGS...');
      
      // ✅ FETCH LES ADMINS AUSSI
      const adminPermissions = [];
      for (const adminId of ADMIN_IDS) {
        try {
          await guild.members.fetch(adminId);
          adminPermissions.push({
            id: adminId,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels']
          });
        } catch (error) {
          console.warn(`[CHANNEL] Admin ${adminId} pas sur le serveur, skip`);
        }
      }
      
      category = await guild.channels.create({
        name: '📁 NEMESIS LOGS',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ['ViewChannel']
          },
          ...adminPermissions
        ]
      });
    }

    // ✅ FETCH LES ADMINS POUR LE CHANNEL AUSSI
    const channelAdminPermissions = [];
    for (const adminId of ADMIN_IDS) {
      try {
        await guild.members.fetch(adminId);
        channelAdminPermissions.push({
          id: adminId,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels']
        });
      } catch (error) {
        console.warn(`[CHANNEL] Admin ${adminId} pas sur le serveur, skip`);
      }
    }

    // Créer le channel privé
    console.log(`[CHANNEL] Création du channel pour ${username}...`);
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Logs personnels de ${username} • Licence active`,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: ['ViewChannel']
        },
        {
          id: discordUserId,
          allow: ['ViewChannel', 'ReadMessageHistory'],
          deny: ['SendMessages']
        },
        ...channelAdminPermissions
      ]
    });

    console.log(`[CHANNEL] ✅ Channel créé: ${channel.name}`);

    // Message de bienvenue
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#10b981')
      .setTitle('🎉 Bienvenue dans vos logs personnels !')
      .setDescription(`Salut <@${discordUserId}> ! Ce channel a été créé spécialement pour toi.`)
      .addFields(
        {
          name: '📊 Que contient ce channel ?',
          value: '• Tous tes votes en temps réel\n• Tes statistiques personnelles\n• L\'historique de ta licence\n• Les alertes importantes',
          inline: false
        },
        {
          name: '🔒 Confidentialité',
          value: 'Seuls toi et les admins avez accès à ce channel.',
          inline: false
        },
        {
          name: '💡 Astuce',
          value: 'Active les notifications pour ce channel pour être alerté de tes votes !\nUtilise `/mylogs` pour retrouver ce channel facilement.',
          inline: false
        }
      )
      .setFooter({ text: 'Nemesis Vote • Logs Personnels' })
      .setTimestamp();

    await channel.send({ embeds: [welcomeEmbed] });

    return channel;

  } catch (error) {
    console.error('[CHANNEL] Erreur création:', error);
    return null;
  }
}

// ✅ FONCTION AMÉLIORÉE - Envoie dans channel global + channel user
async function sendLogToChannel(type, message, data = {}) {
  try {
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#6366f1'
    };
    
    const emojis = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    
    const embed = new EmbedBuilder()
      .setColor(colors[type] || '#6366f1')
      .setDescription(`${emojis[type]} ${message}`) // ✅ CORRIGÉ ICI
      .setTimestamp();
    
    if (data.user) {
      embed.setAuthor({
        name: data.user,
        iconURL: data.avatar || null
      });
    }
    
    if (data.fields) {
      embed.addFields(data.fields);
    }
    
    // ✅ Envoyer dans le channel GLOBAL admin
    if (LOGS_CHANNEL_ID) {
      try {
        const globalChannel = await client.channels.fetch(LOGS_CHANNEL_ID);
        if (globalChannel) {
          await globalChannel.send({ embeds: [embed] });
        }
      } catch (error) {
        console.error('[LOGS] Erreur envoi channel global:', error);
      }
    }
    
    // ✅ NOUVEAU : Envoyer dans le channel PRIVÉ de l'user
    if (data.licenseKey || data.discordUserId) {
      try {
        console.log('[LOGS] 🔍 Recherche licence pour channel privé:', {
          licenseKey: data.licenseKey,
          discordUserId: data.discordUserId
        });
        
        const license = await License.findOne({
          $or: [
            { key: data.licenseKey },
            { discordUserId: data.discordUserId }
          ]
        });
        
        console.log('[LOGS] 📋 Licence trouvée:', license ? 'OUI' : 'NON');
        
        if (license) {
          console.log('[LOGS] 📊 logChannelId:', license.logChannelId);
        }
        
        if (license && license.logChannelId) {
          console.log('[LOGS] ✅ Tentative fetch channel:', license.logChannelId);
          
          const userChannel = await client.channels.fetch(license.logChannelId);
          
          if (userChannel) {
            console.log('[LOGS] ✅ Channel trouvé:', userChannel.name);
            
            // ✅ CRÉER UN NOUVEL EMBED SANS IP
            const userEmbed = new EmbedBuilder()
              .setColor(embed.data.color)
              .setDescription(embed.data.description)
              .setTimestamp();
            
            if (embed.data.author) {
              userEmbed.setAuthor(embed.data.author);
            }
            
            // ✅ FILTRER LES FIELDS - ENLEVER L'IP
            if (data.fields && data.fields.length > 0) {
              const userFields = data.fields.filter(field => {
                const fieldName = field.name.toLowerCase();
                return !fieldName.includes('ip') && !fieldName.includes('🌐');
              });
              
              console.log('[LOGS] 📝 Fields filtrés:', userFields.length, '/', data.fields.length);
              
              if (userFields.length > 0) {
                userEmbed.addFields(userFields);
              }
            }
            
            await userChannel.send({ embeds: [userEmbed] });
            console.log('[LOGS] ✅ Message envoyé dans channel privé (sans IP) !');
          }
        } else {
          if (!license) {
            console.log('[LOGS] ⚠️ Pas de licence trouvée');
          } else if (!license.logChannelId) {
            console.log('[LOGS] ⚠️ logChannelId = null pour cette licence');
          }
        }
      } catch (error) {
        console.error('[LOGS] ❌ Erreur envoi channel user:', error);
      }
    }
    
  } catch (error) {
    console.error('[LOGS] Erreur envoi:', error);
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

  // ✅ CRON JOB - Vérifier les licences expirées toutes les heures
setInterval(async () => {
  try {
    const now = new Date();
    
    // Trouver licences qui viennent d'expirer (dans la dernière heure)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const expiredLicenses = await License.find({
      status: 'active',
      expiresAt: {
        $gte: oneHourAgo,
        $lt: now
      }
    });

    for (const license of expiredLicenses) {
      // Marquer comme expirée
      license.status = 'expired';
      await license.save();

      // Logger
      console.log(`[CRON] Licence expirée: ${license.key}`);

      // Envoyer notification Discord
      await sendLogToChannel('error', `Licence expirée`, {
        user: license.username,
        fields: [
          { name: 'Clé', value: `\`${license.key}\``, inline: true },
          { name: 'Discord ID', value: license.discordUserId, inline: true },
          { name: 'Votes Effectués', value: `${license.usageCount}`, inline: true }
        ]
      });
    }

    if (expiredLicenses.length > 0) {
      console.log(`[CRON] ${expiredLicenses.length} licence(s) expirée(s) traitée(s)`);
    }

  } catch (error) {
    console.error('[CRON] Erreur vérification licences expirées:', error);
  }
}, 60 * 60 * 1000); // ✅ Toutes les heures

console.log('[CRON] Job de vérification des licences expirées activé (toutes les heures)');
  
  client.once('ready', async () => {
    console.log(`✅ [DISCORD] Connecté: ${client.user.tag}`);
    
    try {
      console.log('🔄 [DISCORD] Tentative enregistrement commandes...');
      await registerCommands();
      console.log('✅ [DISCORD] Commandes enregistrées avec succès');
    } catch (error) {
      console.error('❌ [DISCORD] Erreur enregistrement commandes:', error);
    }

    // Nettoyer les recharges expirées toutes les 5 minutes
setInterval(async () => {
  await cleanExpiredRecharges();
}, 5 * 60 * 1000);
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
