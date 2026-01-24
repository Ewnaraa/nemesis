// ========== DATABASE.JS - MODÈLES MONGODB ==========

const mongoose = require('mongoose');
const balanceSchema = new mongoose.Schema({
  discordUserId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  balance: { 
    type: Number, 
    default: 0 
  },
  transactions: [{
    type: { 
      type: String, 
      enum: ['credit', 'debit'],
      required: true
    },
    amount: { 
      type: Number, 
      required: true 
    },
    reason: { 
      type: String, 
      required: true 
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    paypalTransactionId: String,
    licenseKey: String
  }],
  pendingRecharges: [{
    amount: Number,
    createdAt: Date,
    expiresAt: Date
  }],
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const Balance = mongoose.model('Balance', balanceSchema);

const licenseSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  discordUserId: {
    type: String,
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  email: String,
  
  status: {
    type: String,
    enum: ['active', 'revoked', 'expired','suspended'],
    default: 'active',
    index: true
  },
  
   logChannelId: {  // ✅ AJOUTE CETTE LIGNE ICI
    type: String,
    default: null
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  expiresAt: {
    type: Date,
    required: true
  },
  
  lastUsed: {
    type: Date,
    default: null
  },
  
  lastVerified: {
    type: Date,
    default: null
  },
  
  usageCount: {
    type: Number,
    default: 0
  },
  
  verificationCount: {
    type: Number,
    default: 0
  },
  
  suspendedUntil: {
    type: Date,
    default: null
  },
  
  ipAddresses: [{
    ip: String,
    firstSeen: Date,
    lastSeen: Date
  }],
  
  metadata: {
    stripePaymentId: String,
    stripCustomerId: String,
    purchaseAmount: Number,
    purchaseDate: Date
  }
});

// Index pour recherche rapide
licenseSchema.index({ key: 1, status: 1 });
licenseSchema.index({ userId: 1, status: 1 });
licenseSchema.index({ discordUserId: 1, status: 1 });

// Méthode pour vérifier si la licence est valide
licenseSchema.methods.isValid = function() {
  if (this.status !== 'active') return false;
  
  if (this.expiresAt && this.expiresAt < new Date()) {
    this.status = 'expired';
    this.save();
    return false;
  }
  
  return true;
};

// Méthode pour enregistrer une simple vérification
licenseSchema.methods.recordVerification = async function(ipAddress, discordUserId) {
  this.lastVerified = new Date();
  this.verificationCount += 1;
  
  if (this.discordUserId !== discordUserId) {
    throw new Error('Discord User ID mismatch');
  }
  
  // Enregistrer l'IP
  const existingIp = this.ipAddresses.find(item => item.ip === ipAddress);
  if (existingIp) {
    existingIp.lastSeen = new Date();
  } else {
    this.ipAddresses.push({
      ip: ipAddress,
      firstSeen: new Date(),
      lastSeen: new Date()
    });
  }
  
  await this.save();
};

// Méthode pour enregistrer une utilisation réelle (vote)
licenseSchema.methods.recordUsage = async function(ipAddress, discordUserId) {
  this.lastUsed = new Date();
  this.lastVerified = new Date();
  this.usageCount += 1;
  this.verificationCount += 1;
  
  if (this.discordUserId !== discordUserId) {
    throw new Error('Discord User ID mismatch');
  }
  
  // Enregistrer l'IP
  const existingIp = this.ipAddresses.find(item => item.ip === ipAddress);
  if (existingIp) {
    existingIp.lastSeen = new Date();
  } else {
    this.ipAddresses.push({
      ip: ipAddress,
      firstSeen: new Date(),
      lastSeen: new Date()
    });
  }
  
  await this.save();
};

const License = mongoose.model('License', licenseSchema);

// ========== SCHÉMA LOG ==========
const logSchema = new mongoose.Schema({
  licenseKey: {
    type: String,
    required: true,
    index: true
  },
  
  action: {
    type: String,
    enum: [
      'verify', 
      'activate', 
      'revoke', 
      'usage',
      'VERIFY_FAILED',
      'IP_ADDED',
      'IP_WARNING',
      'LICENSE_SUSPENDED',
      'LICENSE_REVOKED',
      'VERIFY_SUSPENDED',
      'SUSPENSION_LIFTED',
      'VERIFICATION',
      'USAGE',
      'REACTIVATED',
      'IP_RESET'
    ],
    required: true
  },
  
  ip: String,
  userAgent: String,
  discordUserId: String,
  
  success: {
    type: Boolean,
    default: true
  },
  
  error: String,
  
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Index pour recherche par date
logSchema.index({ timestamp: -1 });
logSchema.index({ licenseKey: 1, timestamp: -1 });

const Log = mongoose.model('Log', logSchema);

// ========== CONNEXION MONGODB ==========
async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ [DATABASE] Connecté à MongoDB');
    return true;
  } catch (error) {
    console.error('❌ [DATABASE] Erreur connexion:', error);
    return false;
  }
}

// ========== FONCTIONS UTILITAIRES ==========

// Générer une clé de licence
function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = 4;
  const segmentLength = 4;
  
  let key = '';
  for (let i = 0; i < segments; i++) {
    if (i > 0) key += '-';
    for (let j = 0; j < segmentLength; j++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  
  return key;
}

// Créer une nouvelle licence
async function createLicense(userId, username, options = {}) {
  // Vérification : Discord User ID obligatoire
  if (!options.discordUserId) {
    throw new Error('Discord User ID est obligatoire');
  }
  
  const key = generateLicenseKey();
  
  // Durée par défaut : 30 jours
  const defaultDuration = 30;
  const duration = options.duration !== undefined ? options.duration : defaultDuration;
  
  // Calculer la date d'expiration
  const expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
  
  const license = new License({
    key,
    userId,
    username,
    email: options.email,
    discordUserId: options.discordUserId,
    expiresAt: expiresAt,
    metadata: {
      stripePaymentId: options.stripePaymentId,
      stripeCustomerId: options.stripeCustomerId,
      purchaseAmount: options.purchaseAmount,
      purchaseDate: new Date()
    }
  });
  
  await license.save();
  
  console.log(`✅ [LICENSE] Créée: ${key} pour ${username} (Discord: ${options.discordUserId}) - Expire: ${expiresAt.toLocaleDateString('fr-FR')}`);
  
  return license;
}

async function verifyLicense(key, ip, discordUserId, isRealUsage = false) {
  try {
    const license = await License.findOne({ key });
    
    if (!license) {
      await Log.create({
        licenseKey: key,
        action: 'VERIFY_FAILED',
        success: false,
        ip: ip,
        discordUserId: discordUserId,
        error: 'Licence introuvable'
      });
      return { valid: false, error: 'Licence introuvable' };
    }
    
    // Vérifier Discord User ID
    if (!discordUserId) {
      await Log.create({
        licenseKey: key,
        action: 'VERIFY_FAILED',
        success: false,
        ip: ip,
        error: 'Discord User ID manquant'
      });
      return { valid: false, error: 'Discord User ID requis' };
    }
    
    if (license.discordUserId && license.discordUserId !== discordUserId) {
      await Log.create({
        licenseKey: key,
        action: 'VERIFY_FAILED',
        success: false,
        ip: ip,
        discordUserId: discordUserId,
        error: 'Discord User ID incorrect'
      });
      return { 
        valid: false, 
        error: 'Cette licence est liée à un autre compte Discord' 
      };
    }
    
    if (!license.discordUserId) {
      license.discordUserId = discordUserId;
    }
    
    // ========== SYSTÈME ANTI-PARTAGE PROGRESSIF ==========
    
    const currentIPCount = license.ipAddresses.length;
    const isNewIP = !license.ipAddresses.some(item => item.ip === ip);
    
    if (isNewIP) {
      const newIPCount = currentIPCount + 1;
      
      // 🟢 Niveau 1 : OK (0-2 IPs)
      if (newIPCount <= 2) {
        license.ipAddresses.push({
          ip: ip,
          firstSeen: new Date(),
          lastSeen: new Date()
        });
        console.log(`✅ [SECURITY] Licence ${key} - IP ajoutée (${newIPCount}/2)`);
        
        await Log.create({
          licenseKey: key,
          action: 'IP_ADDED',
          success: true,
          ip: ip,
          discordUserId: discordUserId,
          error: null
        });
      }
      
      // 🟡 Niveau 2 : Avertissement (3 IPs)
      else if (newIPCount === 3) {
        license.ipAddresses.push({
          ip: ip,
          firstSeen: new Date(),
          lastSeen: new Date()
        });
        console.log(`⚠️ [SECURITY] Licence ${key} - AVERTISSEMENT (3 IPs)`);
        
        await Log.create({
          licenseKey: key,
          action: 'IP_WARNING',
          success: true,
          ip: ip,
          discordUserId: discordUserId,
          error: '3 IPs détectées - surveillance active'
        });
        
        // Alerte admin Discord
        await sendSecurityAlert({
          level: 'warning',
          license: license,
          message: `3 IPs différentes détectées`,
          ips: license.ipAddresses.map(item => item.ip)
        });
      }
      
      // 🟠 Niveau 3 : Suspension temporaire (4-5 IPs)
      else if (newIPCount >= 4 && newIPCount <= 5) {
        console.log(`🚫 [SECURITY] Licence ${key} - SUSPENDUE (${newIPCount} IPs)`);
        
        license.status = 'suspended';
        license.suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
        await license.save();
        
        await Log.create({
          licenseKey: key,
          action: 'LICENSE_SUSPENDED',
          success: false,
          ip: ip,
          discordUserId: discordUserId,
          error: `${newIPCount} IPs détectées - suspension 24h`
        });
        
        // Alerte admin Discord
        await sendSecurityAlert({
          level: 'urgent',
          license: license,
          message: `Licence SUSPENDUE - ${newIPCount} IPs détectées`,
          ips: [...license.ipAddresses.map(item => item.ip), ip]
        });
        
        return { 
          valid: false, 
          error: 'Licence suspendue pour activité suspecte (24h). Contactez le support si légitime.' 
        };
      }
      
      // 🔴 Niveau 4 : Révocation définitive (6+ IPs)
      else {
        console.log(`❌ [SECURITY] Licence ${key} - RÉVOQUÉE (${newIPCount} IPs)`);
        
        license.status = 'revoked';
        await license.save();
        
        await Log.create({
          licenseKey: key,
          action: 'LICENSE_REVOKED',
          success: false,
          ip: ip,
          discordUserId: discordUserId,
          error: `${newIPCount} IPs - Partage confirmé`
        });
        
        // Alerte admin Discord
        await sendSecurityAlert({
          level: 'critical',
          license: license,
          message: `Licence RÉVOQUÉE - ${newIPCount} IPs (partage confirmé)`,
          ips: [...license.ipAddresses.map(item => item.ip), ip]
        });
        
        return { 
          valid: false, 
          error: 'Licence révoquée pour partage détecté. Non remboursable.' 
        };
      }
    }
    
    // Vérifier si suspendue
    if (license.status === 'suspended') {
      if (license.suspendedUntil && license.suspendedUntil > new Date()) {
        const hoursLeft = Math.ceil((license.suspendedUntil - new Date()) / (1000 * 60 * 60));
        
        await Log.create({
          licenseKey: key,
          action: 'VERIFY_SUSPENDED',
          success: false,
          ip: ip,
          discordUserId: discordUserId,
          error: `Suspension active - ${hoursLeft}h restantes`
        });
        
        return { 
          valid: false, 
          error: `Licence suspendue. Réactivation dans ${hoursLeft}h ou contactez le support.` 
        };
      } else {
        // Fin de suspension automatique
        license.status = 'active';
        console.log(`✅ [SECURITY] Licence ${key} - Suspension levée automatiquement`);
        
        await Log.create({
          licenseKey: key,
          action: 'SUSPENSION_LIFTED',
          success: true,
          ip: ip,
          discordUserId: discordUserId,
          error: null
        });
      }
    }
    
    // ========== FIN SYSTÈME ANTI-PARTAGE ==========
    
    // Vérifier statut de base
    if (!license.isValid()) {
      await Log.create({
        licenseKey: key,
        action: 'VERIFY_FAILED',
        success: false,
        ip: ip,
        discordUserId: discordUserId,
        error: `Statut: ${license.status}`
      });
      
      return { 
        valid: false, 
        error: license.status === 'expired' ? 'Licence expirée' : 'Licence invalide'
      };
    }
    
    // Mettre à jour statistiques
    if (isRealUsage) {
      license.usageCount++;
      license.lastUsed = new Date();
    } else {
      license.verificationCount++;
      license.lastVerified = new Date();
    }
    
    await license.save();
    
    // Log succès
    await Log.create({
      licenseKey: key,
      action: isRealUsage ? 'USAGE' : 'VERIFICATION',
      success: true,
      ip: ip,
      discordUserId: discordUserId,
      error: null
    });
    
    // Calculer jours restants
    const daysRemaining = Math.ceil((license.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
    
    return {
      valid: true,
      license: {
        key: license.key,
        username: license.username,
        discordUserId: license.discordUserId,
        status: license.status,
        expiresAt: license.expiresAt,
        daysRemaining: daysRemaining,
        usageCount: license.usageCount,
        verificationCount: license.verificationCount
      }
    };
    
  } catch (error) {
    console.error('❌ [VERIFY] Erreur:', error);
    return { valid: false, error: 'Erreur serveur' };
  }
}

// Révoquer une licence
async function revokeLicense(key, reason) {
  try {
    const license = await License.findOne({ key });
    
    if (!license) {
      return { success: false, error: 'Licence introuvable' };
    }
    
    license.status = 'revoked';
    await license.save();
    
    await Log.create({
      licenseKey: key,
      action: 'revoke',
      success: true,
      error: reason
    });
    
    console.log(`🚫 [LICENSE] Révoquée: ${key} - ${reason}`);
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ [LICENSE] Erreur révocation:', error);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Obtenir les stats
async function getStats() {
  const total = await License.countDocuments();
  const active = await License.countDocuments({ status: 'active' });
  const revoked = await License.countDocuments({ status: 'revoked' });
  const expired = await License.countDocuments({ status: 'expired' });
  const linked = await License.countDocuments({ discordUserId: { $ne: null } });
  
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const expiringSoon = await License.countDocuments({ 
    status: 'active',
    expiresAt: { $lte: in7Days, $gte: now }
  });
  
  const recentLogs = await Log.find()
    .sort({ timestamp: -1 })
    .limit(10);
  
  return {
    total,
    active,
    revoked,
    expired,
    linked,
    expiringSoon,
    recentActivity: recentLogs
  };
}

// ========== ALERTES SÉCURITÉ ==========

async function sendSecurityAlert({ level, license, message, ips }) {
  // Vérifier que le webhook admin est configuré
  if (!process.env.ADMIN_WEBHOOK_URL) {
    console.warn('⚠️ [ALERT] ADMIN_WEBHOOK_URL non configuré');
    return;
  }
  
  const colors = {
    warning: 0xf59e0b,   // Orange
    urgent: 0xef4444,    // Rouge
    critical: 0x991b1b   // Rouge foncé
  };
  
  const emojis = {
    warning: '⚠️',
    urgent: '🚫',
    critical: '❌'
  };
  
  // Extraire les IPs si c'est un array d'objets
  const ipList = ips.map(item => typeof item === 'string' ? item : item.ip);
  
  try {
    await fetch(process.env.ADMIN_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `${emojis[level]} Alerte Sécurité - ${level.toUpperCase()}`,
          description: message,
          color: colors[level],
          fields: [
            { name: 'Clé', value: `\`${license.key}\``, inline: true },
            { name: 'User', value: `<@${license.discordUserId}>`, inline: true },
            { name: 'Username', value: license.username, inline: true },
            { name: 'IPs détectées', value: ipList.slice(0, 10).map(ip => `\`${ip}\``).join('\n') || 'Aucune', inline: false },
            { name: 'Votes effectués', value: license.usageCount.toString(), inline: true },
            { name: 'Statut actuel', value: license.status.toUpperCase(), inline: true }
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Nemesis Security System' }
        }]
      })
    });
    
    console.log(`📢 [ALERT] Alerte ${level} envoyée pour licence ${license.key}`);
    
  } catch (error) {
    console.error('❌ [ALERT] Erreur envoi webhook:', error);
  }
}

// Exporter
module.exports = {
  connectDatabase,
  createLicense,
  verifyLicense,
  revokeLicense,
  getStats,
  sendSecurityAlert,
  License,
  Log,
  Balance
};
