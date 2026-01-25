# 🚀 NEMESIS VOTE - README TECHNIQUE

## 📋 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Architecture](#architecture)
- [Stack Technique](#stack-technique)
- [Installation](#installation)
- [Configuration](#configuration)
- [Déploiement](#déploiement)
- [API Endpoints](#api-endpoints)
- [Base de données](#base-de-données)
- [Sécurité](#sécurité)
- [Maintenance](#maintenance)

---

## 🎯 Vue d'ensemble

**Nemesis Vote** est un système complet de vote automatique pour serveurs Dofus Rétro avec :
- ✅ Extension Chrome pour automatisation
- ✅ Bot Discord pour gestion utilisateurs
- ✅ API REST (Railway)
- ✅ Shop PayPal intégré
- ✅ Système anti-partage progressif
- ✅ Dashboards admin/user complets

---

## 🏗️ Architecture

```
┌─────────────────┐
│  Chrome Extension│ ──────┐
│   (background.js)│       │
└─────────────────┘       │
                          ▼
                    ┌──────────┐
                    │   API    │
                    │ (Railway)│
                    └──────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
    ┌────────┐      ┌──────────┐    ┌─────────┐
    │MongoDB │      │  Discord │    │ PayPal  │
    │ Atlas  │      │   Bot    │    │Webhooks │
    └────────┘      └──────────┘    └─────────┘
```

### Composants principaux

**1. Extension Chrome**
- Vote automatique (Karnak, Hyperion)
- Gestion cooldowns
- Synchronisation temps réel
- Résolution captchas (2captcha)

**2. API Backend (Railway)**
- Vérification licences
- Gestion utilisateurs
- Webhooks PayPal
- Logs & analytics

**3. Bot Discord**
- Dashboards (`/menu`, `/admin`)
- Shop & paiements
- Gestion licences
- Support utilisateurs

**4. Base de données (MongoDB)**
- Licences
- Logs
- Balances
- Transactions

---

## 💻 Stack Technique

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose ODM)
- **Hosting:** Railway
- **Process Manager:** PM2 (optionnel)

### Bot Discord
- **Library:** Discord.js v14
- **Commands:** Slash Commands
- **UI:** Embeds, Buttons, Select Menus

### Extension Chrome
- **Manifest:** V3
- **Background:** Service Worker
- **Content Scripts:** Auto-injection
- **Storage:** chrome.storage.local

### Services externes
- **PayPal:** Webhooks IPN
- **2captcha:** Résolution MTCaptcha
- **1secmail:** Emails temporaires

---

## 📦 Installation

### Prérequis

```bash
node -v  # v18.0.0 minimum
npm -v   # v8.0.0 minimum
git --version
```

### Clone du projet

```bash
git clone https://github.com/YOUR_USERNAME/nemesis-vote.git
cd nemesis-vote
```

### Installation des dépendances

```bash
npm install
```

**Dépendances principales :**
- `discord.js` - Bot Discord
- `express` - API REST
- `mongoose` - MongoDB ODM
- `dotenv` - Variables d'environnement
- `node-fetch` - HTTP requests

---

## ⚙️ Configuration

### 1. Variables d'environnement

Créer `.env` à la racine :

```env
# Discord Bot
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id
GUILD_ID=your_guild_id

# Admin IDs (séparés par virgules)
ADMIN_IDS=123456789012345678,987654321098765432

# Channels Discord
LOGS_CHANNEL_ID=123456789012345678
USER_LOGS_CATEGORY_ID=123456789012345678

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/nemesis

# API
PORT=3000
NODE_ENV=production

# PayPal (optionnel pour webhook)
PAYPAL_WEBHOOK_ID=your_webhook_id
```

### 2. Configuration Discord Bot

**Créer une application Discord :**
1. https://discord.com/developers/applications
2. New Application > "Nemesis Bot"
3. Bot > Reset Token > Copier le token
4. OAuth2 > URL Generator :
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Administrator`
5. Copier l'URL et inviter le bot

**Obtenir les IDs :**
- Guild ID : Clic droit serveur > Copier l'identifiant
- Channel IDs : Clic droit channel > Copier l'identifiant

### 3. MongoDB Atlas

**Créer un cluster :**
1. https://www.mongodb.com/cloud/atlas
2. Create Free Cluster
3. Database Access > Add User
4. Network Access > Add IP (0.0.0.0/0 pour Railway)
5. Databases > Connect > Connect your application
6. Copier la connexion string

### 4. PayPal Business

**Configurer IPN :**
1. PayPal Business Account
2. Account Settings > Notifications
3. Instant Payment Notifications > Update
4. Notification URL : `https://your-app.railway.app/webhook/paypal`
5. Receive IPN messages > Enabled

---

## 🚀 Déploiement

### Local (Développement)

```bash
# Démarrer le bot
npm start

# Avec nodemon (auto-reload)
npm run dev

# Tester l'extension
# 1. Chrome > Extensions > Mode développeur
# 2. Charger l'extension non empaquetée
# 3. Sélectionner le dossier du projet
```

### Railway (Production)

**Premier déploiement :**

```bash
# Installer Railway CLI
npm install -g @railway/cli

# Login
railway login

# Créer projet
railway init

# Ajouter variables d'environnement
railway variables set DISCORD_TOKEN=xxx
railway variables set MONGODB_URI=xxx
# ... etc

# Deploy
git add .
git commit -m "Initial deploy"
git push origin main
railway up
```

**Configuration Railway :**
- Build Command : `npm install`
- Start Command : `node bot.js`
- Health Check : `/health` endpoint
- Autoscaling : Disabled (1 instance)

**Déploiements suivants :**
```bash
git push origin main
# Railway auto-deploy
```

### Chrome Web Store (Extension)

**Publication :**
1. Créer un fichier ZIP du projet
2. Chrome Web Store Developer Dashboard
3. New Item > Upload ZIP
4. Remplir description, screenshots
5. Submit for Review
6. Attendre validation (~1-3 jours)

**Mises à jour :**
1. Modifier `manifest.json` version
2. ZIP le projet
3. Upload nouvelle version
4. Submit for Review

---

## 🔌 API Endpoints

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "uptime": 123456
}
```

### Vérification de licence

```http
POST /api/verify
Content-Type: application/json

{
  "key": "XXXX-XXXX-XXXX-XXXX",
  "discordUserId": "123456789012345678",
  "isRealUsage": true
}
```

**Response Success:**
```json
{
  "valid": true,
  "license": {
    "key": "XXXX-XXXX-XXXX-XXXX",
    "username": "User#1234",
    "expiresAt": "2026-02-25T00:00:00.000Z",
    "daysRemaining": 30,
    "usageCount": 42,
    "verificationCount": 128,
    "discordUserId": "123456789012345678"
  }
}
```

**Response Error:**
```json
{
  "valid": false,
  "error": "Licence expirée"
}
```

### Webhook PayPal

```http
POST /webhook/paypal
Content-Type: application/x-www-form-urlencoded

# PayPal IPN data
```

**Processing:**
1. Extraction Discord User ID de la note
2. Validation du montant
3. Crédit du solde
4. Notification Discord DM
5. Log admin

---

## 🗄️ Base de données

### Schémas MongoDB

#### Collection `licenses`

```javascript
{
  _id: ObjectId,
  key: String,              // XXXX-XXXX-XXXX-XXXX
  username: String,         // Discord username
  userId: String,           // Deprecated
  discordUserId: String,    // Discord User ID (unique)
  expiresAt: Date,
  status: String,           // active, expired, suspended, revoked
  usageCount: Number,       // Nombre de votes
  verificationCount: Number,
  ipAddresses: [{
    ip: String,
    firstSeen: Date,
    lastSeen: Date
  }],
  logChannelId: String,     // Discord channel ID
  referredBy: String,       // Parrain Discord ID
  createdAt: Date,
  lastUsedAt: Date,
  lastVerified: Date
}
```

#### Collection `logs`

```javascript
{
  _id: ObjectId,
  licenseKey: String,
  event: String,           // vote_success, verification, ip_warning, etc.
  action: String,          // USAGE, VERIFICATION, IP_ADDED, etc.
  success: Boolean,
  ip: String,
  discordUserId: String,
  error: String,
  timestamp: Date
}
```

#### Collection `balances`

```javascript
{
  _id: ObjectId,
  discordUserId: String,   // Unique
  balance: Number,
  transactions: [{
    type: String,          // credit, debit
    amount: Number,
    reason: String,
    timestamp: Date,
    paypalTransactionId: String,
    licenseKey: String
  }],
  pendingRecharges: [{
    amount: Number,
    createdAt: Date,
    expiresAt: Date
  }],
  createdAt: Date
}
```

### Indexes

```javascript
// licenses
db.licenses.createIndex({ key: 1 }, { unique: true })
db.licenses.createIndex({ discordUserId: 1 })
db.licenses.createIndex({ status: 1 })
db.licenses.createIndex({ expiresAt: 1 })

// logs
db.logs.createIndex({ licenseKey: 1 })
db.logs.createIndex({ timestamp: -1 })
db.logs.createIndex({ event: 1 })

// balances
db.balances.createIndex({ discordUserId: 1 }, { unique: true })
```

---

## 🔐 Sécurité

### Anti-partage

**Système progressif 4 niveaux :**

```javascript
// 0-2 IPs : Normal
// 3 IPs   : Avertissement
// 4 IPs   : Suspension 24h
// 5+ IPs  : Révocation définitive
```

**Détection :**
- Tracking IP par licence
- First seen / Last seen timestamps
- Logs complets dans MongoDB
- Alertes Discord temps réel

### Protection des données

**Chiffrement :**
- Mots de passe : Jamais stockés côté serveur
- API Key 2captcha : Base64 encodée dans extension
- MongoDB : Encryption at rest (Atlas)
- HTTPS : Forcé sur Railway

**Logs IP :**
- Admins : IP complète visible
- Users : IP masquée (XXX.XXX.XXX.123)

### Rate Limiting

**TODO - À implémenter :**
```javascript
// Express rate limiter
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // 100 requests max
});

app.use('/api/', apiLimiter);
```

### Validation PayPal

**TODO - Vérification signature :**
```javascript
// Vérifier que le webhook vient bien de PayPal
const crypto = require('crypto');

function verifyPayPalSignature(payload, signature) {
  const hash = crypto
    .createHmac('sha256', PAYPAL_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return hash === signature;
}
```

---

## 🛠️ Maintenance

### Logs

**Railway logs :**
```bash
railway logs
railway logs --follow
```

**Filtrer les logs :**
```bash
railway logs | grep "[ERROR]"
railway logs | grep "[PAYPAL]"
railway logs | grep "[LICENSE]"
```

### Monitoring

**Métriques à surveiller :**
- Uptime de l'API
- Nombre de requêtes /api/verify
- Erreurs MongoDB
- Webhooks PayPal reçus
- Latence moyenne

**Outils recommandés :**
- Railway Dashboard (built-in metrics)
- MongoDB Atlas Monitoring
- Discord webhook pour alertes critiques

### Backup

**Automatique (MongoDB Atlas) :**
- Backups quotidiens
- Rétention 7 jours
- Point-in-time recovery

**Manuel :**
```bash
# Backup
mongodump --uri="MONGODB_URI" --out=/backup/$(date +%Y%m%d)

# Restore
mongorestore --uri="MONGODB_URI" /backup/20260125
```

### Nettoyage DB

**Cleanup licences expirées :**
```javascript
// Via /admin > Maintenance > Cleanup
// Ou MongoDB :
db.licenses.deleteMany({
  status: 'expired',
  expiresAt: { $lt: new Date(Date.now() - 7*24*60*60*1000) }
})
```

**Cleanup logs anciens (optionnel) :**
```javascript
// Garder 90 jours
db.logs.deleteMany({
  timestamp: { $lt: new Date(Date.now() - 90*24*60*60*1000) }
})
```

---

## 📊 Analytics

### Requêtes utiles

**Top 10 utilisateurs par votes :**
```javascript
db.licenses.find({ status: 'active' })
  .sort({ usageCount: -1 })
  .limit(10)
```

**Revenus du mois :**
```javascript
db.balances.aggregate([
  { $unwind: '$transactions' },
  {
    $match: {
      'transactions.type': 'debit',
      'transactions.timestamp': {
        $gte: new Date('2026-01-01'),
        $lt: new Date('2026-02-01')
      }
    }
  },
  { $group: { _id: null, total: { $sum: '$transactions.amount' } } }
])
```

**Taux de rétention :**
```javascript
// Licences renouvelées vs nouvelles
db.licenses.aggregate([
  {
    $group: {
      _id: { $month: '$createdAt' },
      count: { $sum: 1 }
    }
  }
])
```

---

## 🐛 Debugging

### Problèmes courants

#### Extension ne vote pas

**Diagnostic :**
1. Console Chrome : F12 > Console
2. Vérifier logs : `[Vote]`, `[LICENSE]`
3. Vérifier popup : Licence active ?

**Solutions :**
- Resynchroniser cooldown
- Vérifier identifiants serveur
- Réactiver la licence

#### API ne répond pas

**Diagnostic :**
```bash
railway logs --follow
curl https://your-app.railway.app/health
```

**Solutions :**
- Restart app : Railway Dashboard > Restart
- Vérifier MongoDB : Connection OK ?
- Vérifier variables d'environnement

#### PayPal webhook ne fonctionne pas

**Diagnostic :**
1. Railway logs : `[PAYPAL]`
2. PayPal Dashboard > IPN History
3. Tester avec PayPal Sandbox

**Solutions :**
- Vérifier URL webhook dans PayPal
- Vérifier que IPN est activé
- Tester signature PayPal

---

## 📞 Support

**Documentation :**
- Guide Utilisateur : `GUIDE_UTILISATEUR.md`
- Guide Admin : `GUIDE_ADMIN.md`
- README Technique : `README.md` (ce fichier)

**Contact :**
- Discord : https://discord.gg/qWDUE4xXCX
- GitHub Issues : https://github.com/YOUR_USERNAME/nemesis-vote/issues
- Email : support@nemesis-vote.com (si configuré)

---

## 📝 TODO / Roadmap

### Priorité Haute
- [ ] Vérification signature PayPal webhook
- [ ] Rate limiting API
- [ ] Tests unitaires (Jest)
- [ ] Documentation API (Swagger)

### Priorité Moyenne
- [ ] Graphiques stats (Chart.js)
- [ ] Export CSV transactions
- [ ] Backup cloud automatique
- [ ] Monitoring avancé (Sentry)

### Priorité Basse
- [ ] Multi-langues (EN/FR)
- [ ] App mobile (React Native)
- [ ] Système de badges/achievements
- [ ] Leaderboard public

---

## 📄 Licence

**Propriétaire :** Nemesis Vote  
**Type :** Propriétaire (Tous droits réservés)  
**Usage commercial :** Interdit sans autorisation

---

**Nemesis Vote - Technical Documentation**  
*Version 2.5.0 - 25/01/2026*
