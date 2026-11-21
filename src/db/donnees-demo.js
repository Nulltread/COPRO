const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('./index');
const { UPLOAD_DIR } = require('../upload');

const PREFIXE = '[Démo]';

function dateDans(jours) {
  const d = new Date(Date.now() + jours * 86400000);
  return d.toISOString().slice(0, 10);
}

function entrepriseDemo(db, raison, siren, contact, tel, mail) {
  const exist = db.prepare('SELECT id FROM entreprises WHERE raison_sociale = ?').get(raison);
  if (exist) return exist.id;
  return db.prepare('INSERT INTO entreprises (raison_sociale, siren_siret, contact_nom, telephone, mail) VALUES (?, ?, ?, ?, ?)')
    .run(raison, siren, contact, tel, mail).lastInsertRowid;
}

function fichierDemoPdf(db, ticketId, categorie, nomOriginal, montant, consultationId, auteurId) {
  const stockage = crypto.randomBytes(8).toString('hex') + '.pdf';
  fs.writeFileSync(path.join(UPLOAD_DIR, stockage), '%PDF-1.4 demo ' + nomOriginal);
  db.prepare(
    `INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, consultation_id, auteur_id)
     VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, ?, ?)`
  ).run(ticketId, categorie, nomOriginal, stockage, 128, montant, consultationId, auteurId);
}

function auteurAvecUnites(db, email) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user) return null;
  const unites = db.prepare(
    `SELECT u.id, u.type, u.numero FROM unit_residents ur JOIN units u ON u.id = ur.unit_id WHERE ur.user_id = ? ORDER BY u.type, u.numero`
  ).all(user.id);
  const pick = (type) => (unites.find(u => u.type === type) || unites[0] || null);
  return { user, villa: pick('villa'), garage: pick('garage'), communes: pick('communes') };
}

function creerTicket(db, { titre, description, etape, urgent, auteurId, unitId, events }) {
  const existe = db.prepare('SELECT id FROM tickets WHERE titre = ?').get(titre);
  if (existe) return null;
  const tid = db.prepare(
    'INSERT INTO tickets (titre, description, etape, urgent, auteur_id, acceptes_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(titre, description, etape, urgent ? 1 : 0, auteurId, etape === 'travaux_acceptes' ? dateDans(-5) : null).lastInsertRowid;
  db.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, ?)').run(tid, unitId);
  const insEv = db.prepare('INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, ?, ?, ?)');
  for (const [type, auteur, contenu] of events) insEv.run(tid, type, auteur, contenu);
  return tid;
}

function creerDonneesDemo(options = {}) {
  const db = getDb();
  const emails = options.auteurs && options.auteurs.length
    ? options.auteurs
    : db.prepare('SELECT email FROM users WHERE conseil_syndical = 1 AND statut = \'actif\'').all().map(r => r.email);
  if (!emails.length) throw new Error('Aucun membre du conseil syndical : provisionnez d\'abord les comptes.');
  const auteurs = emails.map(e => auteurAvecUnites(db, e)).filter(Boolean);
  if (!auteurs.length) throw new Error('Aucune unité trouvée pour les auteurs indiqués.');

  const a1 = auteurs[0];
  const a2 = auteurs[1] || auteurs[0];
  const e1 = entrepriseDemo(db, 'Plomberie Martin', '123 456 789 00012', 'M. Martin', '0601020304', 'contact@plomberie-martin.fr');
  const e2 = entrepriseDemo(db, 'Électricité Durand SARL', '987 654 321 00034', 'Mme Durand', '0605060708', 'contact@elec-durand.fr');

  const insConsult = db.prepare(
    'INSERT INTO consultations (ticket_id, entreprise_id, date_planifiee, validee, caduque, auteur_id) VALUES (?, ?, ?, ?, 0, ?)'
  );
  const insDate = db.prepare(
    'INSERT INTO consultation_dates (consultation_id, date, heure, propose_par, validee, valide_par) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insRes = db.prepare('INSERT INTO resolutions (ticket_id, user_id, commentaire, caduque) VALUES (?, ?, ?, 0)');

  const deja = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE titre LIKE ?').get(PREFIXE + '%').n;

  db.transaction(() => {
    const t1 = creerTicket(db, {
      titre: `${PREFIXE} Fuite sous l'évier de la cuisine`,
      description: 'Goutte à goutte depuis ce matin, le siphon sous l\'évier fuit. Un bac est posé en attendant.',
      etape: 'consultation', urgent: true, auteurId: a1.user.id, unitId: a1.villa.id,
      events: [
        ['creation', a1.user.id, `Ticket déclaré (URGENT) : ${PREFIXE} Fuite sous l'évier de la cuisine`],
        ['changement_etape', a1.user.id, 'Passage à l\'étape « En consultation »']
      ]
    });
    if (t1) {
      const c1 = insConsult.run(t1, e1, dateDans(10), 0, a1.user.id).lastInsertRowid;
      fichierDemoPdf(db, t1, 'devis', 'devis-plomberie-martin.pdf', 1450.50, c1, a1.user.id);
      fichierDemoPdf(db, t1, 'devis', 'devis-plomberie-martin-v2.pdf', 1620.00, c1, a1.user.id);
      const c2 = insConsult.run(t1, e2, null, 0, a1.user.id).lastInsertRowid;
      fichierDemoPdf(db, t1, 'devis', 'devis-elec-durand.pdf', 1380.00, c2, a1.user.id);
      insDate.run(c2, dateDans(12), '09:00', 'prestataire', 1, a1.user.id);
      db.prepare('INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, ?, ?, ?)')
        .run(t1, 'consultation', a1.user.id, 'Consultation ajoutée (Plomberie Martin, 2 devis, date prévue le ' + dateDans(10) + ')');
      db.prepare('INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, ?, ?, ?)')
        .run(t1, 'consultation', a1.user.id, 'Consultation ajoutée (Électricité Durand SARL, 1 devis, date proposée le ' + dateDans(12) + ')');
    }

    creerTicket(db, {
      titre: `${PREFIXE} Volet roulant bloqué`,
      description: 'Le volet de la chambre ne remonte plus depuis hier, il est bloqué à mi-hauteur.',
      etape: 'cree', urgent: false, auteurId: a2.user.id, unitId: a2.villa.id,
      events: [['creation', a2.user.id, `Ticket déclaré : ${PREFIXE} Volet roulant bloqué`]]
    });

    const t3unit = a1.garage && a1.garage.type === 'garage' ? a1.garage : (a1.communes || a1.villa);
    const t3 = creerTicket(db, {
      titre: `${PREFIXE} Fissure sur le mur du ${t3unit.type === 'garage' ? 'garage' : 'bâtiment'}`,
      description: 'Fissure verticale apparue après les dernières pluies, environ 40 cm de long.',
      etape: 'intervention_planifiee', urgent: false, auteurId: a1.user.id, unitId: t3unit.id,
      events: [
        ['creation', a1.user.id, `Ticket déclaré : ${PREFIXE} Fissure`],
        ['changement_etape', a1.user.id, 'Passage à l\'étape « En consultation »'],
        ['changement_etape', a1.user.id, 'Consultation validée (Plomberie Martin) — travaux planifiés le ' + dateDans(8)]
      ]
    });
    if (t3) {
      const c = insConsult.run(t3, e1, dateDans(8), 1, a1.user.id).lastInsertRowid;
      fichierDemoPdf(db, t3, 'devis', 'devis-fissure.pdf', 890.00, c, a1.user.id);
    }

    const t4unit = a2.communes && a2.communes.type === 'communes' ? a2.communes : a2.villa;
    const t4 = creerTicket(db, {
      titre: `${PREFIXE} Portail électrique qui ne ferme plus`,
      description: 'Le portail coulissant s\'arrête à mi-course depuis la semaine dernière.',
      etape: 'travaux_acceptes', urgent: false, auteurId: a2.user.id, unitId: t4unit.id,
      events: [
        ['creation', a2.user.id, `Ticket déclaré : ${PREFIXE} Portail électrique`],
        ['changement_etape', a2.user.id, 'Passage à l\'étape « En consultation »'],
        ['changement_etape', a2.user.id, 'Travaux planifiés le ' + dateDans(-2)],
        ['changement_etape', a2.user.id, 'Passage à l\'étape « Travaux acceptés »']
      ]
    });
    if (t4) {
      const c = insConsult.run(t4, e2, dateDans(-2), 1, a2.user.id).lastInsertRowid;
      fichierDemoPdf(db, t4, 'devis', 'devis-portail.pdf', 640.00, c, a2.user.id);
      insRes.run(t4, a2.user.id, 'Travaux réalisés dans les règles, portail de nouveau fonctionnel.');
    }

    creerTicket(db, {
      titre: `${PREFIXE} Traces d'humidité au plafond du salon`,
      description: 'Taches jaunâtres apparues au plafond près de la fenêtre, à surveiller.',
      etape: 'archive', urgent: false, auteurId: a1.user.id, unitId: a1.villa.id,
      events: [
        ['creation', a1.user.id, `Ticket déclaré : ${PREFIXE} Traces d'humidité`],
        ['changement_etape', a1.user.id, 'Passage à l\'étape « En consultation »'],
        ['changement_etape', a1.user.id, 'Travaux planifiés'],
        ['changement_etape', a1.user.id, 'Passage à l\'étape « Travaux acceptés »'],
        ['changement_etape', a1.user.id, 'Ticket archivé']
      ]
    });
  })();

  const nb = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE titre LIKE ?').get(PREFIXE + '%').n;
  return { dejaPresents: deja, total: nb };
}

function supprimerDonneesDemo() {
  const db = getDb();
  const fichiers = db.prepare("SELECT nom_stockage FROM fichiers WHERE ticket_id IN (SELECT id FROM tickets WHERE titre LIKE ?)").all(PREFIXE + '%');
  const n = db.prepare("DELETE FROM tickets WHERE titre LIKE ?").run(PREFIXE + '%').changes;
  for (const f of fichiers) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, f.nom_stockage)); } catch {}
  }
  return n;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--reset')) {
    const n = supprimerDonneesDemo();
    console.log(`${n} ticket(s) de démo supprimé(s) (fichiers inclus).`);
    return;
  }
  let auteurs = null;
  const i = args.indexOf('--auteurs');
  if (i !== -1 && args[i + 1]) auteurs = args[i + 1].split(',').map(s => s.trim()).filter(Boolean);
  const r = creerDonneesDemo({ auteurs });
  console.log(`Données de démo : ${r.total} ticket(s) marqués « ${PREFIXE} » (${r.dejaPresents} déjà présents avant).`);
  console.log('Pour tout retirer : node src/db/donnees-demo.js --reset');
}

if (require.main === module) main();

module.exports = { creerDonneesDemo, supprimerDonneesDemo, PREFIXE };
