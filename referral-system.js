// ========== REFERRAL SYSTEM ==========

const mongoose = require('mongoose');

// Schéma pour le système de parrainage
const referralSchema = new mongoose.Schema({
  discordUserId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  referralCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  referredBy: {
    type: String,
    default: null,
    index: true
  },
  
  referrals: [{
    discordUserId: String,
    username: String,
    joinedAt: Date,
    hasActiveLicense: Boolean,
    totalSpent: Number
  }],
  
  totalReferrals: {
    type: Number,
    default: 0
  },
  
  activeReferrals: {
    type: Number,
    default: 0
  },
  
  discountEarned: {
    type: Number,
    default: 0 // En pourcentage (10 = 10%)
  },
  
  discountUsed: {
    type: Number,
    default: 0 // Nombre de fois utilisé
  },
  
  lifetimeEarnings: {
    type: Number,
    default: 0 // Total économisé en €
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Referral = mongoose.model('Referral', referralSchema);

// Générer un code de parrainage unique
function generateReferralCode(discordUserId) {
  // Utiliser le Discord User ID comme code (simple et unique)
  return discordUserId;
}

// Créer ou récupérer le système de parrainage d'un utilisateur
async function getOrCreateReferral(discordUserId, username) {
  let referral = await Referral.findOne({ discordUserId });
  
  if (!referral) {
    referral = new Referral({
      discordUserId,
      referralCode: generateReferralCode(discordUserId)
    });
    await referral.save();
    console.log(`[REFERRAL] Créé pour ${username} (${discordUserId})`);
  }
  
  return referral;
}

// Enregistrer un nouveau filleul
async function recordReferral(referrerCode, referredUserId, referredUsername) {
  try {
    // Vérifier que l'utilisateur n'utilise pas son propre code
    if (referrerCode === referredUserId) {
      return { success: false, error: 'Vous ne pouvez pas utiliser votre propre code de parrainage' };
    }
    
    // Vérifier que le filleul n'est pas déjà enregistré
    const existingReferral = await Referral.findOne({ discordUserId: referredUserId });
    if (existingReferral && existingReferral.referredBy) {
      return { success: false, error: 'Vous avez déjà été parrainé' };
    }
    
    // Trouver le parrain
    const referrer = await Referral.findOne({ referralCode: referrerCode });
    if (!referrer) {
      return { success: false, error: 'Code de parrainage invalide' };
    }
    
    // Créer ou mettre à jour le profil du filleul
    let referred = await Referral.findOne({ discordUserId: referredUserId });
    if (!referred) {
      referred = new Referral({
        discordUserId: referredUserId,
        referralCode: generateReferralCode(referredUserId),
        referredBy: referrerCode
      });
    } else {
      referred.referredBy = referrerCode;
    }
    await referred.save();
    
    // Ajouter le filleul à la liste du parrain
    referrer.referrals.push({
      discordUserId: referredUserId,
      username: referredUsername,
      joinedAt: new Date(),
      hasActiveLicense: false,
      totalSpent: 0
    });
    
    referrer.totalReferrals += 1;
    await referrer.save();
    
    console.log(`[REFERRAL] ${referredUsername} parrainé par ${referrerCode}`);
    
    return { 
      success: true,
      referrer: referrer.discordUserId,
      referred: referredUserId
    };
    
  } catch (error) {
    console.error('[REFERRAL] Erreur:', error);
    return { success: false, error: 'Erreur serveur' };
  }
}

// Calculer la réduction pour un utilisateur
async function calculateDiscount(discordUserId) {
  const referral = await Referral.findOne({ discordUserId });
  
  if (!referral) {
    return 0;
  }
  
  // 10% par filleul actif (avec licence active)
  const activeReferrals = referral.referrals.filter(r => r.hasActiveLicense).length;
  const discount = Math.min(activeReferrals * 10, 50); // Max 50% de réduction
  
  return discount;
}

// Mettre à jour quand un filleul achète une licence
async function updateReferralOnPurchase(referredUserId, amount) {
  try {
    const referred = await Referral.findOne({ discordUserId: referredUserId });
    
    if (!referred || !referred.referredBy) {
      return; // Pas de parrain
    }
    
    const referrer = await Referral.findOne({ referralCode: referred.referredBy });
    
    if (!referrer) {
      return;
    }
    
    // Mettre à jour les stats du filleul dans la liste du parrain
    const referralIndex = referrer.referrals.findIndex(r => r.discordUserId === referredUserId);
    
    if (referralIndex !== -1) {
      referrer.referrals[referralIndex].hasActiveLicense = true;
      referrer.referrals[referralIndex].totalSpent += amount;
      
      // Recalculer le nombre de filleuls actifs
      referrer.activeReferrals = referrer.referrals.filter(r => r.hasActiveLicense).length;
      
      // Calculer la réduction totale
      referrer.discountEarned = Math.min(referrer.activeReferrals * 10, 50);
      
      await referrer.save();
      
      console.log(`[REFERRAL] Parrain ${referrer.discordUserId} : +1 filleul actif (total: ${referrer.activeReferrals})`);
    }
    
  } catch (error) {
    console.error('[REFERRAL] Erreur update purchase:', error);
  }
}

// Appliquer la réduction et mettre à jour les stats
async function applyDiscount(discordUserId, originalPrice) {
  const discount = await calculateDiscount(discordUserId);
  
  if (discount === 0) {
    return originalPrice;
  }
  
  const finalPrice = originalPrice * (1 - discount / 100);
  const saved = originalPrice - finalPrice;
  
  // Enregistrer l'utilisation de la réduction
  const referral = await Referral.findOne({ discordUserId });
  if (referral) {
    referral.discountUsed += 1;
    referral.lifetimeEarnings += saved;
    await referral.save();
  }
  
  return finalPrice;
}

// Obtenir les stats de parrainage d'un utilisateur
async function getReferralStats(discordUserId) {
  const referral = await Referral.findOne({ discordUserId });
  
  if (!referral) {
    return {
      hasReferrals: false,
      code: generateReferralCode(discordUserId),
      totalReferrals: 0,
      activeReferrals: 0,
      discount: 0,
      lifetimeEarnings: 0
    };
  }
  
  return {
    hasReferrals: true,
    code: referral.referralCode,
    totalReferrals: referral.totalReferrals,
    activeReferrals: referral.activeReferrals,
    discount: referral.discountEarned,
    discountUsed: referral.discountUsed,
    lifetimeEarnings: referral.lifetimeEarnings,
    referrals: referral.referrals,
    referredBy: referral.referredBy
  };
}

module.exports = {
  Referral,
  getOrCreateReferral,
  recordReferral,
  calculateDiscount,
  updateReferralOnPurchase,
  applyDiscount,
  getReferralStats
};
