// Tests du proxy captcha : node test-captcha-routes.cjs
//
// Entierement autonome : aucun appel reseau, aucune connexion MongoDB, et le
// vrai ./database n'est jamais charge (il ouvrirait une connexion et exigerait
// les variables d'environnement). On le remplace dans le cache de modules
// AVANT de charger captcha-routes.js, qui est teste tel quel.

const http = require('node:http');
const express = require('express');

process.env.TWOCAPTCHA_KEY = 'CLE-DE-TEST-FICTIVE';
process.env.CAPTCHA_DAILY_LIMIT = '2';
process.env.ADMIN_IDS = ' 180489956421140481 , 999999999999999999';  // espaces volontaires

// ---------- Faux ./database, injecte dans le cache de modules ----------
let licenceMode = 'ok';

function fakeIsAdmin(discordUserId) {
  if (!discordUserId) return false;
  return (process.env.ADMIN_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .includes(String(discordUserId).trim());
}

const dbPath = require.resolve('./database');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    isAdmin: fakeIsAdmin,
    verifyLicense: async (key) => licenceMode === 'bad'
      ? { valid: false, error: 'Licence invalide' }
      : { valid: true, license: { key, username: 'testeur', usageCount: 1 } },
  },
};

const { createCaptchaRouter, CaptchaTask } = require('./captcha-routes');

// ---------- Faux modele Mongoose ----------
let store = [];
let dbDown = false;
CaptchaTask.countDocuments = async (q) => {
  if (dbDown) throw new Error('connexion perdue');
  return store.filter(t => t.licenseKey === q.licenseKey).length;
};
CaptchaTask.create = async (doc) => { store.push(doc); return doc; };
CaptchaTask.findOne = async (q) => {
  if (dbDown) throw new Error('connexion perdue');
  const t = store.find(x => x.taskId === q.taskId);
  return t ? { ...t, save: async () => {} } : null;
};

// ---------- Faux 2captcha ----------
let upstreamMode = 'ok';
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  if (upstreamMode === 'error') {
    return { json: async () => ({ errorId: 1, errorCode: 'ERROR_ZERO_BALANCE', errorDescription: 'solde nul' }) };
  }
  if (String(url).endsWith('/createTask')) {
    if (body.clientKey !== 'CLE-DE-TEST-FICTIVE') throw new Error('mauvaise cle transmise a 2captcha');
    return { json: async () => ({ errorId: 0, taskId: 424242 }) };
  }
  return { json: async () => ({ errorId: 0, status: 'ready', solution: { token: 'TOKEN_OK' } }) };
};

// ---------- Harnais ----------
const app = express();
app.use(express.json());
app.use(createCaptchaRouter());

const PORT = 4599;
const base = `http://127.0.0.1:${PORT}`;

const parse = (b) => { try { return JSON.parse(b || '{}'); } catch { return { _html: String(b).slice(0, 40) }; } };

const post = (p, body) => new Promise((resolve) => {
  const data = JSON.stringify(body);
  const req = http.request(`${base}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  }, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: parse(b) })); });
  req.on('error', e => resolve({ status: 0, body: { error: e.message } }));
  req.end(data);
});

const get = (p) => new Promise((resolve) => {
  http.get(`${base}${p}`, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: parse(b) })); });
});

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { console.log(`  ok   ${name}`); pass++; }
  else { console.log(`  ECHEC ${name}  ${extra}`); fail++; }
};

const USER  = { licenseKey: 'AAAA-BBBB-CCCC-DDDD', discordUserId: '222222222222222222' };
const ADMIN = { licenseKey: 'ADMIN-KEY-0001',      discordUserId: '180489956421140481' };
const SITE  = { websiteURL: 'https://serveur-prive.net/dofus/karnak/vote', websiteKey: 'MTPublic-test' };

(async () => {
  const server = app.listen(PORT);
  let r;

  console.log('\n[1] Sonde de deploiement');
  r = await get('/api/captcha/health');
  check('health repond 200 et signale la cle configuree', r.status === 200 && r.body.configured === true, JSON.stringify(r.body));
  check('health annonce 2 admins et un quota admin illimite',
    r.body.adminsConfigured === 2 && r.body.adminDailyLimit === 'illimite', JSON.stringify(r.body));

  console.log('\n[2] Controle des entrees');
  r = await post('/api/captcha/create', { ...SITE });
  check('refuse sans licence (400)', r.status === 400, r.status);

  licenceMode = 'bad';
  r = await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', ...SITE });
  check('refuse une licence invalide (403)', r.status === 403, r.status);
  licenceMode = 'ok';

  r = await post('/api/captcha/create', { ...USER, type: 'recaptcha_v9', ...SITE });
  check('refuse un type de captcha inconnu (400)', r.status === 400, r.status);

  r = await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', websiteURL: 'https://evil.example.com/x', websiteKey: 'k' });
  check('refuse un domaine hors allowlist (400)', r.status === 400 && /Domaine/.test(r.body.error || ''), JSON.stringify(r.body));

  console.log('\n[3] Erreur upstream');
  upstreamMode = 'error';
  r = await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', ...SITE });
  check('traduit une erreur 2captcha en 502 sans fuiter le detail',
    r.status === 502 && !/solde nul|ZERO_BALANCE/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
  upstreamMode = 'ok';

  console.log('\n[4] Parcours nominal');
  store = [];
  r = await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', ...SITE });
  check('cree une tache et renvoie un taskId', r.status === 200 && r.body.taskId === '424242', JSON.stringify(r.body));
  const taskId = r.body.taskId;

  r = await post('/api/captcha/result', { ...USER, taskId });
  check('renvoie le token resolu', r.status === 200 && r.body.token === 'TOKEN_OK', JSON.stringify(r.body));

  console.log('\n[5] Cloisonnement entre licences');
  r = await post('/api/captcha/result', { licenseKey: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', discordUserId: USER.discordUserId, taskId });
  check('une autre licence ne peut pas lire cette tache (403)', r.status === 403, JSON.stringify(r.body));

  console.log('\n[6] Quota journalier (limite = 2)');
  store = [];
  await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', ...SITE });
  await post('/api/captcha/create', { ...USER, type: 'hcaptcha', ...SITE });
  r = await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', ...SITE });
  check('bloque au-dela du quota (429)', r.status === 429, JSON.stringify(r.body));

  console.log('\n[7] Panne MongoDB');
  dbDown = true;
  r = await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', ...SITE });
  check('repond du JSON, pas du HTML, si la base tombe', r.status === 503 && !r.body._html, JSON.stringify(r.body));
  dbDown = false;

  console.log('\n[8] Exemption admin');
  store = [];
  for (let i = 0; i < 5; i++) r = await post('/api/captcha/create', { ...ADMIN, type: 'mtcaptcha', ...SITE });
  check('un admin depasse le quota de 2 sans etre bloque', r.status === 200, JSON.stringify(r.body));

  r = await post('/api/captcha/create', { licenseKey: 'ADMIN-KEY-0002', discordUserId: '999999999999999999', type: 'mtcaptcha', ...SITE });
  check('les espaces dans ADMIN_IDS sont toleres (2e id reconnu)', r.status === 200, JSON.stringify(r.body));

  store = [];
  await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', ...SITE });
  await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', ...SITE });
  r = await post('/api/captcha/create', { ...USER, type: 'mtcaptcha', ...SITE });
  check('un non-admin reste bloque au quota (429)', r.status === 429, JSON.stringify(r.body));

  server.close();
  console.log(`\n${pass} reussis, ${fail} echoues\n`);
  process.exit(fail ? 1 : 0);
})();
