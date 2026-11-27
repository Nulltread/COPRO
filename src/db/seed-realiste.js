const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('./index');
const { UPLOAD_DIR } = require('../upload');
const { creerReferentielSiVide } = require('./provisionner-comptes');

const ENTREPRISES = [
  { raison_sociale: 'SIEMP-AVEPA', siren_siret: '', contact_nom: 'SIEMP-AVEPA', telephone: '', mail: 'contact@siemp-avepa.com' },
  { raison_sociale: 'ETANCH & MAT', siren_siret: '', contact_nom: 'L. Gogolewski', telephone: '0652152565', mail: 'l.gogolewski@etanchetmat.fr' },
  { raison_sociale: 'FRED ETANCHEITE (Frédéric MILLE SARL)', siren_siret: '', contact_nom: 'Frédéric Mille', telephone: '', mail: 'fredetanche@orange.fr' },
  { raison_sociale: 'COTE SUD NETTOYAGE', siren_siret: '', contact_nom: 'Frank Sedru', telephone: '', mail: 'contact@cotesudnettoyage.fr' },
  { raison_sociale: 'PROVENCE NUISIBLES', siren_siret: '', contact_nom: '', telephone: '', mail: '' },
  { raison_sociale: 'PACA RENOVATION', siren_siret: '', contact_nom: '', telephone: '', mail: '' },
  { raison_sociale: 'PEB (M. Peirera)', siren_siret: '', contact_nom: 'M. Peirera', telephone: '', mail: 'commercial.peb@hotmail.com' },
  { raison_sociale: 'ARPEGE ARCHITECTEURE', siren_siret: '', contact_nom: 'Maud Perignon', telephone: '', mail: '' },
  { raison_sociale: 'GRDF', siren_siret: '', contact_nom: '', telephone: '', mail: '' }
];

const TICKETS = [
  {
    titre: 'Fuite de gaz en partie commune — coupure GRDF (Mme Llorca sans chauffage ni eau chaude)',
    description: "GRDF a coupé le gaz le 16/10/2026 : fuite sur le tuyau encastré avant la vanne d'arrivée du gaz du logement de Mme Llorca (le tuyau descend dans la façade et est enterré jusqu'au sol). Devis urgent demandé ; validé par le CS (Blauvac, Collas, Paletti, Delavallee, Piron).",
    etape: 'consultation', urgent: 1, auteur: 'soniallorca75@gmail.com', unites: [{ type: 'communes' }],
    events: [['creation', null, 'Ticket déclaré (URGENT) : Fuite de gaz en partie commune'], ['changement_etape', null, "Passage à l'étape « En consultation »"], ['consultation', null, 'Devis urgent demandé à GRDF/plombier — en attente']]
  },
  {
    titre: 'Regard eaux usées bouché — garages côté sud (récurrent)',
    description: "Le regard EU est encore bouché par des lingettes, provoquant une nouvelle fuite. Ordre de service BDCE269797 envoyé à SIEMP-AVEPA le 26/11/2026. Localisation : garages côté sud. Problème récurrent depuis plusieurs mois.",
    etape: 'cree', urgent: 1, auteur: 'sebastien.paletti@gmail.com', unites: [{ type: 'garage', numero: 43 }, { type: 'communes' }],
    events: [['creation', null, 'Ticket déclaré (URGENT) : Regard EU bouché — garages côté sud']]
  },
  {
    titre: "Dégâts des eaux — terrasse à l'entrée du logement (villa 10)",
    description: "Deux fuites distinctes dans le salon : l'une vient de ma terrasse à l'entrée du logement, en bordure de la chambre de ma fille. ETANCH & MAT contacté pour la recherche de fuite. Déclaré le 26/11/2026.",
    etape: 'consultation', urgent: 0, auteur: 'sebastien.paletti@gmail.com', unites: [{ type: 'villa', numero: 10 }],
    events: [['creation', null, 'Ticket déclaré : Dégâts des eaux — terrasse entrée villa 10'], ['changement_etape', null, "Passage à l'étape « En consultation »"]],
    consultations: [{ entreprise: 'ETANCH & MAT', montant: 890.00, date: null, validee: 0 }]
  },
  {
    titre: 'Infiltrations — terrasse appartement 42 (terrasse Borghesi au-dessus de chez Casoni)',
    description: "Recherche de fuite longue (depuis juin 2026, conciliateur de justice saisi en juin). Tests d'étanchéité le 21/07/2026 : 2 défauts relevés de la garantie décennale. Devis FRED ETANCHEITE validé par le CS ; intervention prévue jeudi 17/12/2026 matin (8h–12h, 2 à 3 h).",
    etape: 'intervention_planifiee', urgent: 0, auteur: 'prele.collas@laposte.net', unites: [{ type: 'villa', numero: 42 }],
    events: [['creation', null, 'Ticket déclaré : Infiltrations terrasse appartement 42'], ['changement_etape', null, "Passage à l'étape « En consultation »"], ['changement_etape', null, 'Consultation validée (FRED ETANCHEITE) — travaux planifiés le 17/12/2026 matin']],
    consultations: [{ entreprise: 'FRED ETANCHEITE (Frédéric MILLE SARL)', montant: 2135.05, date: '2026-12-17', validee: 1 }]
  },
  {
    titre: "Réparation façade Etanch'Mat — résultat non concluant, à refaire",
    description: "La réparation d'EtanchetMat d'octobre 2026 ne sert à rien : le voisin du dessous a toujours des infiltrations. Chez M. Malidas, ils ont posé du joint de salle de bain. Nouvelle consultation nécessaire avec un autre prestataire.",
    etape: 'consultation', urgent: 0, auteur: 'olivier.blauvac@gmail.com', unites: [{ type: 'communes' }],
    events: [['creation', null, 'Ticket déclaré : Réparation façade non concluante'], ['changement_etape', null, "Passage à l'étape « En consultation »"]],
    consultations: [{ entreprise: 'ETANCH & MAT', montant: 1340.90, date: null, validee: 0 }]
  },
  {
    titre: 'Devis cantonnage et local poubelles — parties communes (DEV262957)',
    description: "Entretien des parties communes et local poubelles : 3 devis demandés (dont COTE SUD NETTOYAGE à 576 €/mois). Point ouvert : local avec WC pour stocker le matériel de nettoyage. Les jardiniers étant défaillants sur le cantonnage, un devis taille/jardinage séparé est prévu.",
    etape: 'consultation', urgent: 0, auteur: 'sebastien.paletti@gmail.com', unites: [{ type: 'communes' }],
    events: [['creation', null, 'Ticket déclaré : Cantonnage et local poubelles'], ['changement_etape', null, "Passage à l'étape « En consultation »"]],
    consultations: [
      { entreprise: 'COTE SUD NETTOYAGE', montant: 6912.00, date: null, validee: 0 },
      { entreprise: 'PROVENCE NUISIBLES', montant: 7400.00, date: null, validee: 0 }
    ]
  },
  {
    titre: 'Dératisation des parties communes — Provence Nuisibles',
    description: "Traitement contre les rongeurs par PROVENCE NUISIBLES : interventions du 01/07/2026 et du 12/11/2026 en fin de matinée. Travaux réalisés et acceptés par le CS.",
    etape: 'travaux_acceptes', urgent: 0, auteur: 'yohkun@gmail.com', unites: [{ type: 'communes' }],
    events: [['creation', null, 'Ticket déclaré : Dératisation parties communes'], ['changement_etape', null, "Passage à l'étape « En consultation »"], ['changement_etape', null, 'Travaux planifiés (Provence Nuisibles, 12/11/2026)'], ['changement_etape', null, "Passage à l'étape « Travaux acceptés »"]],
    resolutions: [{ auteur: 'yohkun@gmail.com', commentaire: 'Traitements effectués, plus aucun rongeur constaté depuis.' }]
  },
  {
    titre: 'Trous à reboucher sur la chaussée de la résidence',
    description: "Plusieurs trous sur la chaussée (accès véhicules). Devis DEV262974 demandé à M. Peirera (PEB).",
    etape: 'cree', urgent: 0, auteur: 'yves.brunel0073@orange.fr', unites: [{ type: 'communes' }],
    events: [['creation', null, 'Ticket déclaré : Trous à reboucher sur la chaussée']]
  },
  {
    titre: 'Fuite en toiture de la dépendance (M. Casoni) — sinistre DAB Generali',
    description: "Fuite sur la toiture de la dépendance extérieure du logement de M. Casoni, sinistre déclaré à l'assurance habitation (Generali, dossier DAB). Travaux réalisés par PACA RENOVATION. Dossier clôturé.",
    etape: 'archive', urgent: 0, auteur: 'julien.debastiani@erilia.fr', unites: [{ type: 'communes' }],
    events: [['creation', null, 'Ticket déclaré : Fuite toiture dépendance Casoni'], ['changement_etape', null, "Passage à l'étape « En consultation »"], ['changement_etape', null, 'Travaux planifiés (PACA RENOVATION)'], ['changement_etape', null, "Passage à l'étape « Travaux acceptés »"], ['changement_etape', null, 'Ticket archivé']]
  },
  {
    titre: "3 factures SIEMP-AVEPA — réseau EU chez Mme Clayes (total 1 918,13 €)",
    description: "3 factures de la société AVEPA pour intervention sur le réseau d'eaux usées chez Mme Clayes, total 1 918,13 €. Accord du CS obtenu le 26/11/2026 (Paletti, Blauvac).",
    etape: 'travaux_acceptes', urgent: 0, auteur: 'sebastien.paletti@gmail.com', unites: [{ type: 'communes' }],
    events: [['creation', null, 'Ticket déclaré : Factures AVEPA EU Mme Clayes'], ['changement_etape', null, 'Travaux réalisés (SIEMP-AVEPA)'], ['changement_etape', null, "Passage à l'étape « Travaux acceptés » (factures 1 918,13 €)"]],
    factures: [{ entreprise: 'SIEMP-AVEPA', montant: 1918.13, nom: 'factures-avepa-clayes.pdf' }]
  },
  {
    titre: 'Installation fibre — villa 1 (gaine technique)',
    description: "Techniciens Fermée interviennent demain pour installer la fibre. Affiche posée devant la villa n° 1. Question ouverte : la gaine technique est-elle au bon endroit ?",
    etape: 'cree', urgent: 0, auteur: 'nathalie.delavallee9@gmail.com', unites: [{ type: 'villa', numero: 1 }],
    events: [['creation', null, 'Ticket déclaré : Installation fibre villa 1']]
  }
];

function auteurId(db, email) {
  const u = db.prepare("SELECT id FROM users WHERE email = ? AND statut = 'actif'").get(String(email).toLowerCase());
  if (u) return u.id;
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' AND statut = 'actif'").get();
  if (admin) return admin.id;
  const cs = db.prepare("SELECT id FROM users WHERE conseil_syndical = 1 AND statut = 'actif' ORDER BY id LIMIT 1").get();
  return (cs || admin).id;
}

function unitId(db, u) {
  if (u.type === 'communes') return db.prepare("SELECT id FROM units WHERE type = 'communes'").get().id;
  return db.prepare('SELECT id FROM units WHERE type = ? AND numero = ?').get(u.type, u.numero).id;
}

function entrepriseId(db, raison) {
  return db.prepare('SELECT id FROM entreprises WHERE raison_sociale = ?').get(raison).id;
}

function fichierDemoPdf(db, ticketId, categorie, nomOriginal, montant, consultationId, auteurId) {
  const stockage = crypto.randomBytes(8).toString('hex') + '.pdf';
  fs.writeFileSync(path.join(UPLOAD_DIR, stockage), '%PDF-1.4 demo ' + nomOriginal);
  db.prepare(
    `INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, entreprise, consultation_id, auteur_id)
     VALUES (?, ?, ?, ?, 'application/pdf', ?, ?, NULL, ?, ?)`
  ).run(ticketId, categorie, nomOriginal, stockage, 128, montant, consultationId, auteurId);
}

function seedRealiste() {
  const db = getDb();
  const rapport = { referentielCree: false, entreprises: 0, ticketsCrees: 0, ticketsExistants: 0, erreurs: [] };
  if (creerReferentielSiVide(db)) rapport.referentielCree = true;

  const findEnt = db.prepare('SELECT id FROM entreprises WHERE raison_sociale = ?');
  const insEnt = db.prepare('INSERT INTO entreprises (raison_sociale, siren_siret, contact_nom, telephone, mail) VALUES (?, ?, ?, ?, ?)');
  const updEnt = db.prepare('UPDATE entreprises SET contact_nom = ?, telephone = ?, mail = ? WHERE id = ?');
  db.transaction(() => {
    for (const e of ENTREPRISES) {
      try {
        const exist = findEnt.get(e.raison_sociale);
        if (exist) updEnt.run(e.contact_nom, e.telephone, e.mail, exist.id);
        else insEnt.run(e.raison_sociale, e.siren_siret, e.contact_nom, e.telephone, e.mail);
        rapport.entreprises++;
      } catch (err) { rapport.erreurs.push('entreprise ' + e.raison_sociale + ' : ' + err.message); }
    }
  })();

  const insTicket = db.prepare('INSERT INTO tickets (titre, description, etape, urgent, auteur_id, acceptes_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insTu = db.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, ?)');
  const insEv = db.prepare('INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, ?, ?, ?)');
  const insConsult = db.prepare('INSERT INTO consultations (ticket_id, entreprise_id, date_planifiee, validee, caduque, auteur_id) VALUES (?, ?, ?, ?, 0, ?)');
  const insRes = db.prepare('INSERT INTO resolutions (ticket_id, user_id, commentaire, caduque) VALUES (?, ?, ?, 0)');
  const existe = db.prepare('SELECT id FROM tickets WHERE titre = ?');

  db.transaction(() => {
    for (const t of TICKETS) {
      if (existe.get(t.titre)) { rapport.ticketsExistants++; continue; }
      const auteur = auteurId(db, t.auteur);
      const tid = insTicket.run(t.titre, t.description, t.etape, t.urgent ? 1 : 0, auteur,
        t.etape === 'travaux_acceptes' ? "datetime('now', '-5 day')" : null).lastInsertRowid;
      for (const u of t.unites) {
        try { insTu.run(tid, unitId(db, u)); } catch (err) { rapport.erreurs.push(t.titre + ' : unité ' + JSON.stringify(u) + ' — ' + err.message); }
      }
      for (const [type, , contenu] of t.events) insEv.run(tid, type, auteur, contenu);
      for (const c of t.consultations || []) {
        let eid = null;
        try { eid = entrepriseId(db, c.entreprise); } catch (err) { rapport.erreurs.push(t.titre + ' : ' + err.message); continue; }
        const cid = insConsult.run(tid, eid, c.date || null, c.validee ? 1 : 0, auteur).lastInsertRowid;
        fichierDemoPdf(db, tid, 'devis', 'devis-' + c.entreprise.toLowerCase().replace(/[^a-z]+/g, '-') + '.pdf', c.montant, cid, auteur);
        insEv.run(tid, 'consultation', auteur, `Consultation ajoutée (${c.entreprise}, devis ${c.montant} €${c.date ? ', date ' + c.date : ''})`);
      }
      for (const f of t.factures || []) {
        let eid = null;
        try { eid = entrepriseId(db, f.entreprise); } catch { eid = null; }
        fichierDemoPdf(db, tid, 'facture', f.nom, f.montant, null, auteur);
        if (eid) db.prepare('UPDATE fichiers SET entreprise = ? WHERE ticket_id = ? AND nom_original = ?').run(f.entreprise, tid, f.nom);
      }
      for (const r of t.resolutions || []) insRes.run(tid, auteurId(db, r.auteur), r.commentaire);
      rapport.ticketsCrees++;
    }
  })();

  return rapport;
}

function main() {
  const r = seedRealiste();
  console.log(`Seed réaliste : ${r.ticketsCrees} ticket(s) créé(s), ${r.ticketsExistants} déjà présent(s), ${r.entreprises} entreprise(s) enregistrée(s)${r.referentielCree ? ', référentiel créé' : ''}.`);
  for (const e of r.erreurs) console.error('ERREUR : ' + e);
  console.log('Source : fils de mails copro / CG IMMO (Gmail) — sinistres et travaux réels de la résidence.');
}

if (require.main === module) main();

module.exports = { seedRealiste, TICKETS, ENTREPRISES };
