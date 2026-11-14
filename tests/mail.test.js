const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let server, base, dbDir;

before(async () => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-mail-test-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
  const { getDb } = require('../src/db');
  const { hashPassword } = require('../src/auth');
  const db = getDb();
  db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)').run('villa', 1, 'Villa 1');
  db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)').run('communes', null, 'Parties communes');
  const mdp = hashPassword('motdepasse1');
  db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?,?,?,?,?,?,?,?,1)')
    .run('cs-verifie@test.local', mdp, 'CS', 'Vérifié', '0601', 'resident', 1, 'actif');
  db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?,?,?,?,?,?,?,?,0)')
    .run('cs-nonverifie@test.local', mdp, 'CS', 'NonVérifié', '0602', 'resident', 1, 'actif');
  const { createApp } = require('../src/app');
  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fs.rmSync(dbDir, { recursive: true, force: true }); });

function db() { return require('../src/db').getDb(); }

test('inscription : email non vérifié + jeton de validation créé', async () => {
  const res = await fetch(base + '/inscription', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      nom: 'Test', prenom: 'Tom', telephone: '0605', email: 'tom@test.local',
      motdepasse: 'motdepasse1', unite_id: '1', qualite: 'proprietaire'
    }),
    redirect: 'manual'
  });
  assert.strictEqual(res.status, 200);
  const u = db().prepare("SELECT email_verifie FROM users WHERE email='tom@test.local'").get();
  assert.strictEqual(u.email_verifie, 0);
  const jeton = db().prepare("SELECT token FROM email_verifications ev JOIN users u ON u.id = ev.user_id WHERE u.email='tom@test.local' AND used_at IS NULL").get();
  assert.ok(jeton && jeton.token.length >= 32);
});

test('validation par lien : email_verifie passe à 1, jeton consommé, mauvais lien = 400', async () => {
  const jeton = db().prepare("SELECT ev.token FROM email_verifications ev JOIN users u ON u.id = ev.user_id WHERE u.email='tom@test.local' AND used_at IS NULL").get();
  const res = await fetch(`${base}/verifier-email?token=${jeton.token}`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(db().prepare("SELECT email_verifie FROM users WHERE email='tom@test.local'").get().email_verifie, 1);
  assert.strictEqual(db().prepare('SELECT used_at FROM email_verifications WHERE token = ?').get(jeton.token).used_at !== null, true);
  const mauvais = await fetch(`${base}/verifier-email?token=bidon`, { redirect: 'manual' });
  assert.strictEqual(mauvais.status, 400);
});

test('liste de diffusion CS : seuls les membres CS avec email vérifié', async () => {
  const { membresCSAvecEmailVerifie } = require('../src/mailcow');
  const liste = membresCSAvecEmailVerifie();
  assert.deepStrictEqual(liste, ['cs-verifie@test.local']);
});

test('synchro alias sans clé API : ignorée sans erreur', async () => {
  const { synchroniserAliasCS } = require('../src/mailcow');
  delete process.env.MAILCOW_API_KEY;
  assert.strictEqual(await synchroniserAliasCS(), false);
});

test('profil : la case notifications par email met à jour notif_email', async () => {
  const cookies = {};
  const loginRes = await fetch(base + '/connexion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cs-verifie@test.local', motdepasse: 'motdepasse1' }),
    redirect: 'manual'
  });
  const sid = loginRes.headers.getSetCookie()[0].split(';')[0];
  const res = await fetch(base + '/profil', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: sid },
    body: new URLSearchParams({ nom: 'CS', prenom: 'Vérifié', telephone: '0601', notif_email: '1' }),
    redirect: 'manual'
  });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(db().prepare("SELECT notif_email FROM users WHERE email='cs-verifie@test.local'").get().notif_email, 1);
});
