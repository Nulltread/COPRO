const fs = require('fs');
const path = require('path');
const { getDb } = require('./index');
const { hashPassword } = require('../auth');
const { UPLOAD_DIR } = require('../upload');

const MDP_TEST = 'demo1234';
const EMAILS = ['test-cs@copro.local', 'test-resident@copro.local'];

function creerComptesTest() {
  const db = getDb();
  const mdp = hashPassword(MDP_TEST);
  const insUser = db.prepare(
    'INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insRat = db.prepare('INSERT INTO rattachements (unit_id, user_id, qualite, statut, valide_par, valide_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insRes = db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, ?)');
  const findUser = db.prepare('SELECT id FROM users WHERE email = ?');

  const communes = db.prepare("SELECT id FROM units WHERE type = 'communes'").get();
  const villa1 = db.prepare("SELECT id FROM units WHERE type = 'villa' AND numero = 1").get();
  if (!communes || !villa1) {
    console.error('Référentiel incomplet : exécutez d\'abord `npm run seed`.');
    process.exit(1);
  }

  const cs = findUser.get('test-cs@copro.local');
  let csId;
  if (cs) {
    console.log('Compte test-cs@copro.local déjà présent.');
    csId = cs.id;
  } else {
    csId = insUser.run('test-cs@copro.local', mdp, 'Test', 'Conseil syndical', '0600000100', 'resident', 1, 'actif').lastInsertRowid;
    insRat.run(communes.id, csId, 'proprietaire', 'accepte', csId, "datetime('now')");
    insRes.run(communes.id, csId, 'proprietaire');
    console.log('Compte créé : test-cs@copro.local (membre du conseil syndical, parties communes)');
  }

  const res = findUser.get('test-resident@copro.local');
  if (res) {
    console.log('Compte test-resident@copro.local déjà présent.');
  } else {
    const resId = insUser.run('test-resident@copro.local', mdp, 'Test', 'Résident', '0600000101', 'resident', 0, 'actif').lastInsertRowid;
    insRat.run(villa1.id, resId, 'proprietaire', 'accepte', csId, "datetime('now')");
    insRes.run(villa1.id, resId, 'proprietaire');
    console.log('Compte créé : test-resident@copro.local (propriétaire, villa 1)');
  }
  console.log(`Mot de passe des deux comptes : ${MDP_TEST}`);
}

function supprimerComptesTest() {
  const db = getDb();
  const comptes = db.prepare('SELECT id FROM users WHERE email IN (?, ?)').all(...EMAILS);
  if (comptes.length === 0) {
    console.log('Aucun compte de test à supprimer.');
    return;
  }
  const ids = comptes.map(c => c.id);
  const inList = ids.map(() => '?').join(', ');

  const tickets = db.prepare(`SELECT id FROM tickets WHERE auteur_id IN (${inList})`).all(...ids);
  const ticketIds = tickets.map(t => t.id);
  const inTickets = ticketIds.length ? ticketIds.map(() => '?').join(', ') : null;
  const fichiers = db.prepare(
    `SELECT nom_stockage FROM fichiers WHERE auteur_id IN (${inList}) ${inTickets ? `OR ticket_id IN (${inTickets})` : ''}`
  ).all(...ids, ...ticketIds);

  db.transaction(() => {
    db.prepare(`UPDATE rattachements SET valide_par = NULL WHERE valide_par IN (${inList})`).run(...ids);
    db.prepare(`DELETE FROM rattachements WHERE user_id IN (${inList})`).run(...ids);
    db.prepare(`DELETE FROM unit_residents WHERE user_id IN (${inList})`).run(...ids);
    db.prepare(`DELETE FROM sessions WHERE user_id IN (${inList})`).run(...ids);
    db.prepare(`DELETE FROM notifications WHERE user_id IN (${inList})`).run(...ids);
    db.prepare(`DELETE FROM ticket_events WHERE auteur_id IN (${inList})`).run(...ids);
    db.prepare(`DELETE FROM comptes_rendus WHERE auteur_id IN (${inList})`).run(...ids);
    db.prepare(`DELETE FROM fichiers WHERE auteur_id IN (${inList})`).run(...ids);
    if (inTickets) db.prepare(`DELETE FROM tickets WHERE id IN (${inTickets})`).run(...ticketIds);
    db.prepare(`DELETE FROM users WHERE id IN (${inList})`).run(...ids);
  })();

  for (const f of fichiers) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, f.nom_stockage)); } catch {}
  }
  console.log(`Comptes de test supprimés (${ids.length} compte(s), ${tickets.length} ticket(s) de test) : ${EMAILS.join(', ')}`);
}

const commande = process.argv[2];
if (commande === 'creer') creerComptesTest();
else if (commande === 'supprimer') supprimerComptesTest();
else {
  console.log('Usage : node src/db/comptes-test.js [creer|supprimer]');
  process.exit(1);
}

module.exports = { creerComptesTest, supprimerComptesTest };
