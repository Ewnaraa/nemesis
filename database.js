// ========== DATABASE.JS - MODÈLES MONGODB ==========

const mongoose = require('mongoose');

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
    enum: ['active', 'revoked', 'expired'],
    default: 'active',
    index: true
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
  
  lastVerified: {  // ✅ NOUVEAU : Dernière vérification
    type: Date,
    default: null
  },
  
  usageCount: {  // ✅ MODIFIÉ : Nombre de votes réussis (pas de vérifications)
    type: Number,
    default: 0
  },
  
  verificationCount: {  // ✅ NOUVEAU : Nombre total de vérifications
    type: Number,
    default: 0
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

// ✅ NOUVEAU : Méthode pour enregistrer une simple vérification
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

// ✅ MODIFIÉ : Méthode pour enregistrer une utilisation réelle (vote)
licenseSchema.methods.recordUsage = async function(ipAddress, discordUserId) {
  this.lastUsed = new Date();
  this.lastVerified = new Date();
  this.usageCount += 1;  // ✅ Seulement pour les votes réussis
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
    enum: ['verify', 'activate', 'revoke', 'usage'],
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
  // ✅ VÉRIFICATION : Discord User ID obligatoire
  if (!options.discordUserId) {
    throw new Error('Discord User ID est obligatoire');
  }
  
  const key = generateLicenseKey();
  
  // ✅ DURÉE PAR DÉFAUT : 30 jours
  const defaultDuration = 30; // jours
  const duration = options.duration !== undefined ? options.duration : defaultDuration;
  
  // ✅ Calculer la date d'expiration (toujours définie)
  const expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
  
  const license = new License({
    key,
    userId,
    username,
    email: options.email,
    discordUserId: options.discordUserId,  // ✅ OBLIGATOIRE
    expiresAt: expiresAt,  // ✅ TOUJOURS défini
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

// Vérifier une licence
async function verifyLicense(key, ipAddress, discordUserId, isRealUsage = false) {
  try {
    // ✅ VÉRIFICATION : Discord User ID obligatoire
    if (!discordUserId) {
      await Log.create({
        licenseKey: key,
        action: 'verify',
        ip: ipAddress,
        discordUserId: null,
        success: false,
        error: 'Discord User ID required'
      });
      return { 
        valid: false, 
        error: 'Discord User ID requis pour utiliser cette licence' 
      };
    }
    
    const license = await License.findOne({ key });
    
    if (!license) {
      await Log.create({
        licenseKey: key,
        action: 'verify',
        ip: ipAddress,
        discordUserId: discordUserId,
        success: false,
        error: 'License not found'
      });
      return { valid: false, error: 'Licence introuvable' };
    }
    
    if (!license.isValid()) {
      await Log.create({
        licenseKey: key,
        action: 'verify',
        ip: ipAddress,
        discordUserId: discordUserId,
        success: false,
        error: `Status: ${license.status}`
      });
      
      if (license.status === 'expired') {
        const expiredDate = new Date(license.expiresAt).toLocaleDateString('fr-FR');
        return { 
          valid: false, 
          error: `Licence expirée le ${expiredDate}` 
        };
      }
      
      return { 
        valid: false, 
        error: license.status === 'revoked' ? 'Licence révoquée' : 'Licence expirée' 
      };
    }
    
    // ✅ VÉRIFICATION STRICTE : Le Discord User ID doit correspondre EXACTEMENT
    if (license.discordUserId !== discordUserId) {
      await Log.create({
        licenseKey: key,
        action: 'verify',
        ip: ipAddress,
        discordUserId: discordUserId,
        success: false,
        error: `Discord User ID mismatch: expected ${license.discordUserId}, got ${discordUserId}`
      });
      return { 
        valid: false, 
        error: 'Cette licence est liée à un autre compte Discord' 
      };
    }
    
    // ✅ NOUVEAU : Différencier vérification simple et utilisation réelle
    try {
      if (isRealUsage) {
        // Utilisation réelle (vote réussi)
        await license.recordUsage(ipAddress, discordUserId);
        console.log(`✅ [LICENSE] Usage enregistré: ${key}`);
      } else {
        // Simple vérification (startup, check périodique)
        await license.recordVerification(ipAddress, discordUserId);
        console.log(`🔍 [LICENSE] Vérification: ${key}`);
      }
    } catch (error) {
      return { 
        valid: false, 
        error: 'Erreur lors de l\'enregistrement' 
      };
    }
    
    await Log.create({
      licenseKey: key,
      action: isRealUsage ? 'usage' : 'verify',
      ip: ipAddress,
      discordUserId: discordUserId,
      success: true
    });
    
    const daysRemaining = Math.ceil((license.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
    
    return {
      valid: true,
      license: {
        key: license.key,
        username: license.username,
        discordUserId: license.discordUserId,
        expiresAt: license.expiresAt,
        lastUsed: license.lastUsed,
        lastVerified: license.lastVerified,
        daysRemaining: daysRemaining,
        usageCount: license.usageCount,  // ✅ Nombre de votes
        verificationCount: license.verificationCount  // ✅ Nombre de vérifications
      }
    };
    
  } catch (error) {
    console.error('❌ [LICENSE] Erreur vérification:', error);
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
  
  // ✅ NOUVEAU : Stats sur les expirations à venir
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
    expiringSoon,  // ✅ NOUVEAU
    recentActivity: recentLogs
  };
}

// ========== EXPORTS ==========
module.exports = {
  connectDatabase,
  License,
  Log,
  generateLicenseKey,
  createLicense,
  verifyLicense,
  revokeLicense,
  getStats
};
