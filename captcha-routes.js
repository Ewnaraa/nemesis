// ========== PROXY CAPTCHA ==========
//
// Les cles 2captcha / CapSolver etaient embarquees dans l'extension Chrome,
// encodees en base64 sous le nom PROTECTED_KEY. base64 n'est pas du
// chiffrement : n'importe quel utilisateur pouvait les extraire et consommer
// le solde. Elles vivent desormais ici, dans process.env, cote serveur.
//
// Effet de bord voulu : la licence devient reellement contraignante. Jusqu'ici
// tout le controle etait cote client (un chrome.storage.local.set suffisait a
// se declarer active). Maintenant, sans licence valide, pas de resolution de
// captcha - donc pas de vote.

const express = require('express');
const mongoose = require('mongoose');
const { verifyLicense, isAdmin } = require('./database');

const TWOCAPTCHA_API = 'https://api.2captcha.com';

// Types autorises. On ne laisse pas le client choisir librement le type de
// tache facturee.
const TASK_TYPES = {
  mtcaptcha: 'MtCaptchaTaskProxyless',
  hcaptcha: 'HCaptchaTaskProxyless',
};

// Seuls les domaines reellement utilises par l'extension. Sans cette liste,
// une licence volee devient un resolveur de captcha gratuit pour n'importe
// quel site, facture sur ton compte.
const ALLOWED_HOSTS = new Set([
  'serveur-prive.net', 'www.serveur-prive.net',
  'karnak-retro.net',
  'hyperion-game.fr',
  'minya.fr', 'www.minya.fr',
  'play-velora.net',
  'playrafal.com',
  'retrozia.fun',
]);

const DAILY_LIMIT = Number(process.env.CAPTCHA_DAILY_LIMIT || 60);

// Plafond admin. 0 = illimite (defaut). Mettre une valeur pour garder un
// filet : si une cle admin fuite, un quota illimite = depense illimitee sur
// le compte 2captcha, sans rien pour l'arreter.
const ADMIN_DAILY_LIMIT = Number(process.env.ADMIN_CAPTCHA_DAILY_LIMIT || 0);

// --- Modele de suivi des taches (quota + verification du proprietaire) ---
const captchaTaskSchema = new mongoose.Schema({
  taskId: { type: String, required: true, unique: true },
  licenseKey: { type: String, required: true },
  discordUserId: { type: String },
  type: { type: String },
  host: { type: String },
  solved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
captchaTaskSchema.index({ licenseKey: 1, createdAt: -1 });
// Purge automatique apres 30 jours : ces documents ne servent qu'au quota.
// Sans ca, cette collection grossit comme l'a fait `logs` (149 000 documents).
captchaTaskSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

const CaptchaTask = mongoose.models.CaptchaTask
  || mongoose.model('CaptchaTask', captchaTaskSchema);

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.ip;
}

// Authentification par licence, commune aux deux routes.
// isRealUsage = false : resoudre un captcha n'est pas un vote, ca ne doit pas
// incrementer usageCount.
async function requireLicense(req, res, next) {
  try {
    const { licenseKey, discordUserId } = req.body || {};
    if (!licenseKey || !discordUserId) {
      return res.status(400).json({ error: 'licenseKey et discordUserId requis' });
    }

    const result = await verifyLicense(licenseKey, clientIp(req), discordUserId, false);
    if (!result || !result.valid) {
      console.log(`[CAPTCHA] Licence refusee: ${licenseKey} (${result?.error})`);
      return res.status(403).json({ error: result?.error || 'Licence invalide' });
    }

    req.licenseKey = licenseKey;
    req.discordUserId = discordUserId;
    req.isAdmin = isAdmin(discordUserId);
    next();
  } catch (err) {
    console.error('[CAPTCHA] Verification licence:', err);
    res.status(500).json({ error: 'Erreur interne' });
  }
}

function createCaptchaRouter() {
  const router = express.Router();
  const apiKey = process.env.TWOCAPTCHA_KEY;

  // Sonde de deploiement. Tant que /api/captcha/* n'existe pas, l'extension
  // retombe sur une cle locale ; cette route permet de verifier d'un coup
  // d'oeil que le proxy est bien en ligne.
  router.get('/api/captcha/health', (req, res) => {
    res.json({
      ok: true,
      configured: Boolean(apiKey),
      dailyLimit: DAILY_LIMIT,
      adminDailyLimit: ADMIN_DAILY_LIMIT || 'illimite',
      adminsConfigured: (process.env.ADMIN_IDS || '').split(',').filter(s => s.trim()).length
    });
  });

  router.post('/api/captcha/create', requireLicense, async (req, res) => {
    if (!apiKey) {
      console.error('[CAPTCHA] TWOCAPTCHA_KEY absente des variables Railway');
      return res.status(503).json({ error: 'Proxy captcha non configure' });
    }

    const { type, websiteURL, websiteKey } = req.body;

    const taskType = TASK_TYPES[type];
    if (!taskType) return res.status(400).json({ error: `Type non autorise: ${type}` });
    if (!websiteKey) return res.status(400).json({ error: 'websiteKey manquante' });

    let host;
    try {
      host = new URL(websiteURL).host;
    } catch {
      return res.status(400).json({ error: 'websiteURL invalide' });
    }
    if (!ALLOWED_HOSTS.has(host)) {
      console.warn(`[CAPTCHA] Domaine refuse (${host}) pour ${req.licenseKey}`);
      return res.status(400).json({ error: 'Domaine non autorise' });
    }

    // Quota : une licence compromise ne doit pas pouvoir vider le solde.
    // Enveloppe dans un try : sans ca, une panne MongoDB fait remonter une
    // exception non geree et Express repond une page HTML, que l'extension
    // ne sait pas lire (elle attend du JSON).
    let used;
    try {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      used = await CaptchaTask.countDocuments({
        licenseKey: req.licenseKey,
        createdAt: { $gte: since },
      });
    } catch (err) {
      console.error('[CAPTCHA] Lecture du quota impossible:', err.message);
      return res.status(503).json({ error: 'Base de donnees indisponible' });
    }

    // Les admins ne sont pas soumis au quota standard. L'usage reste journalise
    // pour rester visible dans les logs Railway.
    const effectiveLimit = req.isAdmin ? ADMIN_DAILY_LIMIT : DAILY_LIMIT;

    if (effectiveLimit > 0 && used >= effectiveLimit) {
      console.warn(`[CAPTCHA] Quota atteint (${used}/${effectiveLimit}) pour ${req.licenseKey}`);
      return res.status(429).json({ error: 'Quota journalier de captcha atteint' });
    }

    try {
      const upstream = await fetch(`${TWOCAPTCHA_API}/createTask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: apiKey,
          task: { type: taskType, websiteURL, websiteKey },
        }),
      });
      const data = await upstream.json();

      if (data.errorId !== 0) {
        // Journalise le detail, ne le renvoie pas : la reponse 2captcha peut
        // contenir des informations sur le compte.
        console.error('[CAPTCHA] createTask:', data.errorCode, data.errorDescription);
        return res.status(502).json({ error: 'Service de captcha indisponible' });
      }

      await CaptchaTask.create({
        taskId: String(data.taskId),
        licenseKey: req.licenseKey,
        discordUserId: req.discordUserId,
        type,
        host,
      });

      const quotaLabel = effectiveLimit > 0 ? `${used + 1}/${effectiveLimit}` : `${used + 1}/illimite`;
      console.log(`[CAPTCHA]${req.isAdmin ? ' [ADMIN]' : ''} Tache ${data.taskId} (${type}) pour ${req.licenseKey} — ${quotaLabel}`);
      res.json({ taskId: String(data.taskId) });
    } catch (err) {
      console.error('[CAPTCHA] createTask:', err);
      res.status(502).json({ error: 'Service de captcha indisponible' });
    }
  });

  router.post('/api/captcha/result', requireLicense, async (req, res) => {
    if (!apiKey) return res.status(503).json({ error: 'Proxy captcha non configure' });

    const taskId = String(req.body.taskId || '');
    if (!taskId) return res.status(400).json({ error: 'taskId requis' });

    // Une licence ne lit que ses propres taches, sinon n'importe qui peut
    // moissonner les tokens payes par les autres.
    let task;
    try {
      task = await CaptchaTask.findOne({ taskId });
    } catch (err) {
      console.error('[CAPTCHA] Lecture de la tache impossible:', err.message);
      return res.status(503).json({ error: 'Base de donnees indisponible' });
    }
    if (!task || task.licenseKey !== req.licenseKey) {
      return res.status(403).json({ error: 'Tache inconnue' });
    }

    try {
      const upstream = await fetch(`${TWOCAPTCHA_API}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      });
      const data = await upstream.json();

      if (data.errorId !== 0) {
        console.error('[CAPTCHA] getTaskResult:', data.errorCode, data.errorDescription);
        return res.status(502).json({ error: 'Service de captcha indisponible' });
      }
      if (data.status !== 'ready') return res.json({ status: 'processing' });

      const token = data.solution?.token || data.solution?.gRecaptchaResponse;
      if (!token) return res.status(502).json({ error: 'Reponse captcha sans token' });

      task.solved = true;
      await task.save();
      res.json({ status: 'ready', token });
    } catch (err) {
      console.error('[CAPTCHA] getTaskResult:', err);
      res.status(502).json({ error: 'Service de captcha indisponible' });
    }
  });

  // Filet de securite : toute exception non rattrapee dans ce routeur repond
  // en JSON plutot qu'en page HTML Express.
  router.use((err, req, res, next) => {
    if (!req.path.startsWith('/api/captcha/')) return next(err);
    console.error('[CAPTCHA] Erreur non geree:', err);
    res.status(500).json({ error: 'Erreur interne' });
  });

  return router;
}

module.exports = { createCaptchaRouter, CaptchaTask, ALLOWED_HOSTS, TASK_TYPES };
