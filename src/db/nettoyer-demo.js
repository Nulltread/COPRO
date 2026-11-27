const fs = require('fs');
const path = require('path');
const { getDb } = require('./index');
const { UPLOAD_DIR } = require('../upload');
const { PREFIXE } = require('./donnees-demo');

function nettoyerDemo(options = {}) {
  const db = getDb();
  const tout = !!options.tout;

  const demoUsers = db.prepare("SELECT id FROM users WHERE email LIKE '%@copro.local'").all().map(r => r.id);
  const inDemo = demoUsers.length ? demoUsers.map(() => '?').join(', ') : null;

  let ticketIds;
  if (tout) {
    ticketIds = db.prepare('SELECT id FROM tickets').all().map(r => r.id);
  } else {
    ticketIds = db.prepare(
      `SELECT id FROM tickets WHERE titre LIKE ? ${inDemo ? `OR auteur_id IN (${inDemo})` : ''}`
    ).all(PREFIXE + '%', ...demoUsers).map(r => r.id);
  }
  const inT = ticketIds.length ? ticketIds.map(() => '?').join(', ') : null;

  const fichiers = db.prepare(
    `SELECT nom_stockage FROM fichiers WHERE ${inT ? `ticket_id IN (${inT})` : '0'} ${inDemo ? `${inT ? 'OR' : ''} auteur_id IN (${inDemo})` : ''}`
  ).all(...ticketIds, ...demoUsers).map(r => r.nom_stockage);
  const docsDisk = inDemo
    ? db.prepare(`SELECT nom_stockage FROM documents WHERE auteur_id IN (${inDemo})`).all(...demoUsers).map(r => r.nom_stockage)
    : [];

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' AND (email IS NULL OR email NOT LIKE '%@copro.local')").get();

  db.transaction(() => {
    if (inDemo) {
      if (inT) db.prepare(`DELETE FROM tickets WHERE id IN (${inT})`).run(...ticketIds);
      db.prepare(`DELETE FROM fichiers WHERE auteur_id IN (${inDemo})`).run(...demoUsers);
      db.prepare(`DELETE FROM documents WHERE auteur_id IN (${inDemo})`).run(...demoUsers);
      db.prepare(`DELETE FROM comptes_rendus WHERE auteur_id IN (${inDemo})`).run(...demoUsers);
      db.prepare(`UPDATE ticket_events SET auteur_id = NULL WHERE auteur_id IN (${inDemo})`).run(...demoUsers);
      db.prepare(`UPDATE sollicitations SET auteur_id = NULL WHERE auteur_id IN (${inDemo})`).run(...demoUsers);
      db.prepare(`UPDATE consultation_dates SET valide_par = NULL WHERE valide_par IN (${inDemo})`).run(...demoUsers);
      if (admin) db.prepare(`UPDATE consultations SET auteur_id = ? WHERE auteur_id IN (${inDemo})`).run(admin.id, ...demoUsers);
      db.prepare(`UPDATE rattachements SET valide_par = NULL WHERE valide_par IN (${inDemo})`).run(...demoUsers);
      db.prepare(`DELETE FROM lot_units WHERE demande_par IN (${inDemo}) OR valide_par IN (${inDemo})`).run(...demoUsers, ...demoUsers);
      db.prepare(`UPDATE lot_events SET auteur_id = NULL WHERE auteur_id IN (${inDemo})`).run(...demoUsers);
      db.prepare(`UPDATE lots SET user_id = NULL WHERE user_id IN (${inDemo})`).run(...demoUsers);
      db.prepare(`DELETE FROM users WHERE id IN (${inDemo})`).run(...demoUsers);
    } else if (inT) {
      db.prepare(`DELETE FROM tickets WHERE id IN (${inT})`).run(...ticketIds);
    }
    db.prepare('DELETE FROM entreprises WHERE id NOT IN (SELECT entreprise_id FROM consultations)').run();
  })();

  for (const nom of fichiers.concat(docsDisk)) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, nom)); } catch {}
  }

  return {
    comptesSupprimes: demoUsers.length,
    ticketsSupprimes: ticketIds.length,
    fichiersSupprimes: fichiers.length + docsDisk.length,
    ticketsRestants: db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n,
    comptesRestants: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    unites: db.prepare('SELECT COUNT(*) AS n FROM units').get().n
  };
}

function main() {
  const tout = process.argv.includes('--tout');
  const r = nettoyerDemo({ tout });
  console.log(`Nettoyage effectué : ${r.comptesSupprimes} compte(s) de démo supprimé(s), ${r.ticketsSupprimes} ticket(s), ${r.fichiersSupprimes} fichier(s) (disque).`);
  console.log(`Il reste : ${r.comptesRestants} compte(s), ${r.ticketsRestants} ticket(s), ${r.unites} unités (référentiel inchangé).`);
  if (r.ticketsRestants > 0) console.log('Tickets restants : ceux des comptes réels — relancer avec --tout pour tout vider avant la mise en prod.');
}

if (require.main === module) main();

module.exports = { nettoyerDemo };
