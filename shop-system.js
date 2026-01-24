// shop-system.js - Système de boutique Nemesis Vote

const { Balance } = require('./database');

const LICENSE_PRICES = {
  30: 5.00,
  90: 12.00,
  180: 20.00,
  365: 35.00
};

const RECHARGE_AMOUNTS = [5, 10, 20, 50, 100];

async function getBalance(discordUserId) {
  let balance = await Balance.findOne({ discordUserId });
  
  if (!balance) {
    balance = await Balance.create({
      discordUserId,
      balance: 0,
      transactions: [],
      pendingRecharges: []
    });
  }
  
  return balance.balance;
}

async function addBalance(discordUserId, amount, reason, paypalTransactionId = null) {
  let balance = await Balance.findOne({ discordUserId });
  
  if (!balance) {
    balance = await Balance.create({
      discordUserId,
      balance: 0,
      transactions: [],
      pendingRecharges: []
    });
  }
  
  balance.balance += amount;
  balance.transactions.push({
    type: 'credit',
    amount: amount,
    reason: reason,
    timestamp: new Date(),
    paypalTransactionId: paypalTransactionId
  });
  
  await balance.save();
  
  return balance.balance;
}

async function deductBalance(discordUserId, amount, reason, licenseKey = null) {
  const balance = await Balance.findOne({ discordUserId });
  
  if (!balance || balance.balance < amount) {
    throw new Error('Solde insuffisant');
  }
  
  balance.balance -= amount;
  balance.transactions.push({
    type: 'debit',
    amount: amount,
    reason: reason,
    timestamp: new Date(),
    licenseKey: licenseKey
  });
  
  await balance.save();
  
  return balance.balance;
}

async function getTransactionHistory(discordUserId, limit = 10) {
  const balance = await Balance.findOne({ discordUserId });
  
  if (!balance) return [];
  
  return balance.transactions
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

async function createPendingRecharge(discordUserId, amount) {
  let balance = await Balance.findOne({ discordUserId });
  
  if (!balance) {
    balance = await Balance.create({
      discordUserId,
      balance: 0,
      transactions: [],
      pendingRecharges: []
    });
  }
  
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  balance.pendingRecharges.push({
    amount: amount,
    createdAt: new Date(),
    expiresAt: expiresAt
  });
  
  await balance.save();
  
  return expiresAt;
}

async function cleanExpiredRecharges() {
  const now = new Date();
  
  await Balance.updateMany(
    {},
    {
      $pull: {
        pendingRecharges: {
          expiresAt: { $lt: now }
        }
      }
    }
  );
}

module.exports = {
  LICENSE_PRICES,
  RECHARGE_AMOUNTS,
  getBalance,
  addBalance,
  deductBalance,
  getTransactionHistory,
  createPendingRecharge,
  cleanExpiredRecharges
};
