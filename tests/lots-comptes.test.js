const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let server, base, dbDir, db;
let ids = {};

function tmpEnv() {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-lots-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
}

async function client() {
  const cookies = {};
  return {
    async req(methode, url, body) {
      const headers = {};
      const ch = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      if (ch) headers.cookie = ch;
      let payload;
      if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
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
  db = getDb();
  const mdp = hashPassword('motdepasse1');
  const insU = db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)');
  ids.villa1 = insU.run('villa', 1, 'Villa 1').lastInsertRowid;
  ids.villa2 = insU.run('villa', 2, 'Villa 2').lastInsertRowid;
  ids.garage1 = insU.run('garage', 1, 'Garage 1').lastInsertRowid;
  ids.communes = insU.run('communes', null, 'Parties communes').lastInsertRowid;
  const insUser = db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?,?,?,?,?,?,?, ?,1)');
  ids.admin = insUser.run('admin@test.local', mdp, 'Admin', 'Admin', '0600', 'admin', 0, 'actif').lastInsertRowid;
  ids.cs = insUser.run('cs@test.local', mdp, 'Conseil', 'Claire', '0601', 'resident', 1, 'actif').lastInsertRowid;
  ids.r1 = insUser.run('r1@test.local', mdp, 'Resident 1', 'Jean', '0602', 'resident', 0, 'actif').lastInsertRowid;
  ids.r2 = insUser.run('r2@test.local', mdp, 'Resident 2', 'Marie', '0603', 'resident', 0, 'actif').lastInsertRowid;
  const insRes = db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)');
  insRes.run(ids.villa1, ids.r1, 'proprietaire');
  insRes.run(ids.garage1, ids.r1, 'proprietaire');
  insRes.run(ids.villa2, ids.r2, 'proprietaire');
  insRes.run(ids.communes, ids.cs, 'proprietaire');
  const { createApp } = require('../src/app');
  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fs.rmSync(dbDir, { recursive: true, force: true }); });

function creerLot(numero, userId, tantiemes = 100) {
  return db.prepare('INSERT INTO lots (numero, designation, type_lot, tantiemes, proprietaire_brut, user_id) VALUES (?,?,?,?,?,?)')
    .run(numero, 'Appt T4', 'Appartement', tantiemes, 'TEST', userId).lastInsertRowid;
}

test('auto-inscription : locataire forcé même si "proprietaire" est envoyé', async () => {
  const c = await client();
  const res = await c.req('POST', '/inscription', {
    nom: 'Test', prenom: 'Toto', telephone: '0699', email: 'toto@test.local',
    motdepasse: 'motdepasse1', unite_id: String(ids.villa1), qualite: 'proprietaire'
  });
  assert.strictEqual(res.status, 200);
  const r = db.prepare("SELECT r.qualite FROM rattachements r JOIN users u ON u.id = r.user_id WHERE u.email = 'toto@test.local'").get();
  assert.strictEqual(r.qualite, 'locataire');
  // la page d'inscription ne propose plus le choix de qualité
  const page = await (await c.req('GET', '/inscription')).text();
  assert.ok(!page.includes('name="qualite"'));
  assert.ok(page.includes('locataire'));
});

test('création de compte par le gestionnaire : sans email (inaccessible), avec email (mail de réinit + unicité actifs)', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // un non-gestionnaire ne peut pas créer de compte
  const resKo = await r1.req('POST', '/admin/comptes/creer', { nom: 'X', prenom: 'Y' });
  assert.strictEqual(resKo.status, 403);
  // nom/prénom obligatoires
  const resSansPrenom = await cs.req('POST', '/admin/comptes/creer', { nom: 'X', prenom: '' });
  assert.strictEqual(resSansPrenom.status, 302);
  assert.ok((resSansPrenom.headers.get('location') || '').includes('erreur='));
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM users WHERE nom = 'X'").get().n, 0);
  // création sans email : compte actif mais inaccessible (pas de login possible)
  const resSansMail = await cs.req('POST', '/admin/comptes/creer', { nom: 'Sansmail', prenom: 'Sam' });
  assert.strictEqual(resSansMail.status, 302);
  const sansMail = db.prepare("SELECT * FROM users WHERE nom = 'Sansmail'").get();
  assert.ok(sansMail);
  assert.strictEqual(sansMail.email, null);
  assert.strictEqual(sansMail.statut, 'actif');
  // création avec email : un jeton de réinitialisation est créé (mail envoyé si activé)
  const resMail = await cs.req('POST', '/admin/comptes/creer', { nom: 'Avecmail', prenom: 'Anna', email: 'anna@test.local' });
  assert.strictEqual(resMail.status, 302);
  const avecMail = db.prepare("SELECT * FROM users WHERE email = 'anna@test.local'").get();
  assert.ok(avecMail);
  const jeton = db.prepare('SELECT * FROM password_resets WHERE user_id = ?').get(avecMail.id);
  assert.ok(jeton, 'jeton de réinitialisation créé dès la création avec email');
  // unicité parmi les actifs : un autre compte actif avec le même email est refusé
  const resDoublon = await cs.req('POST', '/admin/comptes/creer', { nom: 'Doublon', prenom: 'Dan', email: 'ANNA@test.local' });
  assert.ok((resDoublon.headers.get('location') || '').includes('erreur='));
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'anna@test.local' AND statut = 'actif'").get().n, 1);
  // un compte désactivé ne bloque pas la réutilisation de son email
  db.prepare("UPDATE users SET statut = 'desactive' WHERE id = ?").run(avecMail.id);
  const resReuse = await cs.req('POST', '/admin/comptes/creer', { nom: 'Reuse', prenom: 'Chloe', email: 'anna@test.local' });
  assert.strictEqual(resReuse.status, 302);
  assert.ok(!(resReuse.headers.get('location') || '').includes('erreur='));
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'anna@test.local' AND statut = 'actif'").get().n, 1);
});

test('réinitialisation du mot de passe par lien : valide, à usage unique, vérifie l\'email, connexion ensuite', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  // compte créé par le CS avec email
  await cs.req('POST', '/admin/comptes/creer', { nom: 'Reset', prenom: 'Rita', email: 'rita@test.local' });
  const u = db.prepare("SELECT * FROM users WHERE email = 'rita@test.local'").get();
  assert.strictEqual(u.email_verifie, 0);
  // renvoi manuel du mail
  const resRenvoi = await cs.req('POST', `/admin/comptes/${u.id}/renvoyer-reset`);
  assert.strictEqual(resRenvoi.status, 302);
  const jeton = db.prepare('SELECT * FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(u.id);
  assert.ok(jeton);
  // la page du lien se rend
  const page = await cs.req('GET', '/reinitialiser-mot-de-passe?token=' + jeton.token);
  assert.strictEqual(page.status, 200);
  // mot de passe trop court : refusé
  const resCourt = await cs.req('POST', '/reinitialiser-mot-de-passe', { token: jeton.token, motdepasse: 'court' });
  assert.strictEqual(resCourt.status, 400);
  // nouveau mot de passe valide
  const resOk = await cs.req('POST', '/reinitialiser-mot-de-passe', { token: jeton.token, motdepasse: 'nouveaumdp1' });
  assert.strictEqual(resOk.status, 302);
  assert.strictEqual(db.prepare('SELECT email_verifie FROM users WHERE id = ?').get(u.id).email_verifie, 1);
  // le jeton est à usage unique
  const resReuse = await cs.req('POST', '/reinitialiser-mot-de-passe', { token: jeton.token, motdepasse: 'autremdp1' });
  assert.strictEqual(resReuse.status, 400);
  // connexion avec le nouveau mot de passe
  const c = await client();
  const loginRes = await login(c, 'rita@test.local', 'nouveaumdp1');
  assert.strictEqual(loginRes.status, 302);
  // jeton inconnu : 400
  const resInconnu = await c.req('POST', '/reinitialiser-mot-de-passe', { token: 'inconnu', motdepasse: 'motdepasse1' });
  assert.strictEqual(resInconnu.status, 400);
});

test('compte désactivé : 403 avec message distinct, conserve tickets et historique, exclu des notifications', async () => {
  const db2 = db;
  const { hashPassword } = require('../src/auth');
  const id = db2.prepare("INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut, email_verifie) VALUES ('desact@test.local', ?, 'Desact', 'David', '0', 'resident', 'desactive', 1)")
    .run(hashPassword('motdepasse1')).lastInsertRowid;
  const tid = db2.prepare('INSERT INTO tickets (titre, description, etape, auteur_id) VALUES (?,?,?,?)').run('Ticket de désactivé', '', 'cree', id).lastInsertRowid;
  db2.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, ?)').run(tid, ids.villa1);
  const c = await client();
  const res = await login(c, 'desact@test.local', 'motdepasse1');
  assert.strictEqual(res.status, 403);
  const html = await res.text();
  assert.ok(html.includes('désactivé'));
  // le ticket reste là, rattaché à l'unité, auteur conservé
  const t = db2.prepare('SELECT auteur_id FROM tickets WHERE id = ?').get(tid);
  assert.strictEqual(t.auteur_id, id);
  // aucune notification pour un compte désactivé
  const { notifierUser } = require('../src/notifications');
  notifierUser(id, null, 'test', 'msg');
  assert.strictEqual(db2.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(id).n, 0);
});

test('onglet Lots : droits (CS/admin voient, résident 403), nav présente', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  assert.strictEqual((await r1.req('GET', '/admin/lots')).status, 403);
  const pageCS = await cs.req('GET', '/admin/lots');
  assert.strictEqual(pageCS.status, 200);
  const htmlCS = await pageCS.text();
  assert.ok(htmlCS.includes('id="recherche-lots"'));
  assert.ok(htmlCS.includes('/admin/lots')); // nav
  assert.strictEqual((await admin.req('GET', '/admin/lots')).status, 200);
});

test('lot → unité : demande du propriétaire, validation CS, une unité dans au plus un lot, une seule fois par compte', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  const lotId = creerLot(900, ids.r1, 250);
  // r2 (pas propriétaire du lot) ne peut pas demander pour ce lot
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  await r2.req('POST', `/profil/lots/${lotId}/demander-unite`, { unite_id: String(ids.villa2) });
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM lot_units WHERE lot_id = ?').get(lotId).n, 0);
  // le propriétaire demande l'ajout de villa2 (libre) à son lot
  const resDem = await r1.req('POST', `/profil/lots/${lotId}/demander-unite`, { unite_id: String(ids.villa2) });
  assert.strictEqual(resDem.status, 302);
  const lu = db.prepare('SELECT * FROM lot_units WHERE lot_id = ?').get(lotId);
  assert.strictEqual(lu.statut, 'en_attente');
  assert.strictEqual(lu.demande_par, ids.r1);
  // unité déjà rattachée au demandeur (villa1) : refusée
  const resDeja = await r1.req('POST', `/profil/lots/${lotId}/demander-unite`, { unite_id: String(ids.villa1) });
  assert.ok((resDeja.headers.get('location') || '').includes('erreur='));
  // validation par le CS : accepté -> unit_residents du propriétaire
  const resVal = await cs.req('POST', `/admin/lots/${lotId}/unites/${lu.id}/valider`, { action: 'accepter' });
  assert.strictEqual(resVal.status, 302);
  assert.strictEqual(db.prepare('SELECT statut FROM lot_units WHERE id = ?').get(lu.id).statut, 'accepte');
  assert.strictEqual(db.prepare('SELECT qualite FROM unit_residents WHERE user_id = ? AND unit_id = ?').get(ids.r1, ids.villa2).qualite, 'proprietaire');
  // r1 peut maintenant créer un ticket sur villa2
  const resTicket = await r1.req('POST', '/tickets', { titre: 'Via lot', description: 'd', unite_ids: [String(ids.villa2)] });
  assert.strictEqual(resTicket.status, 302);
  // une unité dans au plus un lot : index partiel
  const lot2 = creerLot(901, ids.r2, 50);
  assert.throws(() => {
    db.prepare("INSERT INTO lot_units (lot_id, unit_id, statut) VALUES (?, ?, 'en_attente')").run(lot2, ids.villa2);
  });
  // une seule fois par compte : r1 ne peut pas réclamer villa2 en locataire (déjà via le lot)
  const resReclame = await r1.req('POST', '/profil/reclamer', { unite_id: String(ids.villa2) });
  assert.ok((resReclame.headers.get('location') || '').includes('erreur='));
  // modification des tantièmes : CS refusé, admin accepté + logué
  const resModCS = await cs.req('POST', `/admin/lots/${lotId}/modifier`, { designation: 'Appt T4', type_lot: 'Appartement', tantiemes: '300' });
  assert.strictEqual(resModCS.status, 403);
  const resModAdmin = await admin.req('POST', `/admin/lots/${lotId}/modifier`, { designation: 'Appt T4', type_lot: 'Appartement', tantiemes: '300' });
  assert.strictEqual(resModAdmin.status, 302);
  assert.strictEqual(db.prepare('SELECT tantiemes FROM lots WHERE id = ?').get(lotId).tantiemes, 300);
  const ev = db.prepare("SELECT * FROM lot_events WHERE lot_id = ? AND type = 'modification'").get(lotId);
  assert.ok(ev && ev.contenu.includes('250 → 300'));
  // retrait d'une unité du lot : admin seul
  const resRetraitCS = await cs.req('POST', `/admin/lots/${lotId}/unites/${lu.id}/retirer`);
  assert.strictEqual(resRetraitCS.status, 403);
  const resRetraitAdmin = await admin.req('POST', `/admin/lots/${lotId}/unites/${lu.id}/retirer`);
  assert.strictEqual(resRetraitAdmin.status, 302);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM lot_units WHERE id = ?').get(lu.id).n, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM unit_residents WHERE user_id = ? AND unit_id = ?').get(ids.r1, ids.villa2).n, 0);
});

test('rachat d\'un lot (CS) : nouveau compte, transfert du lot et des unités, désactivation si plus aucun rattachement', async () => {
  const { hashPassword } = require('../src/auth');
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // vendeur « solo » : un seul lot (avec villa2 acceptée), rien d'autre
  const solo = db.prepare("INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut, email_verifie) VALUES ('solo@test.local', ?, 'Solo', 'Sophie', '0', 'resident', 'actif', 1)")
    .run(hashPassword('motdepasse1')).lastInsertRowid;
  const lotId = creerLot(902, solo, 400);
  db.prepare("INSERT INTO lot_units (lot_id, unit_id, statut, demande_par, valide_par) VALUES (?, ?, 'accepte', ?, ?)").run(lotId, ids.villa2, solo, ids.cs);
  db.prepare("INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, 'proprietaire')").run(ids.villa2, solo);
  // un non-gestionnaire ne peut pas racheter
  const resKo = await r1.req('POST', `/admin/lots/${lotId}/rachat`, { nom: 'X', prenom: 'Y' });
  assert.strictEqual(resKo.status, 403);
  // rachat par le CS, avec email pour l'acheteur
  const res = await cs.req('POST', `/admin/lots/${lotId}/rachat`, { nom: 'Acheteur', prenom: 'Anna', email: 'acheteur@test.local' });
  assert.strictEqual(res.status, 302);
  const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(lotId);
  assert.notStrictEqual(lot.user_id, solo);
  const acheteur = db.prepare('SELECT * FROM users WHERE id = ?').get(lot.user_id);
  assert.strictEqual(acheteur.nom, 'Acheteur');
  assert.strictEqual(acheteur.email, 'acheteur@test.local');
  assert.ok(db.prepare('SELECT * FROM password_resets WHERE user_id = ?').get(acheteur.id), 'mail de réinit envoyé à l\'acheteur');
  // unités transférées au nouvel acheteur
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM unit_residents WHERE user_id = ? AND unit_id = ?').get(acheteur.id, ids.villa2).n, 1);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM unit_residents WHERE user_id = ? AND unit_id = ?').get(solo, ids.villa2).n, 0);
  // l'ancien propriétaire, sans plus aucun rattachement, est désactivé définitivement
  assert.strictEqual(db.prepare('SELECT statut FROM users WHERE id = ?').get(solo).statut, 'desactive');
  const cSolo = await client();
  const resLogin = await login(cSolo, 'solo@test.local', 'motdepasse1');
  assert.strictEqual(resLogin.status, 403);
  assert.ok((await resLogin.text()).includes('désactivé'));
  // l'événement de rachat est logué
  assert.ok(db.prepare("SELECT * FROM lot_events WHERE lot_id = ? AND type = 'rachat'").get(lotId));
  // l'email de l'ancien compte désactivé est réutilisable par un nouveau compte actif
  const resReuse = await cs.req('POST', '/admin/comptes/creer', { nom: 'Reuse', prenom: 'Leo', email: 'solo@test.local' });
  assert.ok(!(resReuse.headers.get('location') || '').includes('erreur='));
});

test('rachat : un vendeur qui reste locataire ailleurs garde son compte actif', async () => {
  const { hashPassword } = require('../src/auth');
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const vendeur = db.prepare("INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut, email_verifie) VALUES ('vendeur@test.local', ?, 'Vendeur', 'Vera', '0', 'resident', 'actif', 1)")
    .run(hashPassword('motdepasse1')).lastInsertRowid;
  const lotId = creerLot(903, vendeur, 100);
  // il est aussi locataire accepté du garage 1
  db.prepare("INSERT INTO rattachements (unit_id, user_id, qualite, statut, valide_par) VALUES (?, ?, 'locataire', 'accepte', ?)").run(ids.garage1, vendeur, ids.r1);
  db.prepare("INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, 'locataire')").run(ids.garage1, vendeur);
  const res = await cs.req('POST', `/admin/lots/${lotId}/rachat`, { nom: 'Nouveau', prenom: 'Nora' });
  assert.strictEqual(res.status, 302);
  // il reste actif (rattachement locataire conservé)
  assert.strictEqual(db.prepare('SELECT statut FROM users WHERE id = ?').get(vendeur).statut, 'actif');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM lots WHERE user_id = ?').get(vendeur).n, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM unit_residents WHERE user_id = ? AND unit_id = ?').get(vendeur, ids.garage1).n, 1);
  const c = await client();
  assert.strictEqual((await login(c, 'vendeur@test.local', 'motdepasse1')).status, 302);
});

test('profil : section Mes lots, nom et prénom obligatoires', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  creerLot(904, ids.r1, 111);
  const profil = await (await r1.req('GET', '/profil')).text();
  assert.ok(profil.includes('Mes lots'));
  assert.ok(profil.includes('Lot 904'));
  // prénom vide : refusé
  const res = await r1.req('POST', '/profil', { nom: 'Resident 1', prenom: '', telephone: '0602' });
  assert.ok((res.headers.get('location') || '').includes('erreur='));
  assert.strictEqual(db.prepare('SELECT prenom FROM users WHERE id = ?').get(ids.r1).prenom, 'Jean');
});
