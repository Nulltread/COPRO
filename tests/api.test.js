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

// Consultation complète (entreprise strictement complète + devis + date), créée directement en base.
function ajouterConsultationComplete(tid, auteurId) {
  const eid = db().prepare('INSERT INTO entreprises (raison_sociale, siren_siret, contact_nom, telephone, mail) VALUES (?,?,?,?,?)')
    .run('Entreprise Test SARL', '123456789 00012', 'M. Contact', '0600000000', 'contact@entreprise-test.fr').lastInsertRowid;
  const cid = db().prepare('INSERT INTO consultations (ticket_id, entreprise_id, date_planifiee, auteur_id) VALUES (?, ?, ?, ?)')
    .run(tid, eid, '2026-12-01', auteurId).lastInsertRowid;
  db().prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, consultation_id, auteur_id) VALUES (?, 'devis', 'devis.pdf', 'devis-test.pdf', 'application/pdf', 10, 500, ?, ?)")
    .run(tid, cid, auteurId);
  return cid;
}

function ajouterFacture(tid, auteurId, montant = 100) {
  db().prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, auteur_id) VALUES (?, 'facture', 'facture.pdf', 'facture-test.pdf', 'application/pdf', 10, ?, ?)")
    .run(tid, montant, auteurId);
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

test('unités modifiables après création, puis réservées au CS/admin une fois en consultation', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Unités modifiables');
  // tant que « créé » : le créateur peut modifier
  const res = await r1.req('POST', `/tickets/${tid}/unites`, { unite_ids: [String(ids.villa1), String(ids.garage1)] });
  assert.strictEqual(res.status, 302);
  const n = db().prepare('SELECT COUNT(*) AS n FROM ticket_units WHERE ticket_id = ?').get(tid).n;
  assert.strictEqual(n, 2);
  // passé en consultation : le créateur (occupant) ne peut PLUS modifier
  await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  const resKo = await r1.req('POST', `/tickets/${tid}/unites`, { unite_ids: [String(ids.villa1)] });
  assert.strictEqual(resKo.status, 403);
  // mais le CS oui
  const resOk = await cs.req('POST', `/tickets/${tid}/unites`, { unite_ids: [String(ids.villa1), String(ids.villa2)] });
  assert.strictEqual(resOk.status, 302);
  const n2 = db().prepare('SELECT COUNT(*) AS n FROM ticket_units WHERE ticket_id = ?').get(tid).n;
  assert.strictEqual(n2, 2);
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

test('cycle v2 : créé → consultation (CS/admin seul), archivage avec facture, archivé = figé', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Cycle v2 test');
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'cree');

  // un résident ne peut pas passer en consultation
  const resInterdit = await r1.req('POST', `/tickets/${tid}/passer-consultation`);
  assert.strictEqual(resInterdit.status, 403);
  // l'ancienne route de transition libre n'existe plus
  const resVieux = await cs.req('POST', `/tickets/${tid}/transition`, { etape: 'archive' });
  assert.strictEqual(resVieux.status, 404);

  // le CS passe en consultation
  const resOk = await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  assert.strictEqual(resOk.status, 302);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'consultation');

  // archivage possible SANS facture (spec 24), même depuis « consultation »
  const resArchive = await cs.req('POST', `/tickets/${tid}/archiver`);
  assert.strictEqual(resArchive.status, 302);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'archive');
  // un résident ne peut pas archiver
  const { tid: tidR } = await creerTicket(r1, [ids.villa1], 'Archivage résident interdit');
  const resResident = await r1.req('POST', `/tickets/${tidR}/archiver`);
  assert.strictEqual(resResident.status, 403);
  // archivé = plus jamais éditable
  const resEdit = await r1.req('POST', `/tickets/${tid}/editer`, { description: 'x' });
  assert.strictEqual(resEdit.status, 403);
});

test('travaux planifiés → acceptés : UN SEUL acceptant suffit (occupant ou membre du CS), SANS facture (spec 28)', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  // villa 2 : seul résident = r2
  const { tid } = await creerTicket(r2, [ids.villa2], 'Acceptation un seul');
  await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  const cid = ajouterConsultationComplete(tid, ids.cs);
  await cs.req('POST', `/tickets/${tid}/consultations/${cid}/valider`);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'intervention_planifiee');
  // un résident non concerné ne peut ni accepter ni refuser → 403
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/accepter`, { commentaire: 'ok' })).status, 403);
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/refuser`, { commentaire: 'non' })).status, 403);
  // l'admin (jamais dans le quorum) → 403
  assert.strictEqual((await admin.req('POST', `/tickets/${tid}/accepter`, {})).status, 403);
  assert.strictEqual((await admin.req('POST', `/tickets/${tid}/refuser`, {})).status, 403);
  // r2 accepte : passage immédiat en « travaux acceptés », SANS aucune facture
  const resOk = await r2.req('POST', `/tickets/${tid}/accepter`, { commentaire: 'Vu, OK pour moi' });
  assert.strictEqual(resOk.status, 302);
  const t = db().prepare('SELECT etape, acceptes_at FROM tickets WHERE id=?').get(tid);
  assert.strictEqual(t.etape, 'travaux_acceptes');
  assert.ok(t.acceptes_at);
  assert.strictEqual(db().prepare("SELECT COUNT(*) AS n FROM fichiers WHERE ticket_id=? AND categorie='facture'").get(tid).n, 0);
  // une fois acceptés, plus d'acceptation/refus possible
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/accepter`, {})).status, 403);
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/refuser`, {})).status, 403);

  // ticket multi-unités (villa 1 + villa 2) : un seul acceptant au total suffit
  const { tid: tid2 } = await creerTicket(r2, [ids.villa1, ids.villa2], 'Un seul acceptant au total');
  await cs.req('POST', `/tickets/${tid2}/passer-consultation`);
  const cid2 = ajouterConsultationComplete(tid2, ids.cs);
  await cs.req('POST', `/tickets/${tid2}/consultations/${cid2}/valider`);
  await r1.req('POST', `/tickets/${tid2}/accepter`, { commentaire: 'ok pour moi' });
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid2).etape, 'travaux_acceptes');

  // le CS peut aussi accepter seul
  const { tid: tid3 } = await creerTicket(r2, [ids.villa2], 'Acceptation par le CS');
  await cs.req('POST', `/tickets/${tid3}/passer-consultation`);
  const cid3 = ajouterConsultationComplete(tid3, ids.cs);
  await cs.req('POST', `/tickets/${tid3}/consultations/${cid3}/valider`);
  await cs.req('POST', `/tickets/${tid3}/accepter`, { commentaire: 'réception ok' });
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid3).etape, 'travaux_acceptes');
});

test('édition : possible tant que non archivé (loguée avec auteur), interdite une fois archivé', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket à éditer');
  const res = await r1.req('POST', `/tickets/${tid}/editer`, { description: 'Description modifiée' });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(db().prepare('SELECT description FROM tickets WHERE id=?').get(tid).description, 'Description modifiée');
  const ev = db().prepare("SELECT * FROM ticket_events WHERE ticket_id=? AND type='edition' ORDER BY id DESC LIMIT 1").get(tid);
  assert.ok(ev);
  assert.strictEqual(ev.auteur_id, ids.r1);
  // archivage (avec facture) puis édition interdite
  ajouterFacture(tid, ids.cs, 50);
  await cs.req('POST', `/tickets/${tid}/archiver`);
  const res2 = await r1.req('POST', `/tickets/${tid}/editer`, { description: 'après archivage' });
  assert.strictEqual(res2.status, 403);
});

test('suppression : créateur si jamais évolué ; CS sur ticket non évolué d\'un compte parti', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // ticket jamais évolué : le créateur peut supprimer
  const { tid } = await creerTicket(r1, [ids.villa1], 'À supprimer');
  const resSup = await r1.req('POST', `/tickets/${tid}/supprimer`);
  assert.strictEqual(resSup.status, 302);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM tickets WHERE id=?').get(tid).n, 0);
  // ticket passé en consultation : même le créateur ne peut plus supprimer
  const { tid: tid2 } = await creerTicket(r1, [ids.villa1], 'Évolué');
  await cs.req('POST', `/tickets/${tid2}/passer-consultation`);
  const resKo = await r1.req('POST', `/tickets/${tid2}/supprimer`);
  assert.strictEqual(resKo.status, 403);
  // mais le CS/admin peut supprimer un ticket encore « créé » (même d'un compte supprimé)
  const { tid: tidKo } = await creerTicket(r1, [ids.villa1], 'Créé CS supprime');
  const resCsSup = await cs.req('POST', `/tickets/${tidKo}/supprimer`);
  assert.strictEqual(resCsSup.status, 302);
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

test('section documents supprimée ; factures (PDF + coût) réservées au CS, lecture ouverte', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket factures');

  // l'ancienne route d'upload libre de documents n'existe plus
  const formVieux = new FormData();
  formVieux.append('categorie', 'photo');
  formVieux.append('fichiers', new Blob(['x'], { type: 'image/png' }), 'photo.png');
  const resVieux = await r1.req('POST', `/tickets/${tid}/fichiers`, undefined, formVieux);
  assert.strictEqual(resVieux.status, 404);

  // un résident ne peut pas ajouter de facture
  const formFacture = new FormData();
  formFacture.append('fichier', new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), 'facture.pdf');
  formFacture.append('montant', '500');
  const resInterdit = await r1.req('POST', `/tickets/${tid}/factures`, undefined, formFacture);
  assert.strictEqual(resInterdit.status, 403);

  // le CS peut (PDF + coût)
  const resOK = await cs.req('POST', `/tickets/${tid}/factures`, undefined, formFacture);
  assert.strictEqual(resOK.status, 302);
  const f = db().prepare("SELECT * FROM fichiers WHERE ticket_id = ? AND categorie = 'facture'").get(tid);
  assert.ok(f);
  assert.strictEqual(f.montant, 500);

  // lecture ouverte : un résident d'une autre unité peut télécharger la facture
  const okR2 = await r2.req('GET', '/fichiers/' + f.id);
  assert.strictEqual(okR2.status, 200);

  // montant obligatoire
  const formSansMontant = new FormData();
  formSansMontant.append('fichier', new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), 'f2.pdf');
  const resSansMontant = await cs.req('POST', `/tickets/${tid}/factures`, undefined, formSansMontant);
  assert.strictEqual(resSansMontant.status, 400);
});

test('bilans : une instance par personne concernée et par cycle ; visibilité = personnes concernées uniquement (spec 28)', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket CR');
  // pas rédigeable en « créé » ni en « consultation »
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/cr`, { contenu: 'trop tôt' })).status, 403);
  await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/cr`, { contenu: 'trop tôt' })).status, 403);
  const cid = ajouterConsultationComplete(tid, ids.cs);
  await cs.req('POST', `/tickets/${tid}/consultations/${cid}/valider`);
  // r1 rédige SON bilan, puis le modifie : toujours UNE seule ligne pour le cycle 1
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/cr`, { contenu: 'Bilan de r1' })).status, 302);
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/cr`, { contenu: 'Bilan de r1 modifié' })).status, 302);
  let crs = db().prepare('SELECT * FROM comptes_rendus WHERE ticket_id=?').all(tid);
  assert.strictEqual(crs.length, 1);
  assert.strictEqual(crs[0].user_id, ids.r1);
  assert.strictEqual(crs[0].cycle, 1);
  assert.strictEqual(crs[0].contenu, 'Bilan de r1 modifié');
  // le CS rédige le sien -> 2 lignes (une par personne concernée, cycle 1)
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/cr`, { contenu: 'Bilan du CS' })).status, 302);
  crs = db().prepare('SELECT * FROM comptes_rendus WHERE ticket_id=? ORDER BY user_id').all(tid);
  assert.strictEqual(crs.length, 2);
  // r2 (non concerné) ne peut pas rédiger
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/cr`, { contenu: 'x' })).status, 403);
  // l'admin n'a pas de bilan et ne peut pas en rédiger
  assert.strictEqual((await admin.req('POST', `/tickets/${tid}/cr`, { contenu: 'bilan admin' })).status, 403);
  // page en « planifié » : section bilans + boutons Accepter/Refuser + autosave, phrase « Un bilan par personne concernée » masquée
  const page = await (await r1.req('GET', '/tickets/' + tid)).text();
  assert.ok(page.includes('Bilans de l\u2019intervention'));
  assert.ok(page.includes('/accepter') && page.includes('/refuser'));
  assert.ok(page.includes('>Accepter</button>') && page.includes('>Refuser</button>'));
  assert.ok(page.includes('data-autosave'));
  assert.ok(!page.includes('Un bilan par personne concern\u00e9e'));
  assert.ok(!page.includes('>Enregistrer</button>'));
  assert.ok(page.includes('Bilan de r1 modifié'));
  // visibilité : r2 (non concerné) et l'admin ne voient PAS la section bilans
  const pageR2 = await (await r2.req('GET', '/tickets/' + tid)).text();
  assert.ok(!pageR2.includes('Bilans de l\u2019intervention'));
  const pageAdmin = await (await admin.req('GET', '/tickets/' + tid)).text();
  assert.ok(!pageAdmin.includes('Bilans de l\u2019intervention'));
  // en « travaux acceptés » : section en lecture seule (plus de formulaire, plus de boutons)
  await r1.req('POST', `/tickets/${tid}/accepter`, { commentaire: 'ok' });
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'travaux_acceptes');
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/cr`, { contenu: 'modif après acceptation' })).status, 403);
  const pageA = await (await r1.req('GET', '/tickets/' + tid)).text();
  assert.ok(pageA.includes('Bilans de l\u2019intervention')); // toujours visible aux concernés
  assert.ok(!pageA.includes('/accepter') && !pageA.includes('/refuser')); // boutons masqués
  assert.ok(!pageA.includes('Votre bilan')); // plus de zone d'édition
  assert.ok(pageA.includes('Bilan de r1 modifié')); // lecture seule
});

test('notifications : uniquement sur les transitions ; destinataires = résidents concernés + CS + admin (hors auteur)', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  // création d'un ticket urgent : PAS de notification (seules les transitions notifient)
  const res = await r1.req('POST', '/tickets', { titre: 'Urgence notif', description: '', unite_ids: [String(ids.villa1)], urgent: '1' });
  const tid = Number(res.headers.get('location').split('/').pop());
  let n = db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE ticket_id = ?').get(tid).n;
  assert.strictEqual(n, 0);
  // commentaire : pas de notification non plus (fil de suivi seul)
  await r1.req('POST', `/tickets/${tid}/commentaire`, { contenu: 'hello' });
  n = db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE ticket_id = ?').get(tid).n;
  assert.strictEqual(n, 0);
  // transition par le CS : notifie r1 (résident concerné, auteur du ticket mais notifié en tant que concerné),
  // l'admin, mais PAS l'auteur de la transition (cs) ni r2 (non concerné)
  await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  const notif = (uid) => db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND ticket_id = ?').get(uid, tid).n;
  assert.strictEqual(notif(ids.cs), 0);      // auteur de la transition exclu
  assert.ok(notif(ids.r1) >= 1);              // résident concerné
  assert.ok(notif(ids.admin) >= 1);           // admin
  assert.strictEqual(notif(ids.r2), 0);       // non concerné
});

test('gestion collégiale du statut CS', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // un résident non-CS ne peut pas gérer le statut CS
  const resKo = await r1.req('POST', `/admin/comptes/${ids.r2}/conseil`, { action: 'ajouter' });
  assert.strictEqual(resKo.status, 403);
  // un membre CS peut nommer un non-membre (spec 17) et se retirer lui-même
  const resAjout = await cs.req('POST', `/admin/comptes/${ids.r2}/conseil`, { action: 'ajouter' });
  assert.strictEqual(resAjout.status, 302);
  assert.strictEqual(db().prepare('SELECT conseil_syndical FROM users WHERE id=?').get(ids.r2).conseil_syndical, 1);
  const resRetrait = await cs.req('POST', `/admin/comptes/${ids.r2}/conseil`, { action: 'retirer' });
  assert.strictEqual(resRetrait.status, 302);
  assert.strictEqual(db().prepare('SELECT conseil_syndical FROM users WHERE id=?').get(ids.r2).conseil_syndical, 0);
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

test('recherche plaintext sur la liste des tickets (titre + description uniquement) ; plus de filtre coût', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  await creerTicket(r1, [ids.villa1], 'Fuite évier cuisine');
  await creerTicket(r1, [ids.villa1], 'Volet roulant bloqué');
  const liste = await (await r1.req('GET', '/tickets?q=fuite')).text();
  assert.ok(liste.includes('Fuite évier cuisine'));
  assert.ok(!liste.includes('Volet roulant bloqué'));
  // la recherche porte aussi sur la description
  const liste2 = await (await r1.req('GET', '/tickets?q=roulant')).text();
  assert.ok(liste2.includes('Volet roulant bloqué'));
  assert.ok(!liste2.includes('Fuite évier cuisine'));
  // le paramètre cout_min n'existe plus : ignoré
  const liste3 = await (await r1.req('GET', '/tickets?cout_min=1000000')).text();
  assert.ok(liste3.includes('Fuite évier cuisine'));
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
  db().prepare("UPDATE tickets SET etape = 'archive' WHERE id = ?").run(t1);

  const liste = await (await r1.req('GET', '/tickets')).text();
  assert.ok(!liste.includes('Liste test ancien archivé'));
  assert.ok(liste.indexOf('Liste test urgent récent') < liste.indexOf('Liste test non urgent récent'));

  const archives = await (await r1.req('GET', '/tickets?etape=archive')).text();
  assert.ok(archives.includes('Liste test ancien archivé'));
});

test('consultations : création par le CS (entreprise + date + devis), validation exigeant une consultation complète', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket consultations');
  // création interdite tant que le ticket n'est pas en consultation
  const formTropTot = new FormData();
  formTropTot.append('entreprise_id', 'nouvelle');
  formTropTot.append('nouvelle_raison_sociale', 'Boîte');
  formTropTot.append('date_planifiee', '2026-12-01');
  formTropTot.append('devis_fichiers', new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), 'd.pdf');
  formTropTot.append('devis_montant', '300');
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/consultations`, undefined, formTropTot)).status, 400);
  // un résident ne peut pas créer de consultation
  await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/consultations`, undefined, formTropTot)).status, 403);
  // création par le CS avec nouvelle entreprise (fiche incomplète) : autorisée
  const res = await cs.req('POST', `/tickets/${tid}/consultations`, undefined, formTropTot);
  assert.strictEqual(res.status, 302);
  const c = db().prepare('SELECT * FROM consultations WHERE ticket_id = ?').get(tid);
  assert.ok(c);
  const devis = db().prepare('SELECT * FROM fichiers WHERE consultation_id = ?').get(c.id);
  assert.ok(devis);
  assert.strictEqual(devis.categorie, 'devis');
  assert.strictEqual(devis.montant, 300);
  // validation d'une consultation incomplète (entreprise non strictement complète) → 400
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/consultations/${c.id}/valider`)).status, 400);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'consultation');
  // entreprise complétée → validation OK → travaux planifiés
  db().prepare("UPDATE entreprises SET siren_siret='123 456 789 00012', contact_nom='M. Contact', telephone='0600', mail='c@e.fr' WHERE id = ?").run(c.entreprise_id);
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/consultations/${c.id}/valider`)).status, 302);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'intervention_planifiee');
  assert.strictEqual(db().prepare('SELECT validee FROM consultations WHERE id=?').get(c.id).validee, 1);
  // une fois en planifié, plus de création/modification de consultation
  const resApres = await cs.req('POST', `/tickets/${tid}/consultations`, undefined, formTropTot);
  assert.strictEqual(resApres.status, 400);
});

test('entreprises : CRUD réservé au CS/admin, non supprimable si utilisée dans une consultation', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // un résident n'a pas accès à la page
  assert.strictEqual((await r1.req('GET', '/entreprises')).status, 403);
  // ajout
  const res = await cs.req('POST', '/entreprises', { raison_sociale: 'Maçonnerie Test', siren_siret: '987 654 321 00098', contact_nom: 'Mme Test', telephone: '0699', mail: 'm@t.fr' });
  assert.strictEqual(res.status, 302);
  const e = db().prepare("SELECT * FROM entreprises WHERE raison_sociale = 'Maçonnerie Test'").get();
  assert.ok(e);
  // raison sociale obligatoire
  assert.strictEqual((await cs.req('POST', '/entreprises', { raison_sociale: '' })).status, 400);
  // suppression OK tant qu'inutilisée
  assert.strictEqual((await cs.req('POST', `/entreprises/${e.id}/supprimer`)).status, 302);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM entreprises WHERE id = ?').get(e.id).n, 0);
  // utilisée dans une consultation → non supprimable, mais modifiable
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket entreprise');
  const e2 = db().prepare('INSERT INTO entreprises (raison_sociale, siren_siret, contact_nom, telephone, mail) VALUES (?,?,?,?,?)')
    .run('Utilisée SARL', '1', 'c', 't', 'm').lastInsertRowid;
  db().prepare('INSERT INTO consultations (ticket_id, entreprise_id, date_planifiee, auteur_id) VALUES (?, ?, ?, ?)')
    .run(tid, e2, '2026-12-01', ids.cs);
  assert.strictEqual((await cs.req('POST', `/entreprises/${e2}/supprimer`)).status, 403);
  assert.strictEqual((await cs.req('POST', `/entreprises/${e2}/modifier`, { raison_sociale: 'Utilisée SARL renommée', siren_siret: '1', contact_nom: 'c', telephone: 't', mail: 'm' })).status, 302);
  assert.strictEqual(db().prepare('SELECT raison_sociale FROM entreprises WHERE id = ?').get(e2).raison_sociale, 'Utilisée SARL renommée');
});

test('panneau d\'administration : réservé à l\'admin, réglages péremption + archivage auto', async () => {
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  assert.strictEqual((await cs.req('GET', '/admin')).status, 403);
  assert.strictEqual((await cs.req('POST', '/admin', { peremption_rattachement_jours: '7', archivage_auto_jours: '20' })).status, 403);
  assert.strictEqual((await admin.req('GET', '/admin')).status, 200);
  const res = await admin.req('POST', '/admin', { peremption_rattachement_jours: '7', archivage_auto_jours: '20' });
  assert.strictEqual(res.status, 302);
  const { getParametre } = require('../src/parametres');
  assert.strictEqual(getParametre('peremption_rattachement_jours'), '7');
  assert.strictEqual(getParametre('archivage_auto_jours'), '20');
  // valeurs invalides → 400
  assert.strictEqual((await admin.req('POST', '/admin', { peremption_rattachement_jours: '0', archivage_auto_jours: '20' })).status, 400);
  // on remet les défauts pour ne pas influencer les autres tests
  await admin.req('POST', '/admin', { peremption_rattachement_jours: '14', archivage_auto_jours: '31' });
  assert.strictEqual(getParametre('peremption_rattachement_jours'), '14');
});

test('réouverture d\'un ticket « travaux acceptés » (commentaire + photo obligatoires) → retour en consultation, caduques, cycle suivant, bilans figés', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r2, [ids.villa2], 'Réouverture test');
  await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  const cid = ajouterConsultationComplete(tid, ids.cs);
  await cs.req('POST', `/tickets/${tid}/consultations/${cid}/valider`);
  // bilan du cycle 1 avant acceptation
  await r2.req('POST', `/tickets/${tid}/cr`, { contenu: 'Bilan cycle 1' });
  await r2.req('POST', `/tickets/${tid}/accepter`, { commentaire: 'ok' });
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'travaux_acceptes');
  // sans commentaire → 400
  const formSans = new FormData();
  formSans.append('commentaire', '');
  formSans.append('photos', new Blob(['x'], { type: 'image/png' }), 'p.png');
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/reouvrir`, undefined, formSans)).status, 400);
  // sans photo → 400
  const formSansPhoto = new FormData();
  formSansPhoto.append('commentaire', 'je rouvre');
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/reouvrir`, undefined, formSansPhoto)).status, 400);
  // avec commentaire + photo → retour en consultation
  const form = new FormData();
  form.append('commentaire', 'Le problème revient');
  form.append('photos', new Blob(['x'], { type: 'image/png' }), 'p.png');
  const res = await r2.req('POST', `/tickets/${tid}/reouvrir`, undefined, form);
  assert.strictEqual(res.status, 302);
  const t = db().prepare('SELECT etape, acceptes_at, cycle FROM tickets WHERE id=?').get(tid);
  assert.strictEqual(t.etape, 'consultation');
  assert.strictEqual(t.acceptes_at, null);
  assert.strictEqual(t.cycle, 2); // nouveau cycle : les bilans du cycle 1 sont figés
  // consultations et validations précédentes caduques (conservées en lecture seule)
  assert.strictEqual(db().prepare('SELECT caduque FROM consultations WHERE id=?').get(cid).caduque, 1);
  assert.strictEqual(db().prepare('SELECT caduque FROM resolutions WHERE ticket_id=?').get(tid).caduque, 1);
  // la consultation caduque ne permet plus de valider
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/consultations/${cid}/valider`)).status, 400);
  // le bilan du cycle 1 est conservé en lecture seule ; plus modifiable
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/cr`, { contenu: 'modif cycle 1' })).status, 403);
  const cr1 = db().prepare('SELECT * FROM comptes_rendus WHERE ticket_id=? AND cycle=1').get(tid);
  assert.ok(cr1 && cr1.contenu === 'Bilan cycle 1');
  // la photo de réouverture est bien enregistrée
  assert.strictEqual(db().prepare("SELECT COUNT(*) AS n FROM fichiers WHERE ticket_id=? AND categorie='photo' AND contexte='reouverture'").get(tid).n, 1);
  // nouveau cycle : on valide une NOUVELLE consultation, puis on rédige un NOUVEAU bilan (cycle 2)
  const cid2 = ajouterConsultationComplete(tid, ids.cs);
  await cs.req('POST', `/tickets/${tid}/consultations/${cid2}/valider`);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'intervention_planifiee');
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/cr`, { contenu: 'Bilan cycle 2' })).status, 302);
  const crs = db().prepare('SELECT cycle, contenu FROM comptes_rendus WHERE ticket_id=? ORDER BY cycle').all(tid);
  assert.strictEqual(crs.length, 2);
  assert.deepStrictEqual(crs.map(c => c.cycle), [1, 2]);
  assert.strictEqual(crs[1].contenu, 'Bilan cycle 2');
});

test('refus des travaux (planifiés → consultation) : commentaire OU photo obligatoire (spec 31), consultations caduques, cycle suivant (spec 28)', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r2, [ids.villa2], 'Refus test');
  await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  const cid = ajouterConsultationComplete(tid, ids.cs);
  await cs.req('POST', `/tickets/${tid}/consultations/${cid}/valider`);
  await r2.req('POST', `/tickets/${tid}/cr`, { contenu: 'Bilan avant refus' });
  // spec 31 : refus = au moins un commentaire OU une photo
  // refus sans commentaire NI photo → 400
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/refuser`, undefined, new FormData())).status, 400);
  // non concerné → 403
  const f2 = new FormData();
  f2.append('commentaire', 'travaux insuffisants');
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/refuser`, undefined, f2)).status, 403);
  // refus avec commentaire SEUL (sans photo) → accepté, retour en consultation, cycle 2
  const res = await r2.req('POST', `/tickets/${tid}/refuser`, undefined, f2);
  assert.strictEqual(res.status, 302);
  const t = db().prepare('SELECT etape, cycle FROM tickets WHERE id=?').get(tid);
  assert.strictEqual(t.etape, 'consultation');
  assert.strictEqual(t.cycle, 2);
  // consultations précédentes caduques (nouvelle instance de la phase consultation)
  assert.strictEqual(db().prepare('SELECT caduque FROM consultations WHERE id=?').get(cid).caduque, 1);
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/consultations/${cid}/valider`)).status, 400);

  // bilan du cycle 1 figé : plus modifiable, conservé
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/cr`, { contenu: 'x' })).status, 403);
  assert.strictEqual(db().prepare('SELECT contenu FROM comptes_rendus WHERE ticket_id=? AND cycle=1').get(tid).contenu, 'Bilan avant refus');
  // le CS peut aussi refuser
  const { tid: tid2 } = await creerTicket(r2, [ids.villa2], 'Refus par le CS');
  await cs.req('POST', `/tickets/${tid2}/passer-consultation`);
  const cid2 = ajouterConsultationComplete(tid2, ids.cs);
  await cs.req('POST', `/tickets/${tid2}/consultations/${cid2}/valider`);
  // refus du CS avec une photo SEULE (sans commentaire) → accepté aussi
  const f4 = new FormData();
  f4.append('photos', new Blob(['x'], { type: 'image/png' }), 'p.png');
  assert.strictEqual((await cs.req('POST', `/tickets/${tid2}/refuser`, undefined, f4)).status, 302);
  assert.strictEqual(db().prepare('SELECT etape, cycle FROM tickets WHERE id=?').get(tid2).etape, 'consultation');
  assert.strictEqual(db().prepare('SELECT cycle FROM tickets WHERE id=?').get(tid2).cycle, 2);
  // photo du refus enregistrée (contexte 'refus')
  assert.strictEqual(db().prepare("SELECT COUNT(*) AS n FROM fichiers WHERE ticket_id=? AND categorie='photo' AND contexte='refus'").get(tid2).n, 1);
});

test('péremption des demandes de rattachement (tâche périodique) + alertes J-3/J-1 aux admin et CS', async () => {
  const { executerTaches } = require('../src/taches');
  // demande de 20 jours → périmée (14 j) → supprimée
  db().prepare("INSERT INTO rattachements (unit_id, user_id, qualite, statut, created_at) VALUES (?, ?, 'locataire', 'en_attente', datetime('now', '-20 days'))").run(ids.garage1, ids.r2);
  // demande de 12 jours → alerte J-3 (et J-1), pas encore supprimée
  const r12 = db().prepare("INSERT INTO rattachements (unit_id, user_id, qualite, statut, created_at) VALUES (?, ?, 'locataire', 'en_attente', datetime('now', '-12 days'))").run(ids.villa1, ids.r2).lastInsertRowid;
  executerTaches();
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM rattachements WHERE unit_id=? AND user_id=?').get(ids.garage1, ids.r2).n, 0);
  const r = db().prepare('SELECT * FROM rattachements WHERE id=?').get(r12);
  assert.ok(r);
  assert.strictEqual(r.notif_peremption_j3, 1);
  const nAdmin = db().prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND type='peremption'").get(ids.admin).n;
  const nCs = db().prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND type='peremption'").get(ids.cs).n;
  assert.ok(nAdmin >= 1);
  assert.ok(nCs >= 1);
  // après péremption, une nouvelle demande sur la même unité est possible
  db().prepare("INSERT INTO rattachements (unit_id, user_id, qualite, statut) VALUES (?, ?, 'proprietaire', 'en_attente')").run(ids.garage1, ids.r2);
  assert.ok(db().prepare('SELECT COUNT(*) AS n FROM rattachements WHERE unit_id=? AND user_id=?').get(ids.garage1, ids.r2).n >= 1);
});

test('archivage automatique des « travaux acceptés » après le délai (sans condition de facture, spec 24) + alerte J-3', async () => {
  const { executerTaches } = require('../src/taches');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // acceptés depuis 40 jours → archivé automatiquement (spec 24 : sans condition de facture)
  const { tid } = await creerTicket(r1, [ids.villa1], 'Archivage auto avec facture');
  db().prepare("UPDATE tickets SET etape='travaux_acceptes', acceptes_at=datetime('now','-40 days') WHERE id=?").run(tid);
  ajouterFacture(tid, ids.cs, 100);
  // sans facture non plus : archivé quand même
  const { tid: tid2 } = await creerTicket(r1, [ids.villa1], 'Archivage auto sans facture');
  db().prepare("UPDATE tickets SET etape='travaux_acceptes', acceptes_at=datetime('now','-40 days') WHERE id=?").run(tid2);
  // 29 jours (délai 31, alerte J-3 à 28 jours) → alerte envoyée, pas archivé
  const { tid: tid4 } = await creerTicket(r1, [ids.villa1], 'Alerte J-3 archivage');
  db().prepare("UPDATE tickets SET etape='travaux_acceptes', acceptes_at=datetime('now','-29 days') WHERE id=?").run(tid4);
  executerTaches();
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'archive');
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid2).etape, 'archive');
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid4).etape, 'travaux_acceptes');
  assert.strictEqual(db().prepare('SELECT notif_archive_j3 FROM tickets WHERE id=?').get(tid4).notif_archive_j3, 1);
  // notification de la transition d'archivage auto (CS + résident concerné + admin)
  const nCs = db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND ticket_id=? AND type=?').get(ids.cs, tid, 'changement_etape').n;
  const nR1 = db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND ticket_id=? AND type=?').get(ids.r1, tid, 'changement_etape').n;
  const nAdmin = db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND ticket_id=? AND type=?').get(ids.admin, tid, 'changement_etape').n;
  assert.ok(nCs >= 1 && nR1 >= 1 && nAdmin >= 1);
});

test('UI : recherche comptes/tickets présentes, boutons archiver/supprimer sous le titre, sections filtrées selon l\'état, sw en réseau d\'abord', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // page des comptes : champ de recherche à la volée avec data-recherche
  const comptes = await (await cs.req('GET', '/admin/comptes')).text();
  assert.ok(comptes.includes('id="recherche-comptes"'));
  assert.ok(comptes.includes('data-recherche='));
  // liste des tickets : champ de recherche pleine largeur, HORS du formulaire
  // (filtrage à la volée côté client, sans rechargement donc sans perte de focus)
  const listeRes = await r1.req('GET', '/tickets');
  const liste = await listeRes.text();
  // anti-cache (spec 29) : HTML et statiques toujours revalidés côté serveur
  assert.ok((listeRes.headers.get('cache-control') || '').includes('no-cache'));
  const appRes = await r1.req('GET', '/app.js');
  assert.ok((appRes.headers.get('cache-control') || '').includes('no-cache'));
  assert.ok(liste.includes('id="recherche-tickets"'));
  assert.ok(liste.includes('recherche-pleine'));
  assert.ok(liste.includes('id="filtres-tickets"'));
  assert.ok(liste.indexOf('id="recherche-tickets"') < liste.indexOf('id="filtres-tickets"'));
  assert.ok(liste.includes('data-recherche='));
  // filtres en dropdowns custom (ouverture instantanée, pas de picker natif)
  assert.ok(liste.includes('class="dropdown"'));
  assert.ok(liste.includes('name="etape"'));
  assert.ok(!liste.includes('<select name="etape"'));
  // filtre unités en multiselect « search » (spec 29) : champ texte + puces, plus de dropdown simple
  assert.ok(liste.includes('id="filtre-unites"'));
  assert.ok(liste.includes('id="recherche-unite"'));
  assert.ok(liste.includes('data-options='));
  assert.ok(!liste.includes('data-filtre="unite"'));
  const appjs = await (await r1.req('GET', '/app.js')).text();
  assert.ok(appjs.includes("getElementById('recherche-tickets')"));
  assert.ok(appjs.includes('#liste-tickets li'));
  assert.ok(appjs.includes('dropdown-bouton'));
  assert.ok(appjs.includes("getElementById('filtre-unites')"));
  assert.ok(appjs.includes("getElementById('modale-entreprise')"));
  assert.ok(appjs.includes('data-autosave'));
  assert.ok(appjs.includes("getElementById('unites-edit')"));
  // fiche ticket en « créé » : boutons sous le titre, pas de section coût / "Modifier le ticket" / commentaire / consultations / CR
  const { tid } = await creerTicket(r1, [ids.villa1], 'Ticket UI');
  const page = await (await r1.req('GET', '/tickets/' + tid)).text();
  assert.ok(page.includes('actions-titre'));
  assert.ok(page.includes('/archiver'));
  assert.ok(page.includes('/supprimer'));
  assert.ok(!page.includes('Coût du ticket'));
  assert.ok(!page.includes('Modifier le ticket'));
  assert.ok(!page.includes('Écrire un commentaire'));
  // sauvegarde à la volée (spec 26) + unités par clic (spec 27)
  assert.ok(page.includes('data-autosave'));
  assert.ok(!page.includes('Enregistrer la description'));
  assert.ok(page.includes('id="unites-edit"'));
  assert.ok(page.includes('multiselect unites-edit'));
  assert.ok(!page.includes('unite-pill'));
  assert.ok(!page.includes('Un clic sur une unité'));
  assert.ok(!page.includes('Modifier les unités'));
  assert.ok(!page.includes('id="consultations"'));
  assert.ok(!page.includes('id="factures"'));
  assert.ok(!page.includes('Comptes-rendus d\'intervention'));
  // service worker : réseau d'abord (sinon l'ancien app.js reste servi en cache)
  const sw = await (await r1.req('GET', '/sw.js')).text();
  assert.ok(sw.includes('copro-v4'));
  assert.ok(!sw.includes("cache d'abord"));
  // la modale est bien masquée par défaut (sinon overlay vide qui bloque la page)
  assert.ok(page.includes('id="modale" class="modale-fond" hidden'));
  const css = await (await r1.req('GET', '/style.css')).text();
  assert.ok(css.includes('.modale-fond[hidden]'));
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
  // spec 29 : plus de titre « Ajouter à l'écran d'accueil » dans la page de compte
  assert.ok(!profil.includes('Ajouter à l\'écran d\'accueil</h2>'));
});

test('spec 29 : fiche ticket réorganisée (sections par état, règle archive), multiselect unités, consultations en tuples + modale, profil annulations', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');

  // --- filtre unités multiselect (spec 29) ---
  const t1 = (await creerTicket(r1, [ids.villa1], 'Spec29 villa 1')).tid;
  const t2 = (await creerTicket(r1, [ids.villa2, ids.villa1], 'Spec29 villa 2')).tid;
  let liste = await (await r1.req('GET', `/tickets?unite=${ids.villa1}&unite=${ids.villa2}&etape=cree`)).text();
  assert.ok(liste.includes('Spec29 villa 1') && liste.includes('Spec29 villa 2'));
  assert.ok(liste.includes('id="filtre-unites"') && liste.includes('class="chip"'));
  assert.ok(liste.includes(`name="unite" value="${ids.villa1}"`) && liste.includes(`name="unite" value="${ids.villa2}"`));
  liste = await (await r1.req('GET', `/tickets?unite=${ids.villa2}&etape=cree`)).text();
  assert.ok(!liste.includes('Spec29 villa 1') && liste.includes('Spec29 villa 2'));
  // « toutes » l'emporte sur une sélection individuelle
  liste = await (await r1.req('GET', `/tickets?unite=${ids.villa1}&unite=toutes&etape=cree`)).text();
  assert.ok(liste.includes('Spec29 villa 1') && liste.includes('Spec29 villa 2'));

  // --- fiche ticket : sections selon l'état (spec 29) ---
  let page = await (await r1.req('GET', '/tickets/' + t1)).text();
  assert.ok(page.includes('id="description"'));
  assert.ok(page.includes('id="unites-edit"'));
  assert.ok(!page.includes('Un clic sur une unité'));
  assert.ok(!page.includes('id="consultations"') && !page.includes('id="factures"') && !page.includes('id="cr"'));

  // passage en consultation : section Consultation (liste de tuples + bouton ajouter + modale), PAS de factures
  await cs.req('POST', `/tickets/${t1}/passer-consultation`);
  page = await (await cs.req('GET', '/tickets/' + t1)).text();
  assert.ok(page.includes('id="consultations"'));
  assert.ok(page.includes('class="liste-consultations"'));
  assert.ok(page.includes('id="btn-ajouter-consultation"'));
  assert.ok(page.includes('id="modale-entreprise"'));
  assert.ok(page.includes('id="fiche-nouvelle-entreprise" hidden'));
  assert.ok(!page.includes('id="factures"'));
  assert.ok(!page.includes('id="cr"'));
  // ordre des sections : description < consultations
  assert.ok(page.indexOf('id="description"') < page.indexOf('id="consultations"'));
  // ajout d'une consultation complète en base -> tuple affiché (entreprise, devis, prix, date, bouton de choix)
  const cid = ajouterConsultationComplete(t1, ids.cs);
  page = await (await cs.req('GET', '/tickets/' + t1)).text();
  assert.ok(page.includes('Entreprise Test SARL') && page.includes('500.00 €') && page.includes('2026-12-01'));
  assert.ok(page.includes(`/tickets/${t1}/consultations/${cid}/valider`));

  // validation -> travaux planifiés : section Bilan visible (personne concernée), toujours pas de factures
  await cs.req('POST', `/tickets/${t1}/consultations/${cid}/valider`);
  page = await (await r1.req('GET', '/tickets/' + t1)).text();
  assert.ok(page.includes('id="cr"'));
  assert.ok(!page.includes('id="factures"'));
  assert.ok(page.indexOf('id="consultations"') < page.indexOf('id="cr"'));

  // acceptation -> travaux acceptés : section Factures enfin visible, après le bilan
  await r1.req('POST', `/tickets/${t1}/accepter`, { commentaire: 'ok' });
  page = await (await r1.req('GET', '/tickets/' + t1)).text();
  assert.ok(page.includes('id="factures"'));
  // spec 30 : plus de section « Acceptations des travaux », acceptation en pastille dans le bilan + réouverture dans le bilan
  assert.ok(!page.includes('Acceptations des travaux'));
  assert.ok(page.includes('rattachement-pill') && page.includes('a accepté'));
  assert.ok(page.includes(`/tickets/${t1}/reouvrir`));
  assert.ok(page.indexOf('id="description"') < page.indexOf('id="consultations"')
    && page.indexOf('id="consultations"') < page.indexOf('id="cr"')
    && page.indexOf('id="cr"') < page.indexOf('id="factures"'));

  // archivé après travaux acceptés : toutes les sections restent affichées (règle archive, lecture seule)
  await cs.req('POST', `/tickets/${t1}/archiver`);
  page = await (await r1.req('GET', '/tickets/' + t1)).text();
  assert.ok(page.includes('id="consultations"') && page.includes('id="cr"') && page.includes('id="factures"'));
  assert.ok(!page.includes(`/tickets/${t1}/factures"`)); // plus de formulaire d'ajout en archivé

  // archivé directement depuis « créé » : aucune section d'état non atteint
  const t3 = (await creerTicket(r1, [ids.villa1], 'Spec29 archivé direct')).tid;
  await cs.req('POST', `/tickets/${t3}/archiver`);
  page = await (await r1.req('GET', '/tickets/' + t3)).text();
  assert.ok(!page.includes('id="consultations"') && !page.includes('id="cr"') && !page.includes('id="factures"'));

  // --- profil : annulation demande en attente + modales de confirmation (spec 29) ---
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  await r2.req('POST', '/profil/reclamer', { unite_id: String(ids.garage1), qualite: 'locataire' });
  const demande = db().prepare('SELECT id FROM rattachements WHERE user_id = ? AND statut = ?').get(ids.r2, 'en_attente');
  assert.ok(demande);
  let profil = await (await r2.req('GET', '/profil')).text();
  assert.ok(profil.includes(`/profil/rattachements/${demande.id}/annuler`));
  assert.ok(profil.includes('data-confirm="Annuler votre demande de rattachement'));
  // modale de confirmation aussi sur le retrait d'une unité acceptée
  assert.ok(profil.includes('data-confirm="Annuler votre rattachement'));
  const resAnnul = await r2.req('POST', `/profil/rattachements/${demande.id}/annuler`);
  assert.strictEqual(resAnnul.status, 302);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM rattachements WHERE id = ?').get(demande.id).n, 0);
  // annulation d'une autre demande d'un autre user : refusée (404/redirect sans suppression)
  await r2.req('POST', '/profil/reclamer', { unite_id: String(ids.garage1), qualite: 'locataire' });
  const demande2 = db().prepare('SELECT id FROM rattachements WHERE user_id = ? AND statut = ?').get(ids.r2, 'en_attente');
  await r1.req('POST', `/profil/rattachements/${demande2.id}/annuler`);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM rattachements WHERE id = ?').get(demande2.id).n, 1);
});

test('spec 31 : toggle urgent (Créé seulement, acteurs), libellés description, photos description jusqu\'en consultation, bilan = une seule zone + Accepter/Refuser', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1], 'Spec31 test');

  // --- libellés : plus de label "Description" ni de titre "Unités concernées" (spec 31) ---
  let page = await (await r1.req('GET', '/tickets/' + tid)).text();
  assert.ok(page.includes('<h2>Description</h2>'));
  assert.ok(page.includes('aria-label="Description"'));
  assert.ok(!page.includes('<label>Description'));
  assert.ok(!page.includes('<h3>Unités concernées</h3>'));

  // --- toggle urgent : visible et fonctionnel à l'état « Créé » pour les acteurs ---
  assert.ok(page.includes(`action="/tickets/${tid}/urgent"`));
  const pageR2 = await (await r2.req('GET', '/tickets/' + tid)).text();
  assert.ok(!pageR2.includes(`action="/tickets/${tid}/urgent"`)); // r2 non concerné
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/urgent`, { urgent: '1' })).status, 403);
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/urgent`, { urgent: '1' })).status, 302);
  assert.strictEqual(db().prepare('SELECT urgent FROM tickets WHERE id=?').get(tid).urgent, 1);
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/urgent`, {})).status, 302); // CS peut retirer
  assert.strictEqual(db().prepare('SELECT urgent FROM tickets WHERE id=?').get(tid).urgent, 0);

  // --- photos de la description : ajout/suppression par toute personne concernée tant que « Créé » ---
  const fp = new FormData();
  fp.append('photos', new Blob(['x'], { type: 'image/png' }), 'p.png');
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/photos`, undefined, fp)).status, 403); // non concerné
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/photos`, undefined, fp)).status, 302);
  assert.strictEqual(db().prepare("SELECT COUNT(*) AS n FROM fichiers WHERE ticket_id=? AND categorie='photo' AND contexte='creation'").get(tid).n, 1);
  page = await (await r1.req('GET', '/tickets/' + tid)).text();
  assert.ok(page.includes(`action="/tickets/${tid}/photos"`)); // formulaire d'ajout présent
  const fid = db().prepare("SELECT id FROM fichiers WHERE ticket_id=? AND categorie='photo' AND contexte='creation'").get(tid).id;
  // suppression par le CS (personne concernée) autorisée à l'état « Créé »
  assert.strictEqual((await cs.req('POST', `/fichiers/${fid}/supprimer`)).status, 302);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM fichiers WHERE id=?').get(fid).n, 0);

  // --- passage en consultation : urgent figé, photos figées ---
  await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/urgent`, { urgent: '1' })).status, 403);
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/photos`, undefined, fp)).status, 403);
  page = await (await r1.req('GET', '/tickets/' + tid)).text();
  assert.ok(!page.includes(`action="/tickets/${tid}/urgent"`));
  assert.ok(!page.includes(`action="/tickets/${tid}/photos"`));

  // --- bilan : une seule zone (texte + photos) + boutons Accepter/Refuser en formaction (spec 31) ---
  const cid = ajouterConsultationComplete(tid, ids.cs);
  await cs.req('POST', `/tickets/${tid}/consultations/${cid}/valider`);
  page = await (await r1.req('GET', '/tickets/' + tid)).text();
  assert.ok(page.includes(`formaction="/tickets/${tid}/accepter"`));
  assert.ok(page.includes(`formaction="/tickets/${tid}/refuser"`));
  assert.ok(page.includes('actions-acceptation'));
  // une seule zone commentaire+photos dans la section bilans : un seul input fichier sur la page
  assert.strictEqual((page.match(/type="file"/g) || []).length, 1);
  // acceptation via le champ contenu (même zone) : le commentaire est repris depuis le bilan
  await r1.req('POST', `/tickets/${tid}/cr`, { contenu: 'Bilan ok' });
  const fa = new FormData();
  fa.append('contenu', 'Bilan ok');
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/accepter`, undefined, fa)).status, 302);
  assert.strictEqual(db().prepare('SELECT commentaire FROM resolutions WHERE ticket_id=? AND user_id=?').get(tid, ids.r1).commentaire, 'Bilan ok');
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'travaux_acceptes');
});
