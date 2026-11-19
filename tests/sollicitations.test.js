const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let server, base, dbDir;
let ids = {};

function tmpEnv() {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-sollicit-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  process.env.MAIL_ENABLED = 'false'; // envois journalisés (lignes + jetons), pas de SMTP
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
    }
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
  db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)').run('communes', null, 'Parties communes');
  const mdp = hashPassword('motdepasse1');
  const insUser = db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?,?,?,?,?,?,?,?,1)');
  ids.admin = insUser.run('admin@test.local', mdp, 'Admin', 'A', '0600', 'admin', 0, 'actif').lastInsertRowid;
  ids.cs = insUser.run('cs@test.local', mdp, 'Conseil', 'Claire', '0601', 'resident', 1, 'actif').lastInsertRowid;
  ids.cs2 = insUser.run('cs2@test.local', mdp, 'Conseil2', 'Chloe', '0607', 'resident', 1, 'actif').lastInsertRowid;
  ids.r1 = insUser.run('r1@test.local', mdp, 'Resident 1', 'Jean', '0602', 'resident', 0, 'actif').lastInsertRowid;
  ids.r2 = insUser.run('r2@test.local', mdp, 'Resident 2', 'Marie', '0603', 'resident', 0, 'actif').lastInsertRowid;
  ids.villa1 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id;
  ids.villa2 = db.prepare("SELECT id FROM units WHERE type='villa' AND numero=2").get().id;
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(ids.villa1, ids.r1, 'proprietaire');
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(ids.villa2, ids.r2, 'proprietaire');
  const communes = db.prepare("SELECT id FROM units WHERE type='communes'").get().id;
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(communes, ids.cs, 'proprietaire');
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)').run(communes, ids.cs2, 'proprietaire');
  const { createApp } = require('../src/app');
  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fs.rmSync(dbDir, { recursive: true, force: true }); });

function db() { return require('../src/db').getDb(); }

async function creerTicket(c, uniteIds, titre = 'Ticket sollicitation') {
  const res = await c.req('POST', '/tickets', { titre, description: 'Fuite sous l\u2019évier de la cuisine', unite_ids: uniteIds.map(String) });
  return { res, tid: res.status === 302 ? Number(res.headers.get('location').split('/').pop()) : null };
}

// Consultation active (pas de devis) avec une entreprise ayant un email.
function ajouterConsultation(tid, auteurId, raison = 'Plombier SARL', mail = 'contact@plombier.fr', avecDevis = false, date = null) {
  const eid = db().prepare('INSERT INTO entreprises (raison_sociale, siren_siret, contact_nom, telephone, mail) VALUES (?,?,?,?,?)')
    .run(raison, '123 456 789 00012', 'M. Contact', '0600000000', mail).lastInsertRowid;
  const cid = db().prepare('INSERT INTO consultations (ticket_id, entreprise_id, date_planifiee, auteur_id) VALUES (?, ?, ?, ?)')
    .run(tid, eid, date, auteurId).lastInsertRowid;
  if (avecDevis) {
    db().prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, consultation_id, auteur_id) VALUES (?, 'devis', 'devis.pdf', 'devis-x.pdf', 'application/pdf', 10, 500, ?, ?)")
      .run(tid, cid, auteurId);
  }
  return { cid, eid };
}

function ajouterPhoto(tid, auteurId, nomStockage = 'photo-test.jpg') {
  fs.writeFileSync(path.join(process.env.UPLOAD_DIR, nomStockage), 'x');
  return db().prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, contexte, auteur_id) VALUES (?, 'photo', 'photo.jpg', ?, 'image/jpeg', 1, 'creation', ?)")
    .run(tid, nomStockage, auteurId).lastInsertRowid;
}

async function setupTicketConsultation() {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const { tid } = await creerTicket(r1, [ids.villa1]);
  await cs.req('POST', `/tickets/${tid}/passer-consultation`);
  const { cid } = ajouterConsultation(tid, ids.cs);
  return { r1, cs, tid, cid };
}

test('sollicitation globale : un clic envoie un mail aux entreprises sans devis (jeton 7 jours, log, notification CS)', async () => {
  const { r1, cs, tid, cid } = await setupTicketConsultation();
  // un résident ne peut pas solliciter
  assert.strictEqual((await r1.req('POST', `/tickets/${tid}/solliciter`)).status, 403);
  // le CS sollicite globalement
  const res = await cs.req('POST', `/tickets/${tid}/solliciter`);
  assert.strictEqual(res.status, 302);
  const s = db().prepare('SELECT * FROM sollicitations WHERE consultation_id = ?').get(cid);
  assert.ok(s);
  assert.strictEqual(s.type, 'sollicitation');
  assert.strictEqual(s.auteur_id, ids.cs);
  // jeton d'accès externe de type 'devis', valable ~7 jours
  const a = db().prepare("SELECT * FROM acces_externes WHERE consultation_id = ? AND type = 'devis'").get(cid);
  assert.ok(a && a.token.length >= 64);
  const duree = new Date(a.expires_at).getTime() - Date.now();
  assert.ok(duree > 6 * 86400000 && duree <= 7 * 86400000 + 1000);
  // événement journalisé dans le fil de suivi
  const ev = db().prepare("SELECT * FROM ticket_events WHERE ticket_id = ? AND type = 'sollicitation'").get(tid);
  assert.ok(ev && ev.contenu.includes('Plombier SARL'));
  // notification in-app au membre du CS (auteur exclu)
  const n = db().prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'sollicitation'").get(ids.cs2);
  assert.ok(n && n.ticket_id === tid);
  // une deuxième sollicitation devient une relance
  await cs.req('POST', `/tickets/${tid}/solliciter`);
  const types = db().prepare('SELECT type FROM sollicitations WHERE consultation_id = ? ORDER BY id').all(cid).map(r => r.type);
  assert.deepStrictEqual(types, ['sollicitation', 'relance']);
});

test('sollicitation : individuelle, ciblée sans devis, refusée si devis déjà déposé ou email manquant', async () => {
  const { r1, cs, tid, cid } = await setupTicketConsultation();
  // consultation avec devis -> pas ciblée par le global, et solliciter individuelle -> 400
  const avecDevis = ajouterConsultation(tid, ids.cs, 'Electricien SAS', 'c@elec.fr', true);
  // consultation sans email -> ignorée par le global
  ajouterConsultation(tid, ids.cs, 'Sans Mail SARL', '');
  const res = await cs.req('POST', `/tickets/${tid}/solliciter`);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM sollicitations WHERE consultation_id = ?').get(cid).n, 1);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM sollicitations WHERE consultation_id = ?').get(avecDevis.cid).n, 0);
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/consultations/${avecDevis.cid}/solliciter`)).status, 400);
  // individuelle OK sur la consultation sans devis
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/consultations/${cid}/solliciter`)).status, 302);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM sollicitations WHERE consultation_id = ?').get(cid).n, 2);
  // rien à solliciter nulle part -> 400
  const { tid: tid2 } = await creerTicket(r1, [ids.villa1], 'Tout a devis');
  await cs.req('POST', `/tickets/${tid2}/passer-consultation`);
  ajouterConsultation(tid2, ids.cs, 'Dejà OK SARL', 'c@ok.fr', true);
  assert.strictEqual((await cs.req('POST', `/tickets/${tid2}/solliciter`)).status, 400);
});

test('espace prestataire : page réduite par jeton (titre, description, photos), jeton expiré = 404, fichiers scoping', async () => {
  const { cs, tid, cid } = await setupTicketConsultation();
  ajouterPhoto(tid, ids.cs);
  await cs.req('POST', `/tickets/${tid}/solliciter`);
  const a = db().prepare("SELECT * FROM acces_externes WHERE consultation_id = ? AND type = 'devis'").get(cid);
  // page publique sans compte
  const page = await (await fetch(base + '/consultation/' + a.token, { redirect: 'manual' })).text();
  assert.ok(page.includes('Ticket sollicitation'));
  assert.ok(page.includes('Fuite sous l\u2019évier de la cuisine'));
  assert.ok(page.includes(`/consultation/${a.token}/devis`)); // section dépôt de devis
  assert.ok(page.includes(`/consultation/${a.token}/fichiers/`)); // photos
  assert.ok(!page.includes('Fil de suivi'));
  // photo servie via le jeton
  const fid = db().prepare("SELECT id FROM fichiers WHERE ticket_id=? AND categorie='photo'").get(tid).id;
  const f = await fetch(base + `/consultation/${a.token}/fichiers/${fid}`);
  assert.strictEqual(f.status, 200);
  // un fichier d'un AUTRE ticket -> 404
  const { tid: autre } = await creerTicket(await (async () => { const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1'); return r1; })(), [ids.villa1], 'Autre ticket');
  const fidAutre = ajouterPhoto(autre, ids.cs, 'photo-autre.jpg');
  assert.strictEqual((await fetch(base + `/consultation/${a.token}/fichiers/${fidAutre}`)).status, 404);
  // jeton inconnu / expiré -> 404
  assert.strictEqual((await fetch(base + '/consultation/jetonbidon')).status, 404);
  db().prepare("INSERT INTO acces_externes (consultation_id, token, type, expires_at) VALUES (?, 'jetonexpire', 'devis', ?)")
    .run(cid, new Date(Date.now() - 1000).toISOString());
  assert.strictEqual((await fetch(base + '/consultation/jetonexpire')).status, 404);
});

test('dépôt de devis par le prestataire via le jeton : fichier + montant + entreprise modifiable, notification CS avec lien fichier', async () => {
  const { cs, tid, cid } = await setupTicketConsultation();
  await cs.req('POST', `/tickets/${tid}/solliciter`);
  const a = db().prepare("SELECT token FROM acces_externes WHERE consultation_id = ? AND type='devis'").get(cid);
  const form = new FormData();
  form.append('entreprise_raison', 'Plombier SARL Renommé');
  form.append('devis_fichiers', new Blob(['%PDF-1.4 devis'], { type: 'application/pdf' }), 'devis.pdf');
  form.append('devis_montant', '250');
  const res = await fetch(base + '/consultation/' + a.token + '/devis', { method: 'POST', body: form, redirect: 'manual' });
  assert.strictEqual(res.status, 302);
  assert.ok(res.headers.get('location').includes('ok=devis'));
  const d = db().prepare("SELECT * FROM fichiers WHERE consultation_id = ? AND categorie = 'devis'").get(cid);
  assert.ok(d);
  assert.strictEqual(d.montant, 250);
  assert.strictEqual(d.auteur_id, null);
  assert.strictEqual(d.auteur_externe, 'Plombier SARL Renommé');
  // l'entreprise a été renommée (modification facultative)
  assert.strictEqual(db().prepare('SELECT raison_sociale FROM entreprises WHERE id = ?').get(db().prepare('SELECT entreprise_id FROM consultations WHERE id=?').get(cid).entreprise_id).raison_sociale, 'Plombier SARL Renommé');
  // notification aux membres du CS avec lien direct vers le fichier (donnees JSON)
  const n = db().prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'devis_prestataire'").get(ids.cs2);
  assert.ok(n && n.ticket_id === tid);
  assert.strictEqual(JSON.parse(n.donnees).fichier_id, d.id);
  // tous les membres du CS sont notifiés (le prestataire n'a pas de compte)
  assert.strictEqual(db().prepare("SELECT COUNT(*) AS n FROM notifications WHERE type='devis_prestataire' AND user_id=?").get(ids.cs).n, 1);
  assert.strictEqual(db().prepare("SELECT COUNT(*) AS n FROM notifications WHERE type='devis_prestataire' AND user_id=?").get(ids.cs2).n, 1);
  // événement dans le fil
  assert.ok(db().prepare("SELECT 1 FROM ticket_events WHERE ticket_id=? AND type='devis_prestataire'").get(tid));
  // un second dépôt remplace le devis (1 seul devis par consultation)
  const form2 = new FormData();
  form2.append('devis_fichiers', new Blob(['%PDF-1.4 devis2'], { type: 'application/pdf' }), 'devis2.pdf');
  form2.append('devis_montant', '300');
  await fetch(base + '/consultation/' + a.token + '/devis', { method: 'POST', body: form2, redirect: 'manual' });
  assert.strictEqual(db().prepare("SELECT COUNT(*) AS n FROM fichiers WHERE consultation_id=? AND categorie='devis'").get(cid).n, 1);
  assert.strictEqual(db().prepare("SELECT montant FROM fichiers WHERE consultation_id=? AND categorie='devis'").get(cid).montant, 300);
  // montant invalide -> pas de dépôt
  const form3 = new FormData();
  form3.append('devis_fichiers', new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), 'x.pdf');
  form3.append('devis_montant', '0');
  const res3 = await fetch(base + '/consultation/' + a.token + '/devis', { method: 'POST', body: form3, redirect: 'manual' });
  assert.strictEqual(res3.status, 302);
  assert.ok(res3.headers.get('location').includes('erreur='));
  assert.strictEqual(db().prepare("SELECT montant FROM fichiers WHERE consultation_id=? AND categorie='devis'").get(cid).montant, 300);
  // la page publique affiche le devis déposé
  const page = await (await fetch(base + '/consultation/' + a.token)).text();
  assert.ok(page.includes('devis2.pdf') && page.includes('300.00'));
  // le devis déposé est servi via le jeton
  const fid = db().prepare("SELECT id FROM fichiers WHERE consultation_id=? AND categorie='devis'").get(cid).id;
  assert.strictEqual((await fetch(base + `/consultation/${a.token}/fichiers/${fid}`)).status, 200);
});

test('sélection : reste en consultation + mail de dates (jeton), passage en travaux planifiés bloqué sans date acceptée', async () => {
  const { r1, cs, tid, cid } = await setupTicketConsultation();
  // entreprise complète + devis déposé par le prestataire
  db().prepare("UPDATE entreprises SET siren_siret='123 456 789 00012', contact_nom='M. Contact', telephone='0600', mail='contact@plombier.fr' WHERE id = (SELECT entreprise_id FROM consultations WHERE id=?)").run(cid);
  await cs.req('POST', `/tickets/${tid}/solliciter`);
  const a = db().prepare("SELECT token FROM acces_externes WHERE consultation_id = ? AND type='devis'").get(cid);
  const form = new FormData();
  form.append('devis_fichiers', new Blob(['%PDF-1.4 d'], { type: 'application/pdf' }), 'd.pdf');
  form.append('devis_montant', '420');
  await fetch(base + '/consultation/' + a.token + '/devis', { method: 'POST', body: form, redirect: 'manual' });
  // sélection par le CS (date plus requise à la sélection)
  const res = await cs.req('POST', `/tickets/${tid}/consultations/selectionner`, { consultation_ids: [String(cid)] });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(db().prepare('SELECT validee FROM consultations WHERE id=?').get(cid).validee, 1);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'consultation');
  // jeton 'dates' créé pour le mail de planification
  const jd = db().prepare("SELECT * FROM acces_externes WHERE consultation_id = ? AND type='dates'").get(cid);
  assert.ok(jd && jd.token !== a.token);
  // la page publique du prestataire propose maintenant les dates
  const page = await (await fetch(base + '/consultation/' + a.token)).text();
  assert.ok(page.includes('Proposer vos dates'));
  // passage en travaux planifiés sans date -> 400
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/travaux-planifies`)).status, 400);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'consultation');
  // le prestataire propose des dates (heure facultative)
  const fd = new FormData();
  fd.append('dates', '2026-12-10');
  fd.append('heures', '09:00');
  fd.append('dates', '2026-12-11');
  fd.append('heures', '');
  const resDates = await fetch(base + '/consultation/' + a.token + '/dates', { method: 'POST', body: fd, redirect: 'manual' });
  assert.strictEqual(resDates.status, 302);
  assert.ok(resDates.headers.get('location').includes('ok=dates'));
  const props = db().prepare('SELECT * FROM consultation_dates WHERE consultation_id = ? ORDER BY id').all(cid);
  assert.strictEqual(props.length, 2);
  assert.strictEqual(props[0].date, '2026-12-10');
  assert.strictEqual(props[0].heure, '09:00');
  assert.strictEqual(props[0].propose_par, 'prestataire');
  assert.strictEqual(props[0].validee, 0);
  assert.ok(db().prepare("SELECT 1 FROM ticket_events WHERE ticket_id=? AND type='dates_proposees'").get(tid));
  assert.ok(db().prepare("SELECT 1 FROM notifications WHERE user_id=? AND type='dates_proposees'").get(ids.cs2));
  // toujours pas de passage possible sans date validée
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/travaux-planifies`)).status, 400);
  // un résident NON concerné ne peut pas valider une date -> 403
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  assert.strictEqual((await r2.req('POST', `/tickets/${tid}/consultations/${cid}/dates/${props[0].id}/valider`)).status, 403);
  // l'occupant concerné (r1) valide la première date proposée
  const resV = await r1.req('POST', `/tickets/${tid}/consultations/${cid}/dates/${props[0].id}/valider`);
  assert.strictEqual(resV.status, 302);
  assert.strictEqual(db().prepare('SELECT validee FROM consultation_dates WHERE id=?').get(props[0].id).validee, 1);
  assert.strictEqual(db().prepare('SELECT date_planifiee FROM consultations WHERE id=?').get(cid).date_planifiee, '2026-12-10');
  assert.ok(db().prepare("SELECT 1 FROM ticket_events WHERE ticket_id=? AND type='date_validee' AND auteur_id=?").get(tid, ids.r1));
  // passage en travaux planifiés maintenant possible
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/travaux-planifies`)).status, 302);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'intervention_planifiee');
});

test('date saisie à la main par le CS sur une consultation sélectionnée (échange hors outil)', async () => {
  const { cs, tid, cid } = await setupTicketConsultation();
  db().prepare("UPDATE entreprises SET siren_siret='123 456 789 00012', contact_nom='M. Contact', telephone='0600', mail='contact@plombier.fr' WHERE id = (SELECT entreprise_id FROM consultations WHERE id=?)").run(cid);
  db().prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, consultation_id, auteur_id) VALUES (?, 'devis', 'd.pdf', 'd-main.pdf', 'application/pdf', 10, 800, ?, ?)")
    .run(tid, cid, ids.cs);
  await cs.req('POST', `/tickets/${tid}/consultations/${cid}/valider`);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'consultation');
  // le CS complète la date à la main (seule modification restante sur une consultation sélectionnée)
  const res = await cs.req('POST', `/tickets/${tid}/consultations/${cid}`, { date_planifiee: '2026-12-20', entreprise_id: '999' });
  assert.strictEqual(res.status, 302);
  const c = db().prepare('SELECT * FROM consultations WHERE id=?').get(cid);
  assert.strictEqual(c.date_planifiee, '2026-12-20');
  assert.notStrictEqual(c.entreprise_id, 999); // entreprise non modifiée
  assert.strictEqual((await cs.req('POST', `/tickets/${tid}/travaux-planifies`)).status, 302);
  assert.strictEqual(db().prepare('SELECT etape FROM tickets WHERE id=?').get(tid).etape, 'intervention_planifiee');
});

test('fiche ticket : boutons solliciter / travaux planifiés visibles pour le CS en consultation', async () => {
  const { cs, tid, cid } = await setupTicketConsultation();
  let page = await (await cs.req('GET', '/tickets/' + tid)).text();
  assert.ok(page.includes(`/tickets/${tid}/solliciter`)); // sollicitation globale
  assert.ok(page.includes(`/tickets/${tid}/consultations/${cid}/solliciter`)); // individuelle
  assert.ok(!page.includes(`/tickets/${tid}/travaux-planifies`)); // rien de sélectionné
  await cs.req('POST', `/tickets/${tid}/solliciter`);
  page = await (await cs.req('GET', '/tickets/' + tid)).text();
  assert.ok(page.includes('sollicitation le')); // historique affiché
  // devis déposé -> plus de bouton solliciter
  db().prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, consultation_id, auteur_id) VALUES (?, 'devis', 'd.pdf', 'd-ui.pdf', 'application/pdf', 10, 150, ?, ?)")
    .run(tid, cid, ids.cs);
  db().prepare("UPDATE entreprises SET siren_siret='1', contact_nom='c', telephone='t', mail='m@m.fr' WHERE id = (SELECT entreprise_id FROM consultations WHERE id=?)").run(cid);
  await cs.req('POST', `/tickets/${tid}/consultations/${cid}/valider`);
  page = await (await cs.req('GET', '/tickets/' + tid)).text();
  assert.ok(!page.includes(`/tickets/${tid}/consultations/${cid}/solliciter`));
  assert.ok(page.includes(`/tickets/${tid}/travaux-planifies`)); // bouton de passage
  assert.ok(page.includes('VALID'));
});
