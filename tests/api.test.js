const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let server, base, dbDir;

function tmpEnv() {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-test-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
}

async function client() {
  const cookies = {};
  return {
    async req(methode, url, body, formData) {
      const headers = {};
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

before(async () => {
  tmpEnv();
  const { getDb } = require('../src/db');
  const { hashPassword } = require('../src/auth');
  const db = getDb();
  db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)').run('villa', 1, 'Villa 1');
  db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)').run('villa', 2, 'Villa 2');
  db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)').run('garage', 1, 'Garage 1');
  const mdp = hashPassword('motdepasse1');
  const r1 = db.prepare('INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?,?,?,?,?)').run('r1@test.local', mdp, 'Resident 1', 'resident', 'valide').lastInsertRowid;
  const r2 = db.prepare('INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?,?,?,?,?)').run('r2@test.local', mdp, 'Resident 2', 'resident', 'valide').lastInsertRowid;
  const sy = db.prepare('INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?,?,?,?,?)').run('syndic@test.local', mdp, 'Syndic', 'syndic', 'valide').lastInsertRowid;
  const enAttente = db.prepare('INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?,?,?,?,?)').run('attente@test.local', mdp, 'Attente', 'resident', 'en_attente').lastInsertRowid;
  const villa1 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id;
  const villa2 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=2").get().id;
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(villa1, r1, 'proprietaire');
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(villa2, r2, 'proprietaire');
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(villa2, enAttente, 'locataire');

  const { createApp } = require('../src/app');
  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fs.rmSync(dbDir, { recursive: true, force: true }); });

test('connexion avec mauvais mot de passe échoue', async () => {
  const c = await client();
  const res = await login(c, 'r1@test.local', 'mauvais');
  assert.strictEqual(res.status, 401);
});

test('compte non validé ne peut pas accéder aux tickets', async () => {
  const c = await client();
  await login(c, 'attente@test.local', 'motdepasse1');
  const res = await c.req('GET', '/tickets');
  assert.strictEqual(res.status, 403);
});

test('résident crée un ticket sur sa villa', async () => {
  const c = await client();
  await login(c, 'r1@test.local', 'motdepasse1');
  const db = require('../src/db').getDb();
  const villa1 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id;
  const res = await c.req('POST', '/tickets', { titre: 'Fuite robinet', description: 'ça goutte', categorie: 'Plomberie', unite_ids: [String(villa1)], urgent: '1' });
  assert.strictEqual(res.status, 302);
  const loc = res.headers.get('location');
  assert.match(loc, /^\/tickets\/\d+$/);
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(Number(loc.split('/').pop()));
  assert.strictEqual(ticket.etape, 'declaration');
  assert.strictEqual(ticket.urgent, 1);
});

test('résident ne peut pas créer de ticket sur la villa d\'un autre', async () => {
  const c = await client();
  await login(c, 'r1@test.local', 'motdepasse1');
  const db = require('../src/db').getDb();
  const villa2 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=2").get().id;
  const res = await c.req('POST', '/tickets', { titre: 'Test', categorie: 'Autre', unite_ids: [String(villa2)] });
  assert.strictEqual(res.status, 403);
});

test('visibilité : un résident ne voit pas le ticket de l\'autre villa', async () => {
  const c1 = await client(); await login(c1, 'r1@test.local', 'motdepasse1');
  const c2 = await client(); await login(c2, 'r2@test.local', 'motdepasse1');
  const db = require('../src/db').getDb();
  const villa2 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=2").get().id;
  const res = await c2.req('POST', '/tickets', { titre: 'Ticket villa 2', categorie: 'Autre', unite_ids: [String(villa2)] });
  const tid = Number(res.headers.get('location').split('/').pop());
  const resR1 = await c1.req('GET', '/tickets/' + tid);
  assert.strictEqual(resR1.status, 404);
  const resR2 = await c2.req('GET', '/tickets/' + tid);
  assert.strictEqual(resR2.status, 200);
  const listeR1 = await (await c1.req('GET', '/tickets')).text();
  assert.ok(!listeR1.includes('Ticket villa 2'));
});

test('cycle de vie : transitions contrôlées par le syndic', async () => {
  const cs = await client(); await login(cs, 'syndic@test.local', 'motdepasse1');
  const cr = await client(); await login(cr, 'r1@test.local', 'motdepasse1');
  const db = require('../src/db').getDb();
  const villa1 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id;
  const res = await cr.req('POST', '/tickets', { titre: 'Cycle test', categorie: 'Électricité', unite_ids: [String(villa1)] });
  const tid = Number(res.headers.get('location').split('/').pop());

  const resInterdit = await cr.req('POST', `/tickets/${tid}/transition`, { etape: 'consultation' });
  assert.strictEqual(resInterdit.status, 403);

  const resSaut = await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'planification' });
  assert.strictEqual(resSaut.status, 400);

  const resOk = await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'consultation' });
  assert.strictEqual(resOk.status, 302);
  assert.strictEqual(db.prepare('SELECT etape FROM tickets WHERE id = ?').get(tid).etape, 'consultation');

  for (const e of ['attribution', 'planification', 'reception']) {
    const r = await cs.req('POST', `/tickets/${tid}/transition`, { etape: e });
    assert.strictEqual(r.status, 302);
  }
  const resRetourSansMotif = await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'planification' });
  assert.strictEqual(resRetourSansMotif.status, 400);
  const resRetour = await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'planification', motif: 'Travaux non satisfaisants' });
  assert.strictEqual(resRetour.status, 302);
  assert.strictEqual(db.prepare('SELECT etape FROM tickets WHERE id = ?').get(tid).etape, 'planification');

  await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'reception' });
  await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'cloture' });
  assert.strictEqual(db.prepare('SELECT etape FROM tickets WHERE id = ?').get(tid).etape, 'cloture');
  const resApresCloture = await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'consultation' });
  assert.strictEqual(resApresCloture.status, 400);
});

test('fichiers : upload puis contrôle d\'accès au téléchargement', async () => {
  const cs = await client(); await login(cs, 'syndic@test.local', 'motdepasse1');
  const cr1 = await client(); await login(cr1, 'r1@test.local', 'motdepasse1');
  const cr2 = await client(); await login(cr2, 'r2@test.local', 'motdepasse1');
  const db = require('../src/db').getDb();
  const villa1 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id;
  const res = await cr1.req('POST', '/tickets', { titre: 'Ticket avec facture', categorie: 'Plomberie', unite_ids: [String(villa1)] });
  const tid = Number(res.headers.get('location').split('/').pop());

  const form = new FormData();
  form.append('categorie', 'facture');
  form.append('montant', '150.50');
  form.append('fichiers', new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }), 'facture.pdf');
  const resUp = await cr1.req('POST', `/tickets/${tid}/fichiers`, undefined, form);
  assert.strictEqual(resUp.status, 302);

  const f = db.prepare('SELECT * FROM fichiers WHERE ticket_id = ?').get(tid);
  assert.strictEqual(f.categorie, 'facture');
  assert.strictEqual(f.montant, 150.5);

  const okMoi = await cr1.req('GET', '/fichiers/' + f.id);
  assert.strictEqual(okMoi.status, 200);
  const syndic = await cs.req('GET', '/fichiers/' + f.id);
  assert.strictEqual(syndic.status, 200);
  const autre = await cr2.req('GET', '/fichiers/' + f.id);
  assert.strictEqual(autre.status, 403);

  const typeInterdit = new FormData();
  typeInterdit.append('categorie', 'photo');
  typeInterdit.append('fichiers', new Blob(['x'], { type: 'text/html' }), 'page.html');
  const resBad = await cr1.req('POST', `/tickets/${tid}/fichiers`, undefined, typeInterdit);
  assert.strictEqual(resBad.status, 400);
});

test('notifications créées pour les concernés à la création d\'un ticket urgent', async () => {
  const cr1 = await client(); await login(cr1, 'r1@test.local', 'motdepasse1');
  const db = require('../src/db').getDb();
  const villa1 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id;
  const res = await cr1.req('POST', '/tickets', { titre: 'Urgence notif', categorie: 'Plomberie', unite_ids: [String(villa1)], urgent: '1' });
  const tid = Number(res.headers.get('location').split('/').pop());
  const syndicId = db.prepare("SELECT id FROM users WHERE email='syndic@test.local'").get().id;
  const n = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND ticket_id = ?').get(syndicId, tid).n;
  assert.ok(n >= 1);
});

test('inscription : nouveau compte en attente de validation', async () => {
  const c = await client();
  const db = require('../src/db').getDb();
  const villa1 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id;
  const res = await c.req('POST', '/inscription', { nom: 'Nouveau', email: 'nouveau@test.local', motdepasse: 'motdepasse1', unite_id: String(villa1), qualite: 'locataire' });
  assert.strictEqual(res.status, 200);
  const u = db.prepare("SELECT statut FROM users WHERE email='nouveau@test.local'").get();
  assert.strictEqual(u.statut, 'en_attente');
});

test('décision : un avenant retenu s\'ajoute au devis retenu (cumul)', async () => {
  const cs = await client(); await login(cs, 'syndic@test.local', 'motdepasse1');
  const cr1 = await client(); await login(cr1, 'r1@test.local', 'motdepasse1');
  const db = require('../src/db').getDb();
  const villa1 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id;
  const res = await cr1.req('POST', '/tickets', { titre: 'Cumul devis+avenant', categorie: 'Toiture', unite_ids: [String(villa1)] });
  const tid = Number(res.headers.get('location').split('/').pop());
  async function addFichier(categorie, montant) {
    const form = new FormData();
    form.append('categorie', categorie);
    form.append('montant', String(montant));
    form.append('entreprise', 'Entreprise X');
    form.append('fichiers', new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), categorie + '.pdf');
    await cr1.req('POST', `/tickets/${tid}/fichiers`, undefined, form);
  }
  await addFichier('devis', 1000);
  await addFichier('avenant', 250);
  const fichiers = db.prepare("SELECT * FROM fichiers WHERE ticket_id = ? ORDER BY id").all(tid);
  await cs.req('POST', `/tickets/${tid}/decision`, { fichier_id: String(fichiers[0].id), justification: 'devis retenu' });
  await cs.req('POST', `/tickets/${tid}/decision`, { fichier_id: String(fichiers[1].id), justification: 'avenant retenu' });
  const retenus = db.prepare("SELECT COUNT(*) AS n FROM fichiers WHERE ticket_id = ? AND retenu = 1").get(tid).n;
  assert.strictEqual(retenus, 2);
  const total = db.prepare("SELECT COALESCE(SUM(montant),0) AS t FROM fichiers WHERE ticket_id = ? AND retenu = 1").get(tid).t;
  assert.strictEqual(total, 1250);
});

test('RGPD : export JSON et suppression de compte', async () => {
  const c = await client();
  await c.req('POST', '/inscription', { nom: 'RGPD Test', email: 'rgpd@test.local', motdepasse: 'motdepasse1', unite_id: '1', qualite: 'proprietaire' });
  const db = require('../src/db').getDb();
  db.prepare("UPDATE users SET statut = 'valide' WHERE email = 'rgpd@test.local'").run();
  await login(c, 'rgpd@test.local', 'motdepasse1');
  const exp = await c.req('GET', '/profil/export');
  assert.strictEqual(exp.status, 200);
  const data = await exp.json();
  assert.strictEqual(data.compte.email, 'rgpd@test.local');
  assert.ok(Array.isArray(data.tickets));
  const sup = await c.req('POST', '/profil/supprimer');
  assert.strictEqual(sup.status, 302);
  const u = db.prepare("SELECT statut, nom FROM users WHERE email LIKE 'supprime-%'").get();
  assert.ok(u && u.statut === 'refuse' && u.nom === 'Compte supprimé');
  const apres = await c.req('GET', '/tickets');
  assert.strictEqual(apres.status, 302);
});
