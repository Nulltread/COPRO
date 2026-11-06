const { getDb } = require('./index');
const { hashPassword } = require('../auth');
const { categoriesTicket } = require('../droits');

function seed() {
  const db = getDb();
  const nbUnits = db.prepare('SELECT COUNT(*) AS n FROM units').get().n;
  if (nbUnits > 0) {
    console.log('Base déjà initialisée, rien à faire.');
    return;
  }

  const insUnit = db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)');
  for (let i = 1; i <= 61; i++) {
    insUnit.run('villa', i, `Villa ${i}`);
    insUnit.run('garage', i, `Garage ${i}`);
  }

  const insUser = db.prepare(
    'INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?, ?, ?, ?, ?)'
  );
  const insRes = db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, ?)');
  const mdp = hashPassword('demo1234');

  const syndic = insUser.run('syndic@copro.local', mdp, 'Syndic Pro', 'syndic', 'valide').lastInsertRowid;
  const conseil = insUser.run('conseil@copro.local', mdp, 'Marie Conseil', 'conseil', 'valide').lastInsertRowid;
  const admin = insUser.run('admin@copro.local', mdp, 'Admin Copro', 'admin', 'valide').lastInsertRowid;

  const residents = [];
  const noms = ['Dupont', 'Martin', 'Bernard', 'Petit', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Michel', 'Garcia'];
  for (let i = 1; i <= 61; i++) {
    const id = insUser.run(`resident${i}@copro.local`, mdp, `${noms[i % 10]} ${i}`, 'resident', 'valide').lastInsertRowid;
    const villa = db.prepare("SELECT id FROM units WHERE type = 'villa' AND numero = ?").get(i).id;
    insRes.run(villa, id, 'proprietaire');
    residents.push({ id, villa, numero: i });
    if (i <= 10) {
      const loc = insUser.run(`locataire${i}@copro.local`, mdp, `Locataire ${i}`, 'resident', 'valide').lastInsertRowid;
      insRes.run(villa, loc, 'locataire');
    }
  }
  const enAttente = insUser.run('attente@copro.local', mdp, 'En Attente', 'resident', 'en_attente').lastInsertRowid;
  insRes.run(db.prepare("SELECT id FROM units WHERE type = 'villa' AND numero = 1").get().id, enAttente, 'locataire');

  const cats = categoriesTicket();
  const insTicket = db.prepare(
    'INSERT INTO tickets (titre, description, categorie, etape, urgent, auteur_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insTu = db.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, ?)');
  const insEv = db.prepare('INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, ?, ?, ?)');

  const demo = [
    { titre: 'Fuite sous l\'évier de la cuisine', desc: 'Goutte à goutte depuis ce matin, le siphon fuit.', cat: 'Plomberie', etape: 'consultation', urgent: 1, auteur: residents[0].id, unites: [residents[0].villa], ev: ['Ticket déclaré (URGENT) : Fuite sous l\'évier de la cuisine', 'Passage à l\'étape « Consultation des devis »', '2 devis ajoutés'] },
    { titre: 'Volet roulant bloqué', desc: 'Le volet de la chambre ne remonte plus.', cat: 'Menuiserie', etape: 'attribution', urgent: 0, auteur: residents[4].id, unites: [residents[4].villa], ev: ['Ticket déclaré', 'Passage à « Consultation des devis »', 'Passage à « Attribution »', 'Décision enregistrée'] },
    { titre: 'Fissure sur le mur du garage', desc: 'Fissure verticale apparue après les pluies.', cat: 'Humidité / Infiltration', etape: 'planification', urgent: 0, auteur: syndic, unites: [db.prepare("SELECT id FROM units WHERE type='garage' AND numero=12").get().id], ev: ['Ticket déclaré', 'Passage à « Consultation des devis »', 'Passage à « Attribution »', 'Passage à « Planification des travaux »'] },
    { titre: 'Porte d\'entrée qui ferme mal', desc: 'La serrure accroche, il faut forcer.', cat: 'Serrurerie', etape: 'reception', urgent: 0, auteur: residents[9].id, unites: [residents[9].villa], ev: ['Ticket déclaré', 'Passage à « Consultation des devis »', 'Passage à « Attribution »', 'Passage à « Planification des travaux »', 'Passage à « Réception des travaux »'] },
    { titre: 'Infiltration plafond salon — villa 20 et 21', desc: 'Tache d\'humidité commune aux deux villas mitoyennes.', cat: 'Toiture', etape: 'declaration', urgent: 1, auteur: residents[19].id, unites: [residents[19].villa, residents[20].villa], ev: ['Ticket déclaré (URGENT) : Infiltration plafond salon'] },
    { titre: 'Chaudière en panne', desc: 'Plus d\'eau chaude depuis hier soir.', cat: 'Chauffage', etape: 'cloture', urgent: 0, auteur: residents[29].id, unites: [residents[29].villa], ev: ['Ticket déclaré', 'Passage à « Consultation des devis »', 'Passage à « Attribution »', 'Passage à « Planification des travaux »', 'Passage à « Réception des travaux »', 'Ticket clôturé — coût total enregistré'] }
  ];

  for (const d of demo) {
    const tid = insTicket.run(d.titre, d.desc, d.cat, d.etape, d.urgent, d.auteur).lastInsertRowid;
    for (const u of d.unites) insTu.run(tid, u);
    d.ev.forEach((contenu, i) => insEv.run(tid, i === 0 ? 'creation' : (contenu.includes('étape') ? 'changement_etape' : (contenu.includes('Décision') ? 'decision' : 'fichier')), d.auteur, contenu));
  }

  console.log('Jeu de données créé : 61 villas, 61 garages, comptes de démo (mot de passe : demo1234), 6 tickets.');
}

if (require.main === module) seed();
module.exports = { seed };
