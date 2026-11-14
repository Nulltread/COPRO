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
  process.env.MAIL_ENABLED = 'false';
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

let ids = {};

before(async () => {
  tmpEnv();
  const { getDb } = require('../src/db');
  const { hashPassword } = require('../src/auth');
  const db = getDb();
  const insU = db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)');
  insU.run('villa', 1, 'Villa 1');
  insU.run('villa', 2, 'Villa 2');
  insU.run('garage', 1, 'Garage 1');
  ids.communes = insU.run('communes', null, 'Parties communes').lastInsertRowid;
  const mdp = hashPassword('motdepasse1');
  const insUser = db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut) VALUES (?,?,?,?,?,?,?,?)');
  ids.admin = insUser.run('admin@test.local', mdp, 'Admin', 'Admin', '0600', 'admin', 0, 'actif').lastInsertRowid;
  ids.cs = insUser.run('cs@test.local', mdp, 'Conseil', 'Claire', '0601', 'resident', 1, 'actif').lastInsertRowid;
  ids.r1 = insUser.run('r1@test.local', mdp, 'Resident 1', 'Jean', '0602', 'resident', 0, 'actif').lastInsertRowid;
  ids.r2 = insUser.run('r2@test.local', mdp, 'Resident 2', 'Marie', '0603', 'resident', 0, 'actif').lastInsertRowid;
  ids.villa1 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id;
  ids.villa2 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=2").get().id;
  ids.garage1 = db.prepare("SELECT id FROM units WHERE type='garage' AND numero=1").get().id;
  const insRes = db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)');
  insRes.run(ids.villa1, ids.r1, 'proprietaire');
  insRes.run(ids.garage1, ids.r1, 'proprietaire'); // résident multi-unités
  insRes.run(ids.villa2, ids.r2, 'proprietaire');
  insRes.run(ids.communes, ids.cs, 'proprietaire'); // parties communes rattachées au CS
  db.prepare('INSERT INTO rattachements (unit_id, user_id, qualite, statut, valide_par) VALUES (?,?,?,?,?)')
    .run(ids.communes, ids.cs, 'proprietaire', 'accepte', ids.cs);
  // Comptes de test pré-existants : email considéré comme vérifié.
  db.prepare('UPDATE users SET email_verifie = 1').run();

  const { createApp } = require('../src/app');
  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fs.rmSync(dbDir, { recursive: true, force: true }); });

function db() { return require('../src/db').getDb(); }

async function creerTicket(c, uniteIds, titre = 'Ticket test') {
  const res = await c.req('POST', '/tickets', { titre, description: 'desc', unite_ids: uniteIds.map(String) });
  return { res, tid: res.status === 302 ? Number(res.headers.get('location').split('/').pop()) : null };
}

test('connexion avec mauvais mot de passe échoue', async () => {
  const c = await client();
  const res = await login(c, 'r1@test.local', 'mauvais');
  assert.strictEqual(res.status, 401);
});

test('auto-inscription : compte créé mais connexion bloquée tant que l\'email n\'est pas vérifié', async () => {
  const c = await client();
  const res = await c.req('POST', '/inscription', {
    nom: 'Nouveau', prenom: 'Nina', telephone: '0604', email: 'nouveau@test.local',
    motdepasse: 'motdepasse1', unite_id: String(ids.villa1), qualite: 'locataire'
  });
  assert.strictEqual(res.status, 200);
  const u = db().prepare("SELECT statut, role, email_verifie FROM users WHERE email='nouveau@test.local'").get();
  assert.strictEqual(u.statut, 'actif');
  assert.strictEqual(u.role, 'resident');
  assert.strictEqual(u.email_verifie, 0);
  // Connexion bloquée (403) tant que l'email n'est pas validé.
  const loginRes = await login(c, 'nouveau@test.local', 'motdepasse1');
  assert.strictEqual(loginRes.status, 403);
  // Validation via le lien : la connexion fonctionne ensuite.
  const jeton = db().prepare("SELECT ev.token FROM email_verifications ev JOIN users u ON u.id = ev.user_id WHERE u.email='nouveau@test.local'").get();
  const verif = await c.req('GET', '/verifier-email?token=' + jeton.token);
  assert.strictEqual(verif.status, 302);
  const loginOk = await login(c, 'nouveau@test.local', 'motdepasse1');
  assert.strictEqual(loginOk.status, 302);
});

test('pas d\'unité validée = pas de création de ticket', async () => {
  const c = await client();
  await login(c, 'nouveau@test.local', 'motdepasse1');
  const { res } = await creerTicket(c, [ids.villa1]);
  assert.strictEqual(res.status, 403);
});

test('visibilité : sans unité validée, aucun ticket visible (liste, détail, filtres)', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket caché sans unité');
  const c = await client();
  await login(c, 'nouveau@test.local', 'motdepasse1');
  const listeDefaut = await (await c.req('GET', '/tickets')).text();
  assert.ok(!listeDefaut.includes('Ticket caché sans unité'));
  const listeToutes = await (await c.req('GET', '/tickets?unite=toutes')).text();
  assert.ok(!listeToutes.includes('Ticket caché sans unité'));
  const detail = await c.req('GET', '/tickets/' + tid);
  assert.strictEqual(detail.status, 404);
  // L'admin, lui, voit tout sans unité rattachée.
  const a = await client(); await login(a, 'admin@test.local', 'motdepasse1');
  const detailAdmin = await a.req('GET', '/tickets/' + tid);
  assert.strictEqual(detailAdmin.status, 200);
});

test('rattachement : refusé par un résident d\'une autre unité, accepté par un résident de la même unité', async () => {
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const attente = db().prepare("SELECT r.id FROM rattachements r JOIN users u ON u.id=r.user_id WHERE u.email='nouveau@test.local'").get();
  const resInterdit = await r2.req('POST', `/rattachements/${attente.id}/valider`, { action: 'accepter' });
  assert.strictEqual(resInterdit.status, 403);
  const resOk = await r1.req('POST', `/rattachements/${attente.id}/valider`, { action: 'accepter' });
  assert.strictEqual(resOk.status, 302);
  const nb = db().prepare('SELECT COUNT(*) AS n FROM unit_residents ur JOIN users u ON u.id=ur.user_id WHERE u.email=? AND ur.unit_id=?').get('nouveau@test.local', ids.villa1).n;
  assert.strictEqual(nb, 1);
  // Notification in-app au demandeur.
  const notif = db().prepare("SELECT COUNT(*) AS n FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.email='nouveau@test.local' AND n.type='rattachement'").get().n;
  assert.ok(notif >= 1);
  // Le résident peut maintenant créer un ticket.
  const c = await client(); await login(c, 'nouveau@test.local', 'motdepasse1');
  const { res } = await creerTicket(c, [ids.villa1], 'Ticket du nouveau');
  assert.strictEqual(res.status, 302);
});

test('création : au moins une unité perso, les autres libres ; parties communes réservées au CS', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  // r1 peut créer sur villa1 + villa2 (au moins une sienne)
  const ok = await creerTicket(r1, [ids.villa1, ids.villa2], 'Multi-unités autorisé');
  assert.strictEqual(ok.res.status, 302);
  // r1 ne peut pas créer uniquement sur la villa d'un autre
  const ko = await creerTicket(r1, [ids.villa2], 'Villa autre seule');
  assert.strictEqual(ko.res.status, 403);
  // r1 ne peut pas créer sur les parties communes
  const koC = await creerTicket(r1, [ids.communes], 'Communes interdit');
  assert.strictEqual(koC.res.status, 403);
  // le CS peut créer sur les parties communes
  const okC = await creerTicket(cs, [ids.communes], 'Ticket parties communes');
  assert.strictEqual(okC.res.status, 302);
});

test('unités modifiables après création', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Unités modifiables');
  const res = await r1.req('POST', `/tickets/${tid}/unites`, { unite_ids: [String(ids.villa1), String(ids.garage1)] });
  assert.strictEqual(res.status, 302);
  const n = db().prepare('SELECT COUNT(*) AS n FROM ticket_units WHERE ticket_id = ?').get(tid).n;
  assert.strictEqual(n, 2);
});

test('visibilité : lecture ouverte à tous, filtre par défaut sur ses unités', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r2, [ids.villa2], 'Ticket villa 2 visible par tous');
  // lecture ouverte : r1 voit le détail du ticket de villa 2
  const resDetail = await r1.req('GET', '/tickets/' + tid);
  assert.strictEqual(resDetail.status, 200);
  // filtre par défaut : r1 ne voit pas le ticket villa 2 dans sa liste (ses unités = villa1/garage1)
  const listeDefaut = await (await r1.req('GET', '/tickets')).text();
  assert.ok(!listeDefaut.includes('Ticket villa 2 visible par tous'));
  // avec unite=toutes, il le voit
  const listeToutes = await (await r1.req('GET', '/tickets?unite=toutes')).text();
  assert.ok(listeToutes.includes('Ticket villa 2 visible par tous'));
});

test('cycle de vie : CS libre sur tous les états, résident limité à la réouverture', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Cycle test');
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'cree');

  // un résident ne peut pas changer d'état (sauf réouverture)
  const resInterdit = await r1.req('POST', `/tickets/${tid}/transition`, { etape: 'consultation' });
  assert.strictEqual(resInterdit.status, 403);

  // le CS peut sauter directement à n'importe quel état
  const resSaut = await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'travaux_acceptes' });
  assert.strictEqual(resSaut.status, 302);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'travaux_acceptes');

  // archivage par le CS, puis réouverture par le résident vers l'état d'avant consultation
  await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'archive' });
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'archive');
  const resReouv = await r1.req('POST', `/tickets/${tid}/transition`, { etape: 'valide_cs' });
  assert.strictEqual(resReouv.status, 302);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'valide_cs');
});

test('résolution : tous les résidents concernés (ou le CS seul) → archivé', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  // villa 2 : seul résident = r2 → son acceptation archive le ticket
  const { tid } = await creerTicket(r2, [ids.villa2], 'Résolution r2 seul');
  await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'travaux_acceptes' });
  const res = await r2.req('POST', `/tickets/${tid}/resolution`);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'archive');

  // villa 1 : r1 + nouveau concernés ; le CS accepte seul → archivé quand même
  const { tid: tid2 } = await creerTicket(r2, [ids.villa1, ids.villa2], 'Résolution CS seul');
  await cs.req('POST', `/tickets/${tid2}/transition`, { etape: 'travaux_acceptes' });
  const resCS = await cs.req('POST', `/tickets/${tid2}/resolution`);
  assert.strictEqual(resCS.status, 302);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid2).etape, 'archive');
});

test('édition de la description même archivé, loguée avec auteur visible', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket à éditer');
  await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'archive' });
  const res = await r1.req('POST', `/tickets/${tid}/editer`, { description: 'Description mise à jour après archivage' });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(db().prepare('SELECT description FROM tickets WHERE id=?').get(tid).description, 'Description mise à jour après archivage');
  const ev = db().prepare("SELECT * FROM ticket_events WHERE ticket_id=? AND type='edition' ORDER BY id DESC LIMIT 1").get(tid);
  assert.ok(ev);
  assert.strictEqual(ev.auteur_id, ids.r1);
});

test('suppression : créateur si jamais évolué ; CS sur ticket non évolué d\'un compte parti', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // ticket jamais évolué : le créateur peut supprimer
  const { tid } = await creerTicket(r1, [ids.villa1], 'À supprimer');
  const resSup = await r1.req('POST', `/tickets/${tid}/supprimer`);
  assert.strictEqual(resSup.status, 302);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM tickets WHERE id=?').get(tid).n, 0);
  // ticket évolué : même le créateur ne peut pas supprimer
  const { tid: tid2 } = await creerTicket(r1, [ids.villa1], 'Évolué');
  await cs.req('POST', `/tickets/${tid2}/transition`, { etape: 'valide_cs' });
  const resKo = await r1.req('POST', `/tickets/${tid2}/supprimer`);
  assert.strictEqual(resKo.status, 403);
  // ticket non évolué créé par un compte supprimé : le CS peut supprimer
  const parti = await client();
  await parti.req('POST', '/inscription', { nom: 'Parti', prenom: 'Paul', telephone: '0605', email: 'parti@test.local', motdepasse: 'motdepasse1', unite_id: String(ids.villa2), qualite: 'locataire' });
  const jetonParti = db().prepare("SELECT ev.token FROM email_verifications ev JOIN users u ON u.id=ev.user_id WHERE u.email='parti@test.local'").get();
  await parti.req('GET', '/verifier-email?token=' + jetonParti.token);
  const ratId = db().prepare("SELECT r.id FROM rattachements r JOIN users u ON u.id=r.user_id WHERE u.email='parti@test.local'").get().id;
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  await r2.req('POST', `/rattachements/${ratId}/valider`, { action: 'accepter' });
  await login(parti, 'parti@test.local', 'motdepasse1');
  const { tid: tid3 } = await creerTicket(parti, [ids.villa2], 'Ticket compte parti');
  await parti.req('POST', '/profil/supprimer');
  assert.strictEqual(db().prepare("SELECT statut FROM users WHERE email LIKE 'supprime-%'").get().statut, 'supprime');
  const resCS = await cs.req('POST', `/tickets/${tid3}/supprimer`);
  assert.strictEqual(resCS.status, 302);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM tickets WHERE id=?').get(tid3).n, 0);
});

test('fichiers : devis/factures réservés au CS, lecture ouverte à tous', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket documents');

  const formDevis = new FormData();
  formDevis.append('categorie', 'devis');
  formDevis.append('montant', '500');
  formDevis.append('fichiers', new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), 'devis.pdf');
  const resInterdit = await r1.req('POST', `/tickets/${tid}/fichiers`, undefined, formDevis);
  assert.strictEqual(resInterdit.status, 403);

  const resOK = await cs.req('POST', `/tickets/${tid}/fichiers`, undefined, formDevis);
  assert.strictEqual(resOK.status, 302);
  const f = db().prepare('SELECT * FROM fichiers WHERE ticket_id = ?').get(tid);
  assert.strictEqual(f.categorie, 'devis');
  assert.strictEqual(f.montant, 500);

  // lecture ouverte : un résident d'une autre unité peut télécharger le devis
  const okR2 = await r2.req('GET', '/fichiers/' + f.id);
  assert.strictEqual(okR2.status, 200);

  // photo : tout le monde peut en ajouter
  const formPhoto = new FormData();
  formPhoto.append('categorie', 'photo');
  formPhoto.append('fichiers', new Blob(['x'], { type: 'image/png' }), 'photo.png');
  const resPhoto = await r1.req('POST', `/tickets/${tid}/fichiers`, undefined, formPhoto);
  assert.strictEqual(resPhoto.status, 302);
});

test('compte-rendu d\'intervention : une instance par unité + une pour le CS', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1, ids.garage1], 'Ticket CR');
  let res = await r1.req('POST', `/tickets/${tid}/cr`, { unit_id: String(ids.villa1), contenu: 'CR villa 1' });
  assert.strictEqual(res.status, 302);
  res = await r1.req('POST', `/tickets/${tid}/cr`, { unit_id: 'cs', contenu: 'CR conseil syndical' });
  assert.strictEqual(res.status, 302);
  const crs = db().prepare('SELECT unit_id, contenu FROM comptes_rendus WHERE ticket_id=? ORDER BY id').all(tid);
  assert.strictEqual(crs.length, 2);
  assert.deepStrictEqual(crs.map(c => c.unit_id).sort((a, b) => String(a).localeCompare(String(b))), [ids.villa1, null].sort((a, b) => String(a).localeCompare(String(b))));
  assert.ok(crs.some(c => c.unit_id === null && c.contenu === 'CR conseil syndical'));
});

test('notifications in-app pour le CS à la création d\'un ticket urgent', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const res = await r1.req('POST', '/tickets', { titre: 'Urgence notif', description: '', unite_ids: [String(ids.villa1)], urgent: '1' });
  const tid = Number(res.headers.get('location').split('/').pop());
  const n = db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND ticket_id = ?').get(ids.cs, tid).n;
  assert.ok(n >= 1);
});

test('gestion collégiale du statut CS', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // un résident non-CS ne peut pas gérer le statut CS
  const resKo = await r1.req('POST', `/admin/comptes/${ids.r2}/conseil`, { action: 'ajouter' });
  assert.strictEqual(resKo.status, 403);
  // un membre CS ne peut pas nommer un non-membre
  const resKo2 = await cs.req('POST', `/admin/comptes/${ids.r2}/conseil`, { action: 'ajouter' });
  assert.strictEqual(resKo2.status, 403);
  // un membre CS peut se retirer lui-même
  const resSelf = await cs.req('POST', `/admin/comptes/${ids.cs}/conseil`, { action: 'retirer' });
  assert.strictEqual(resSelf.status, 302);
  assert.strictEqual(db().prepare('SELECT conseil_syndical FROM users WHERE id=?').get(ids.cs).conseil_syndical, 0);
  // l'admin peut remettre / nommer
  const resAdmin = await admin.req('POST', `/admin/comptes/${ids.cs}/conseil`, { action: 'ajouter' });
  assert.strictEqual(resAdmin.status, 302);
  assert.strictEqual(db().prepare('SELECT conseil_syndical FROM users WHERE id=?').get(ids.cs).conseil_syndical, 1);
});

test('RGPD : export JSON et suppression de compte sans impact sur les tickets', async () => {
  const c = await client();
  await c.req('POST', '/inscription', { nom: 'RGPD', prenom: 'Test', telephone: '0606', email: 'rgpd@test.local', motdepasse: 'motdepasse1', unite_id: String(ids.villa2), qualite: 'proprietaire' });
  const jetonRgpd = db().prepare("SELECT ev.token FROM email_verifications ev JOIN users u ON u.id=ev.user_id WHERE u.email='rgpd@test.local'").get();
  await c.req('GET', '/verifier-email?token=' + jetonRgpd.token);
  const ratId = db().prepare("SELECT r.id FROM rattachements r JOIN users u ON u.id=r.user_id WHERE u.email='rgpd@test.local'").get().id;
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  await r2.req('POST', `/rattachements/${ratId}/valider`, { action: 'accepter' });
  await login(c, 'rgpd@test.local', 'motdepasse1');
  const { tid } = await creerTicket(c, [ids.villa2], 'Ticket RGPD');
  const exp = await c.req('GET', '/profil/export');
  assert.strictEqual(exp.status, 200);
  const data = await exp.json();
  assert.strictEqual(data.compte.email, 'rgpd@test.local');
  const sup = await c.req('POST', '/profil/supprimer');
  assert.strictEqual(sup.status, 302);
  // le ticket existe toujours, rattaché à l'unité
  const t = db().prepare('SELECT * FROM tickets WHERE id=?').get(tid);
  assert.ok(t);
  const n = db().prepare('SELECT COUNT(*) AS n FROM ticket_units WHERE ticket_id=? AND unit_id=?').get(tid, ids.villa2).n;
  assert.strictEqual(n, 1);
  // plus d'accès après suppression
  const apres = await c.req('GET', '/tickets');
  assert.ok([302, 403].includes(apres.status));
});

test('page d\'inscription se rend sans erreur (régression)', async () => {
  const c = await client();
  const res = await c.req('GET', '/inscription');
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Villa 1'));
  assert.ok(!html.includes('Parties communes'));
});

test('filtre par coût minimum sur la liste des tickets', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket filtre coût');
  const form = new FormData();
  form.append('categorie', 'devis');
  form.append('montant', '500');
  form.append('fichiers', new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), 'devis.pdf');
  await cs.req('POST', `/tickets/${tid}/fichiers`, undefined, form);
  const f = db().prepare('SELECT id FROM fichiers WHERE ticket_id = ?').get(tid);
  await cs.req('POST', `/tickets/${tid}/decision`, { fichier_id: String(f.id), justification: 'retenu' });
  const liste = await (await cs.req('GET', '/tickets?unite=toutes&cout_min=1000')).text();
  assert.ok(!liste.includes('Ticket filtre coût'));
  const liste2 = await (await cs.req('GET', '/tickets?unite=toutes&cout_min=100')).text();
  assert.ok(liste2.includes('Ticket filtre coût'));
});

test('liste : archivés masqués par défaut (filtre etape=archive pour les voir), tri urgence d\'abord puis date croissante', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const { tid: t1 } = await creerTicket(r1, [ids.villa1], 'Liste test ancien archivé');
  const { tid: t2 } = await creerTicket(r1, [ids.villa1], 'Liste test urgent récent');
  const { tid: t3 } = await creerTicket(r1, [ids.villa1], 'Liste test non urgent récent');
  db().prepare('UPDATE tickets SET urgent = 1 WHERE id = ?').run(t2);
  db().prepare("UPDATE tickets SET created_at = '2020-01-01 10:00:00' WHERE id = ?").run(t1);
  db().prepare("UPDATE tickets SET created_at = '2020-01-02 10:00:00' WHERE id = ?").run(t2);
  db().prepare("UPDATE tickets SET created_at = '2020-01-03 10:00:00' WHERE id = ?").run(t3);
  await cs.req('POST', `/tickets/${t1}/transition`, { etape: 'archive' });

  const liste = await (await r1.req('GET', '/tickets')).text();
  assert.ok(!liste.includes('Liste test ancien archivé'));
  assert.ok(liste.indexOf('Liste test urgent récent') < liste.indexOf('Liste test non urgent récent'));

  const archives = await (await r1.req('GET', '/tickets?etape=archive')).text();
  assert.ok(archives.includes('Liste test ancien archivé'));
});

test('PWA : manifest, service worker, icônes servis ; page profil propose le raccourci écran d\'accueil', async () => {
  const c = await client(); await login(c, 'r1@test.local', 'motdepasse1');

  const manifest = await c.req('GET', '/manifest.webmanifest');
  assert.strictEqual(manifest.status, 200);
  const m = await manifest.json();
  assert.strictEqual(m.display, 'standalone');
  assert.ok(m.icons.some(i => i.sizes === '512x512'));

  const sw = await c.req('GET', '/sw.js');
  assert.strictEqual(sw.status, 200);

  const icone = await c.req('GET', '/icon-192.png');
  assert.strictEqual(icone.status, 200);
  assert.ok((icone.headers.get('content-type') || '').includes('image/png'));

  const profil = await (await c.req('GET', '/profil')).text();
  assert.ok(profil.includes('id="install-etat"'));
  assert.ok(profil.includes('/manifest.webmanifest'));
  assert.ok(profil.includes('apple-touch-icon'));
});
