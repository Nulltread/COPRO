const { getDb } = require('./index');
const { hashPassword } = require('../auth');

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

  const insUser = db.prepare(
    'INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
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
    'INSERT INTO tickets (titre, description, etape, etape_avant_consultation, urgent, auteur_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insTu = db.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, ?)');
  const insEv = db.prepare('INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, ?, ?, ?)');

  const garage12 = db.prepare("SELECT id FROM units WHERE type='garage' AND numero=12").get().id;
  const demo = [
    { titre: 'Fuite sous l\'évier de la cuisine', desc: 'Goutte à goutte depuis ce matin, le siphon fuit.', etape: 'consultation', av: 'valide_cs', urgent: 1, auteur: residents[0].id, unites: [residents[0].villa], ev: ['Ticket déclaré (URGENT) : Fuite sous l\'évier de la cuisine', 'Passage à l\'étape « Validé par le conseil syndical »', 'Passage à l\'étape « En consultation »', '2 devis ajoutés'] },
    { titre: 'Volet roulant bloqué', desc: 'Le volet de la chambre ne remonte plus.', etape: 'valide_cs', av: 'valide_cs', urgent: 0, auteur: residents[4].id, unites: [residents[4].villa], ev: ['Ticket déclaré', 'Passage à l\'étape « Validé par le conseil syndical »'] },
    { titre: 'Fissure sur le mur du garage', desc: 'Fissure verticale apparue après les pluies.', etape: 'intervention_planifiee', av: 'valide_cs', urgent: 0, auteur: cs1, unites: [garage12], ev: ['Ticket déclaré', 'Passage à « Validé par le conseil syndical »', 'Passage à « En consultation »', 'Décision enregistrée', 'Passage à « Intervention planifiée »'] },
    { titre: 'Porte d\'entrée qui ferme mal', desc: 'La serrure accroche, il faut forcer.', etape: 'travaux_acceptes', av: 'valide_cs', urgent: 0, auteur: residents[9].id, unites: [residents[9].villa], ev: ['Ticket déclaré', 'Passage à « Validé par le conseil syndical »', 'Passage à « En consultation »', 'Passage à « Intervention planifiée »', 'Passage à « Travaux acceptés »'] },
    { titre: 'Infiltration plafond salon — villa 20 et 21', desc: 'Tache d\'humidité commune aux deux villas mitoyennes.', etape: 'cree', av: 'valide_cs', urgent: 1, auteur: residents[19].id, unites: [residents[19].villa, residents[20].villa], ev: ['Ticket déclaré (URGENT) : Infiltration plafond salon'] },
    { titre: 'Éclairage des parties communes en panne', desc: 'Le couloir d\'accès principal n\'est plus éclairé le soir.', etape: 'archive', av: 'valide_cs', urgent: 0, auteur: cs1, unites: [communesId], ev: ['Ticket déclaré', 'Passage à « Validé par le conseil syndical »', 'Passage à « En consultation »', 'Passage à « Intervention planifiée »', 'Passage à « Travaux acceptés »', 'Résolution acceptée — ticket archivé'] },
    { titre: 'Chaudière en panne', desc: 'Plus d\'eau chaude depuis hier soir.', etape: 'cree', av: 'valide_cs', urgent: 0, auteur: residents[29].id, unites: [residents[29].villa], ev: ['Ticket déclaré'] }
  ];

  for (const d of demo) {
    const tid = insTicket.run(d.titre, d.desc, d.etape, d.av, d.urgent, d.auteur).lastInsertRowid;
    for (const u of d.unites) insTu.run(tid, u);
    d.ev.forEach((contenu, i) => insEv.run(tid, i === 0 ? 'creation' : (contenu.includes('étape') || contenu.includes('archivé') ? 'changement_etape' : (contenu.includes('Décision') ? 'decision' : 'fichier')), d.auteur, contenu));
  }

  console.log('Jeu de données créé : 61 villas, 61 garages, parties communes, 1 compte admin, 2 membres CS, comptes de démo (mot de passe : demo1234), 7 tickets à différents stades.');
}

if (require.main === module) seed();
module.exports = { seed };
