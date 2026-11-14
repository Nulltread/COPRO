const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('./index');
const { hashPassword } = require('../auth');
const { UPLOAD_DIR } = require('../upload');

function seed() {
  const db = getDb();
  const nbUnits = db.prepare('SELECT COUNT(*) AS n FROM units').get().n;
  if (nbUnits > 0) {
    console.log('Base déjà initialisée, rien à faire.');
    return;
  }

  // Référentiel en dur : 61 villas, 61 garages, 1 unité de parties communes.
  const insUnit = db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)');
  for (let i = 1; i <= 61; i++) {
    insUnit.run('villa', i, `Villa ${i}`);
    insUnit.run('garage', i, `Garage ${i}`);
  }
  const communesId = insUnit.run('communes', null, 'Parties communes').lastInsertRowid;

  // Comptes de démo : email considéré comme vérifié.
  const insUser = db.prepare(
    'INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)'
  );
  const insRat = db.prepare('INSERT INTO rattachements (unit_id, user_id, qualite, statut, valide_par, valide_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insRes = db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, ?)');
  const mdp = hashPassword('demo1234');

  // Un et un seul compte admin.
  insUser.run('admin@copro.local', mdp, 'Admin', 'Admin', '0600000000', 'admin', 0, 'actif');

  // Membres du conseil syndical (statut additionnel), rattachés par défaut
  // aux parties communes.
  const cs1 = insUser.run('conseil1@copro.local', mdp, 'Martin', 'Marie', '0600000001', 'resident', 1, 'actif').lastInsertRowid;
  const cs2 = insUser.run('conseil2@copro.local', mdp, 'Durand', 'Paul', '0600000002', 'resident', 1, 'actif').lastInsertRowid;
  const ratC1 = insRat.run(communesId, cs1, 'proprietaire', 'accepte', cs1, "datetime('now')").lastInsertRowid;
  insRes.run(communesId, cs1, 'proprietaire');
  insRat.run(communesId, cs2, 'proprietaire', 'accepte', cs1, "datetime('now')");
  insRes.run(communesId, cs2, 'proprietaire');

  const residents = [];
  const noms = ['Dupont', 'Martin', 'Bernard', 'Petit', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Michel', 'Garcia'];
  for (let i = 1; i <= 61; i++) {
    const id = insUser.run(`resident${i}@copro.local`, mdp, `${noms[i % 10]}`, `Résident ${i}`, `060000${String(10 + i)}`, 'resident', 0, 'actif').lastInsertRowid;
    const villa = db.prepare('SELECT id FROM units WHERE type = \'villa\' AND numero = ?').get(i).id;
    insRat.run(villa, id, 'proprietaire', 'accepte', id, "datetime('now')");
    insRes.run(villa, id, 'proprietaire');
    residents.push({ id, villa, numero: i });
    if (i <= 10) {
      const loc = insUser.run(`locataire${i}@copro.local`, mdp, `Locataire ${i}`, `Loc ${i}`, `061000000${i}`, 'resident', 0, 'actif').lastInsertRowid;
      insRat.run(villa, loc, 'locataire', 'accepte', id, "datetime('now')");
      insRes.run(villa, loc, 'locataire');
    }
  }
  // Un résident multi-unités : résident 5 est aussi rattaché au garage 5.
  const garage5 = db.prepare("SELECT id FROM units WHERE type = 'garage' AND numero = 5").get().id;
  insRat.run(garage5, residents[4].id, 'proprietaire', 'accepte', residents[4].id, "datetime('now')");
  insRes.run(garage5, residents[4].id, 'proprietaire');
  // Un rattachement en attente de validation.
  const enAttente = insUser.run('attente@copro.local', mdp, 'Attente', 'Jean', '0600000099', 'resident', 0, 'actif').lastInsertRowid;
  insRat.run(residents[0].villa, enAttente, 'locataire', 'en_attente', null, null);

  const insTicket = db.prepare(
    'INSERT INTO tickets (titre, description, etape, urgent, auteur_id, acceptes_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insTu = db.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, ?)');
  const insEv = db.prepare('INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, ?, ?, ?)');

  // Entreprises de démo (e1 complète, e2 incomplète).
  const insEnt = db.prepare('INSERT INTO entreprises (raison_sociale, siren_siret, contact_nom, telephone, mail) VALUES (?, ?, ?, ?, ?)');
  const e1 = insEnt.run('Plomberie Martin', '123 456 789 00012', 'M. Martin', '0601020304', 'contact@plomberie-martin.fr').lastInsertRowid;
  const e2 = insEnt.run('Électricité Durand SARL', '', '', '', '').lastInsertRowid;

  // Fichiers de démo (PDF factices) pour les devis/factures.
  function fichierDemo(nom) {
    const stockage = crypto.randomBytes(8).toString('hex') + '.pdf';
    fs.writeFileSync(path.join(UPLOAD_DIR, stockage), '%PDF-1.4 demo ' + nom);
    return stockage;
  }
  const insFichier = db.prepare(
    `INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, consultation_id, auteur_id)
     VALUES (?, ?, ?, ?, 'application/pdf', 128, ?, ?, ?)`
  );
  const insConsult = db.prepare(
    'INSERT INTO consultations (ticket_id, entreprise_id, date_planifiee, validee, caduque, auteur_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insValid = db.prepare('INSERT INTO resolutions (ticket_id, user_id, commentaire, caduque) VALUES (?, ?, ?, ?)');

  const garage12 = db.prepare("SELECT id FROM units WHERE type='garage' AND numero=12").get().id;

  // 1. Fuite sous l'évier — en consultation, 2 consultations (1 complète, 1 avec entreprise incomplète).
  let tid = insTicket.run('Fuite sous l\'évier de la cuisine', 'Goutte à goutte depuis ce matin, le siphon fuit.', 'consultation', 1, residents[0].id, null).lastInsertRowid;
  insTu.run(tid, residents[0].villa);
  insEv.run(tid, 'creation', residents[0].id, 'Ticket déclaré (URGENT) : Fuite sous l\'évier de la cuisine');
  insEv.run(tid, 'changement_etape', cs1, 'Passage à l\'étape « En consultation »');
  let c1 = insConsult.run(tid, e1, '2026-11-20', 0, 0, cs1).lastInsertRowid;
  insFichier.run(tid, 'devis', 'devis-martin.pdf', fichierDemo('devis-martin'), 1450.50, c1, cs1);
  insFichier.run(tid, 'devis', 'devis-martin-2.pdf', fichierDemo('devis-martin-2'), 1620, c1, cs1);
  let c2 = insConsult.run(tid, e2, '2026-11-25', 0, 0, cs1).lastInsertRowid;
  insFichier.run(tid, 'devis', 'devis-durand.pdf', fichierDemo('devis-durand'), 1380, c2, cs1);
  insEv.run(tid, 'consultation', cs1, 'Marie a ajouté une consultation (Plomberie Martin, 2 devis, date 2026-11-20)');
  insEv.run(tid, 'consultation', cs1, 'Marie a ajouté une consultation (Électricité Durand SARL, 1 devis, date 2026-11-25)');

  // 2. Volet roulant bloqué — créé.
  tid = insTicket.run('Volet roulant bloqué', 'Le volet de la chambre ne remonte plus.', 'cree', 0, residents[4].id, null).lastInsertRowid;
  insTu.run(tid, residents[4].villa);
  insEv.run(tid, 'creation', residents[4].id, 'Ticket déclaré : Volet roulant bloqué');

  // 3. Fissure garage 12 — travaux planifiés (consultation validée).
  tid = insTicket.run('Fissure sur le mur du garage', 'Fissure verticale apparue après les pluies.', 'intervention_planifiee', 0, cs1, null).lastInsertRowid;
  insTu.run(tid, garage12);
  insEv.run(tid, 'creation', cs1, 'Ticket déclaré : Fissure sur le mur du garage');
  insEv.run(tid, 'changement_etape', cs1, 'Passage à l\'étape « En consultation »');
  c1 = insConsult.run(tid, e1, '2026-11-18', 1, 0, cs1).lastInsertRowid;
  insFichier.run(tid, 'devis', 'devis-fissure.pdf', fichierDemo('devis-fissure'), 890, c1, cs1);
  insEv.run(tid, 'changement_etape', cs1, 'Consultation validée (Plomberie Martin, date 2026-11-18) — travaux planifiés');

  // 4. Porte d'entrée — travaux acceptés (validé par le résident, facture jointe, il y a 10 jours).
  tid = insTicket.run('Porte d\'entrée qui ferme mal', 'La serrure accroche, il faut forcer.', 'travaux_acceptes', 0, residents[9].id, null).lastInsertRowid;
  db.prepare("UPDATE tickets SET acceptes_at = datetime('now', '-10 days') WHERE id = ?").run(tid);
  insTu.run(tid, residents[9].villa);
  insEv.run(tid, 'creation', residents[9].id, 'Ticket déclaré : Porte d\'entrée qui ferme mal');
  insEv.run(tid, 'changement_etape', cs1, 'Passage à l\'étape « En consultation »');
  c1 = insConsult.run(tid, e1, '2026-11-05', 1, 0, cs1).lastInsertRowid;
  insFichier.run(tid, 'devis', 'devis-porte.pdf', fichierDemo('devis-porte'), 640, c1, cs1);
  insEv.run(tid, 'changement_etape', cs1, 'Consultation validée (Plomberie Martin, date 2026-11-05) — travaux planifiés');
  insValid.run(tid, residents[9].id, 'Travaux faits proprement, merci.', 0);
  insEv.run(tid, 'resolution', residents[9].id, 'Résident 10 a validé les travaux — « Travaux faits proprement, merci. »');
  insEv.run(tid, 'changement_etape', residents[9].id, 'Tous les concernés ont validé — passage à « Travaux acceptés »');
  insFichier.run(tid, 'facture', 'facture-porte.pdf', fichierDemo('facture-porte'), 640, null, cs1);
  insEv.run(tid, 'fichier', cs1, 'Marie a ajouté une facture (640.00 €)');

  // 5. Infiltration villa 20 et 21 — créé, urgent.
  tid = insTicket.run('Infiltration plafond salon — villa 20 et 21', 'Tache d\'humidité commune aux deux villas mitoyennes.', 'cree', 1, residents[19].id, null).lastInsertRowid;
  insTu.run(tid, residents[19].villa);
  insTu.run(tid, residents[20].villa);
  insEv.run(tid, 'creation', residents[19].id, 'Ticket déclaré (URGENT) : Infiltration plafond salon');

  // 6. Éclairage parties communes — archivé (avec facture).
  tid = insTicket.run('Éclairage des parties communes en panne', 'Le couloir d\'accès principal n\'est plus éclairé le soir.', 'archive', 0, cs1, null).lastInsertRowid;
  db.prepare("UPDATE tickets SET acceptes_at = datetime('now', '-40 days') WHERE id = ?").run(tid);
  insTu.run(tid, communesId);
  insEv.run(tid, 'creation', cs1, 'Ticket déclaré : Éclairage des parties communes en panne');
  insEv.run(tid, 'changement_etape', cs1, 'Passage à l\'étape « En consultation »');
  c1 = insConsult.run(tid, e2, '2026-09-01', 1, 0, cs1).lastInsertRowid;
  insFichier.run(tid, 'devis', 'devis-eclairage.pdf', fichierDemo('devis-eclairage'), 1120, c1, cs1);
  insEv.run(tid, 'changement_etape', cs1, 'Consultation validée (Électricité Durand SARL, date 2026-09-01) — travaux planifiés');
  insValid.run(tid, cs1, '', 0);
  insEv.run(tid, 'changement_etape', cs1, 'Tous les concernés ont validé — passage à « Travaux acceptés »');
  insFichier.run(tid, 'facture', 'facture-eclairage.pdf', fichierDemo('facture-eclairage'), 1095.20, null, cs1);
  insEv.run(tid, 'changement_etape', cs1, 'Ticket archivé manuellement');

  // 7. Chaudière en panne — créé.
  tid = insTicket.run('Chaudière en panne', 'Plus d\'eau chaude depuis hier soir.', 'cree', 0, residents[29].id, null).lastInsertRowid;
  insTu.run(tid, residents[29].villa);
  insEv.run(tid, 'creation', residents[29].id, 'Ticket déclaré : Chaudière en panne');

  console.log('Jeu de données créé : 61 villas, 61 garages, parties communes, 1 compte admin, 2 membres CS, entreprises, comptes de démo (mot de passe : demo1234), 7 tickets à différents stades.');
}

if (require.main === module) seed();
module.exports = { seed };
