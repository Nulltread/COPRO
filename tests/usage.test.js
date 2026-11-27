const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let server, base, dbDir;

function tmpEnv() {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-usage-test-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
}

async function client() {
  const cookies = {};
  return {
    async req(methode, url, body, formData, headersExtra) {
      const headers = { ...(headersExtra || {}) };
      const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      if (cookieHeader) headers.cookie = cookieHeader;
      let payload;
      if (formData) payload = formData;
      else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
      const res = await fetch(base + url, { method: methode, headers, body: payload, redirect: 'manual' });
      for (const sc of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
        const [pair] = sc.split(';');
        const idx = pair.indexOf('=');
        cookies[pair.slice(0, idx)] = pair.slice(idx + 1);
      }
      return res;
    },
    cookies
  };
}

async function login(c, email, mdp) {
  return c.req('POST', '/connexion', { email, motdepasse: mdp });
}

let ids = {};

before(async () => {
  tmpEnv();
  const { getDb } = require('../src/db');
  const { hashPassword } = require('../src/auth');
  const db = getDb();
  const insU = db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)');
  ids.villa1 = insU.run('villa', 1, 'Villa 1').lastInsertRowid;
  ids.communes = insU.run('communes', null, 'Parties communes').lastInsertRowid;
  const mdp = hashPassword('motdepasse1');
  const insUser = db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?,?,?,?,?,?,?,?,1)');
  ids.admin = insUser.run('admin@test.local', mdp, 'Admin', 'Admin', '0600', 'admin', 0, 'actif').lastInsertRowid;
  ids.cs = insUser.run('cs@test.local', mdp, 'Conseil', 'Claire', '0601', 'resident', 1, 'actif').lastInsertRowid;
  ids.r1 = insUser.run('r1@test.local', mdp, 'Resident 1', 'Jean', '0602', 'resident', 0, 'actif').lastInsertRowid;
  ids.r2 = insUser.run('r2@test.local', mdp, 'Resident 2', 'Marie', '0603', 'resident', 0, 'actif').lastInsertRowid;
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(ids.villa1, ids.r1, 'proprietaire');
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(ids.villa1, ids.r2, 'locataire');
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(ids.communes, ids.cs, 'proprietaire');

  const { createApp } = require('../src/app');
  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fs.rmSync(dbDir, { recursive: true, force: true }); });

function db() { return require('../src/db').getDb(); }

function nbConnexions(userId) {
  return db().prepare('SELECT COUNT(*) AS n FROM connexions WHERE user_id = ?').get(userId).n;
}

function nbPageViews(userId, chemin) {
  return db().prepare('SELECT COUNT(*) AS n FROM page_views WHERE user_id = ? AND chemin = ?').get(userId, chemin).n;
}

function audits(type, auteurId) {
  return db().prepare('SELECT * FROM audit_log WHERE type = ? AND auteur_id IS ?').all(type, auteurId);
}

test('chaque connexion reussie est enregistree dans connexions', async () => {
  const c = await client();
  assert.strictEqual((await login(c, 'r1@test.local', 'motdepasse1')).status, 302);
  assert.strictEqual(nbConnexions(ids.r1), 1);
  await login(c, 'r1@test.local', 'motdepasse1');
  assert.strictEqual(nbConnexions(ids.r1), 2);
  // echec de connexion : rien d'enregistre
  const c2 = await client();
  assert.strictEqual((await login(c2, 'r1@test.local', 'mauvais')).status, 401);
  assert.strictEqual(nbConnexions(ids.r1), 2);
});

test('les consultations de pages HTML sont tracees (sauf /, telechargements, export)', async () => {
  const c = await client();
  await login(c, 'r1@test.local', 'motdepasse1');
  await c.req('GET', '/tickets', undefined, undefined, { accept: 'text/html' });
  await c.req('GET', '/tickets', undefined, undefined, { accept: 'text/html' });
  await c.req('GET', '/', undefined, undefined, { accept: 'text/html' });
  await c.req('GET', '/profil/export', undefined, undefined, { accept: '*/*' });
  assert.strictEqual(nbPageViews(ids.r1, '/tickets'), 2);
  assert.strictEqual(nbPageViews(ids.r1, '/'), 0);
  assert.strictEqual(nbPageViews(ids.r1, '/profil/export'), 0);
});

test('creation, modification et suppression de ticket alimentent le journal', async () => {
  const c = await client();
  await login(c, 'r1@test.local', 'motdepasse1');
  const res = await c.req('POST', '/tickets', { titre: 'Fuite toit', description: 'desc', unite_ids: [String(ids.villa1)] });
  assert.strictEqual(res.status, 302);
  const tid = Number(res.headers.get('location').split('/').pop());
  const crees = audits('ticket_cree', ids.r1);
  assert.strictEqual(crees.length, 1);
  assert.strictEqual(crees[0].entite, 'ticket');
  assert.strictEqual(Number(crees[0].entite_id), tid);
  assert.ok(crees[0].contenu.includes('Fuite toit'));

  await c.req('POST', `/tickets/${tid}/editer`, { description: 'description modifiee' });
  assert.strictEqual(audits('ticket_modifie', ids.r1).length, 1);

  await c.req('POST', `/tickets/${tid}/supprimer`);
  assert.strictEqual(audits('ticket_supprime', ids.r1).length, 1);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM tickets WHERE id = ?').get(tid).n, 0);
  // l'entree de journal conserve le titre meme apres suppression du ticket
  assert.ok(audits('ticket_supprime', ids.r1)[0].contenu.includes('Fuite toit'));
});

test('ajout de document de copropriete alimente le journal', async () => {
  const cs = await client();
  await login(cs, 'cs@test.local', 'motdepasse1');
  const form = new FormData();
  form.append('categorie', 'juridique');
  form.append('niveau', 'commun');
  form.append('fichiers', new Blob(['PDF factice'], { type: 'application/pdf' }), 'contrat.pdf');
  const res = await cs.req('POST', '/documents', undefined, form);
  assert.strictEqual(res.status, 302);
  const ajoutes = audits('document_ajoute', ids.cs);
  assert.strictEqual(ajoutes.length, 1);
  assert.strictEqual(ajoutes[0].entite, 'document');
  assert.ok(ajoutes[0].contenu.includes('contrat.pdf'));
});

test('/admin/usage : admin seul, sections presentes, filtre par page', async () => {
  const anonyme = await client();
  assert.strictEqual((await anonyme.req('GET', '/admin/usage')).status, 302);

  const cs = await client();
  await login(cs, 'cs@test.local', 'motdepasse1');
  const resCs = await cs.req('GET', '/admin/usage');
  assert.strictEqual(resCs.status, 403);

  const admin = await client();
  await login(admin, 'admin@test.local', 'motdepasse1');
  const res = await admin.req('GET', '/admin/usage', undefined, undefined, { accept: 'text/html' });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Mesure de l\'usage'));
  assert.ok(html.includes('Connexions par compte'));
  assert.ok(html.includes('Pages consultées'));
  assert.ok(html.includes('Journal d\'activité'));
  assert.ok(html.includes('graphe-barre'), 'barregraphe SVG present');
  assert.ok(html.includes('value="/tickets"'), 'option de filtre /tickets presente');
  assert.ok(html.includes('Ticket créé'), 'journal affiche le libelle du type');
  assert.ok(html.includes('Jean Resident 1') || html.includes('Resident 1 Jean'), 'connexions par compte affichees');

  const resFiltre = await admin.req('GET', '/admin/usage?page=' + encodeURIComponent('/tickets'), undefined, undefined, { accept: 'text/html' });
  assert.strictEqual(resFiltre.status, 200);
  const htmlFiltre = await resFiltre.text();
  assert.ok(htmlFiltre.includes('value="/tickets" selected'), 'filtre par page selectionne');
});

test('suppression de compte : connexions/pages vues supprimees, journal anonymise', async () => {
  const c = await client();
  await login(c, 'r2@test.local', 'motdepasse1');
  await c.req('GET', '/tickets', undefined, undefined, { accept: 'text/html' });
  const res = await c.req('POST', '/tickets', { titre: 'Test r2', description: 'd', unite_ids: [String(ids.villa1)] });
  const tid = Number(res.headers.get('location').split('/').pop());
  assert.strictEqual(nbConnexions(ids.r2), 1);
  assert.strictEqual(nbPageViews(ids.r2, '/tickets'), 1);
  assert.strictEqual(audits('ticket_cree', ids.r2).length, 1);

  const sup = await c.req('POST', '/profil/supprimer');
  assert.strictEqual(sup.status, 302);
  assert.strictEqual(nbConnexions(ids.r2), 0);
  assert.strictEqual(nbPageViews(ids.r2, '/tickets'), 0);
  // le journal garde l'entree mais l'auteur est anonymise
  const entrees = db().prepare('SELECT * FROM audit_log WHERE entite_id = ? AND type = ?').all(tid, 'ticket_cree');
  assert.strictEqual(entrees.length, 1);
  assert.strictEqual(entrees[0].auteur_id, null);
  // et la page admin l'affiche comme "Compte supprimé"
  const admin = await client();
  await login(admin, 'admin@test.local', 'motdepasse1');
  const html = await (await admin.req('GET', '/admin/usage?type=ticket_cree', undefined, undefined, { accept: 'text/html' })).text();
  assert.ok(html.includes('Compte supprimé'));
});
