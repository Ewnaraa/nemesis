// ========== DATABASE.JS - MODÈLES MONGODB ==========

const mongoose = require('mongoose');

// ========== SCHÉMA LICENSE ==========
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
  discordUserId: {  // ✅ NOUVEAU : Pour lier à un compte Discord spécifique
    type: String,
    default: null,
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
    default: null // null = illimité
  },
  
  lastUsed: {
    type: Date,
    default: null
  },
  
  usageCount: {
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

// Méthode pour enregistrer une utilisation
licenseSchema.methods.recordUsage = async function(ipAddress, discordUserId = null) {
  this.lastUsed = new Date();
  this.usageCount += 1;
  
  // ✅ Lier le Discord User ID à la première utilisation
  if (discordUserId && !this.discordUserId) {
    this.discordUserId = discordUserId;
    console.log(`✅ [LICENSE] Licence ${this.key} liée au Discord User ID ${discordUserId}`);
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
  discordUserId: String,  // ✅ NOUVEAU
  
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
  const key = generateLicenseKey();
  
  const license = new License({
    key,
    userId,
    username,
    email: options.email,
    discordUserId: options.discordUserId || null,  // ✅ NOUVEAU
    expiresAt: options.expiresAt,
    metadata: {
      stripePaymentId: options.stripePaymentId,
      stripeCustomerId: options.stripeCustomerId,
      purchaseAmount: options.purchaseAmount,
      purchaseDate: new Date()
    }
  });
  
  await license.save();
  
  console.log(`✅ [LICENSE] Créée: ${key} pour ${username}`);
  
  return license;
}

// Vérifier une licence
async function verifyLicense(key, ipAddress, discordUserId = null) {
  try {
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
      return { 
        valid: false, 
        error: license.status === 'revoked' ? 'Licence révoquée' : 'Licence expirée' 
      };
    }
    
    // ✅ NOUVEAU : Vérification du Discord User ID
    if (discordUserId) {
      if (!license.discordUserId) {
        // Première utilisation : lier l'ID Discord à la licence
        license.discordUserId = discordUserId;
        console.log(`✅ [LICENSE] Licence ${key} liée au Discord User ID ${discordUserId}`);
      } else if (license.discordUserId !== discordUserId) {
        // L'ID Discord ne correspond pas
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
    }
    
    // Enregistrer l'utilisation
    await license.recordUsage(ipAddress, discordUserId);
    
    await Log.create({
      licenseKey: key,
      action: 'verify',
      ip: ipAddress,
      discordUserId: discordUserId,
      success: true
    });
    
    return {
      valid: true,
      license: {
        key: license.key,
        username: license.username,
        discordUserId: license.discordUserId,
        expiresAt: license.expiresAt,
        lastUsed: license.lastUsed
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
  const linked = await License.countDocuments({ discordUserId: { $ne: null } });  // ✅ NOUVEAU
  
  const recentLogs = await Log.find()
    .sort({ timestamp: -1 })
    .limit(10);
  
  return {
    total,
    active,
    revoked,
    expired,
    linked,  // ✅ NOUVEAU
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
