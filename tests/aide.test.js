const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let server, base, db, setParametre;

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-aide-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
  const dbModule = require('../src/db');
  db = dbModule.getDb();
  ({ setParametre } = require('../src/parametres'));
  const { hashPassword } = require('../src/auth');
  db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)').run('communes', null, 'Parties communes');
  const ins = db.prepare("INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?, ?, ?, ?, ?, 'resident', 0, 'actif', 1)");
  ins.run('resident@test.local', hashPassword('motdepasse1'), 'Resident', 'Jean', '0600');
  const { createApp } = require('../src/app');
  server = await new Promise(r => { const s = createApp().listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server && server.close());

async function client() {
  const cookies = {};
  return {
    async req(methode, url, body) {
      const headers = {};
      const ch = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      if (ch) headers.cookie = ch;
      let payload;
      if (body) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
      const res = await fetch(base + url, { method: methode, headers, body: payload, redirect: 'manual' });
      for (const sc of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
        const [pair] = sc.split(';');
        const i = pair.indexOf('=');
        cookies[pair.slice(0, i)] = pair.slice(i + 1);
      }
      return res;
    }
  };
}

async function login(c) {
  return c.req('POST', '/connexion', { email: 'resident@test.local', motdepasse: 'motdepasse1' });
}

test('aide : redirigé vers la connexion si non connecté', async () => {
  const c = await client();
  const res = await c.req('GET', '/aide');
  assert.strictEqual(res.status, 302);
  assert.ok((res.headers.get('location') || '').includes('/connexion'));
});

test('aide : accueil période de test par défaut (paramètre periode_test=1)', async () => {
  const c = await client();
  await login(c);
  const res = await c.req('GET', '/aide');
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('période de test'), 'accueil test affiché');
  assert.ok(html.includes('logement'), 'lien vers la page logement présent');
  assert.ok(html.includes('aide-nav'), 'sommaire latéral présent');
  assert.ok(html.includes('aide-recherche'), 'champ de recherche présent');
  assert.ok(html.includes('/aide/logement'), 'sommaire contient la page logement');
});

test('aide : page logement lisible, 404 sur page inconnue', async () => {
  const c = await client();
  await login(c);
  const res = await c.req('GET', '/aide/logement');
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('lot') && html.includes('locataire'));
  const nf = await c.req('GET', '/aide/page-inexistante');
  assert.strictEqual(nf.status, 404);
});

test('aide : recherche plain text (mot et phrase)', async () => {
  const c = await client();
  await login(c);
  const r1 = await c.req('GET', '/aide/recherche?q=fuite');
  assert.strictEqual(r1.status, 200);
  const h1 = await r1.text();
  assert.ok(h1.includes('Résultats'), 'page de résultats');
  assert.ok(h1.includes('<mark>'), 'surlignage présent');
  assert.ok(h1.includes('/aide/ticket'), 'la page ticket match "fuite"');
  const r2 = await c.req('GET', '/aide/recherche?q=' + encodeURIComponent('mot de passe oublié'));
  const h2 = await r2.text();
  assert.ok(h2.includes('/aide/compte'), 'phrase "mot de passe oublié" → page compte');
  const r3 = await c.req('GET', '/aide/recherche?q=zzzzrien');
  const h3 = await r3.text();
  assert.ok(h3.includes('Aucun résultat'));
});

test('aide : periode_test=0 → accueil = présentation, page de test retirée du sommaire', async () => {
  setParametre('periode_test', '0');
  const c = await client();
  await login(c);
  const res = await c.req('GET', '/aide');
  const html = await res.text();
  assert.strictEqual(res.status, 200);
  assert.ok(html.includes('Présentation'), 'accueil = présentation');
  assert.ok(!html.includes('période de test'), 'accueil test masqué');
  assert.ok(!html.includes('/aide/accueil-test'), 'page de test retirée du sommaire');
  setParametre('periode_test', '1');
});

test('aide : ouverture contextuelle via ?depuis=<chemin de la page>', async () => {
  const c = await client();
  await login(c);
  const r1 = await c.req('GET', '/aide?depuis=' + encodeURIComponent('/tickets'));
  assert.strictEqual(r1.status, 200);
  const h1 = await r1.text();
  assert.ok(h1.includes('Déclarer et suivre un ticket'), 'depuis /tickets → page ticket');
  const r2 = await c.req('GET', '/aide?depuis=' + encodeURIComponent('/tickets/12'));
  const h2 = await r2.text();
  assert.ok(h2.includes('Déclarer et suivre un ticket'), 'depuis /tickets/12 → page ticket (préfixe)');
  const r3 = await c.req('GET', '/aide?depuis=' + encodeURIComponent('/documents'));
  const h3 = await r3.text();
  assert.ok(h3.includes('Documents de la copropriété'), 'depuis /documents → page documents');
  const r4 = await c.req('GET', '/aide?depuis=' + encodeURIComponent('/admin/lots'));
  const h4 = await r4.text();
  assert.ok(h4.includes('Lots et tantièmes'), 'depuis /admin/lots → page lots (préfixe le plus long)');
  const r5 = await c.req('GET', '/aide?depuis=' + encodeURIComponent('/page-inconnue'));
  const h5 = await r5.text();
  assert.strictEqual(r5.status, 200);
  assert.ok(h5.includes('période de test'), 'depuis inconnu → accueil par défaut (période de test)');
  setParametre('periode_test', '0');
  const r6 = await c.req('GET', '/aide?depuis=' + encodeURIComponent('/notifications'));
  const h6 = await r6.text();
  assert.ok(h6.includes('Notifications'), 'hors période de test, depuis gagne encore sur l\'accueil');
  setParametre('periode_test', '1');
});

test('aide : le lien « ? » du header embarque le chemin courant (depuis=)', async () => {
  const c = await client();
  await login(c);
  const res = await c.req('GET', '/tickets');
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('/aide?depuis=' + encodeURIComponent('/tickets')), 'lien ? avec depuis=/tickets');
});
