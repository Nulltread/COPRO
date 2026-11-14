const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const {
  isGestionnaire, isAdmin, unitsDeUser, peutVoirTicket, peutChoisirUnites,
  estResidentConcerne, peutEditerTicket, peutSupprimerTicket,
  infosValidation, peutValiderTravaux, peutReouvrir, dateArchivageAuto,
  nbFactures, peutArchiver, consultationComplete,
  ETAPES, ETIQUETTES_ETAPES
} = require('../droits');
const { getParametreJours } = require('../parametres');
const { notifierTicket } = require('../notifications');
const { upload, enregistrerFichiers, UPLOAD_DIR } = require('../upload');

const router = express.Router();
router.use(requireAuth);

function unitesPossibles(user) {
  const db = getDb();
  if (isGestionnaire(user)) {
    return db.prepare('SELECT * FROM units ORDER BY type DESC, numero').all();
  }
  return db.prepare("SELECT * FROM units WHERE type != 'communes' ORDER BY type DESC, numero").all();
}

function listeTickets(user, filtres = {}) {
  const db = getDb();
  let sql = `SELECT t.*, GROUP_CONCAT(u.type || ' ' || COALESCE(u.numero, ''), ', ') AS unites
             FROM tickets t
             LEFT JOIN ticket_units tu ON tu.ticket_id = t.id
             LEFT JOIN units u ON u.id = tu.unit_id`;
  const params = [];
  const where = [];
  const mesUnites = unitsDeUser(user.id);
  if (!isAdmin(user) && mesUnites.length === 0) {
    // Sans unite validee, aucun ticket n'est visible.
    where.push('1 = 0');
  } else if (filtres.unite && filtres.unite !== 'toutes') {
    where.push('tu.unit_id = ?');
    params.push(Number(filtres.unite));
  } else if (!filtres.unite && mesUnites.length > 0) {
    // Filtre par defaut : les unites du resident (lecture ouverte sinon).
    where.push(`t.id IN (SELECT ticket_id FROM ticket_units WHERE unit_id IN (${mesUnites.map(() => '?').join(',')}))`);
    params.push(...mesUnites);
  }
  if (filtres.etape) { where.push('t.etape = ?'); params.push(filtres.etape); }
  else { where.push("t.etape != 'archive'"); } // par defaut, les tickets archives sont masques
  if (filtres.urgent === '1') { where.push('t.urgent = 1'); }
  // Recherche plaintext : titre et description uniquement (spec 22).
  const q = (filtres.q || '').trim().toLowerCase();
  if (q) {
    where.push('(LOWER(t.titre) LIKE ? OR LOWER(t.description) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' GROUP BY t.id ORDER BY t.urgent DESC, t.created_at ASC';
  return db.prepare(sql).all(...params);
}

function residentsConcernes(ticketId) {
  const db = getDb();
  return db.prepare(
    `SELECT DISTINCT u.id, u.nom FROM users u
     JOIN unit_residents ur ON ur.user_id = u.id
     JOIN ticket_units tu ON tu.unit_id = ur.unit_id
     WHERE tu.ticket_id = ? AND u.statut = 'actif' ORDER BY u.nom`
  ).all(ticketId);
}

function detailTicket(user, id) {
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket || !peutVoirTicket(user, id)) return null;
  const unites = db.prepare(
    `SELECT u.* FROM units u JOIN ticket_units tu ON tu.unit_id = u.id WHERE tu.ticket_id = ? ORDER BY u.type DESC, u.numero`
  ).all(id);
  const evenements = db.prepare(
    `SELECT e.*, u.nom AS auteur_nom FROM ticket_events e LEFT JOIN users u ON u.id = e.auteur_id
     WHERE e.ticket_id = ? ORDER BY e.created_at, e.id`
  ).all(id);
  const fichiers = db.prepare(
    `SELECT f.*, u.nom AS auteur_nom FROM fichiers f LEFT JOIN users u ON u.id = f.auteur_id
     WHERE f.ticket_id = ? ORDER BY f.created_at, f.id`
  ).all(id);
  const photos = fichiers.filter(f => f.categorie === 'photo');
  const factures = fichiers.filter(f => f.categorie === 'facture');
  const devis = fichiers.filter(f => f.categorie === 'devis');
  const consultations = db.prepare(
    `SELECT c.*, e.raison_sociale, e.siren_siret, e.contact_nom, e.telephone AS ent_telephone, e.mail AS ent_mail,
            u.nom AS auteur_nom
     FROM consultations c
     JOIN entreprises e ON e.id = c.entreprise_id
     LEFT JOIN users u ON u.id = c.auteur_id
     WHERE c.ticket_id = ? ORDER BY c.caduque, c.validee DESC, c.created_at`
  ).all(id);
  const entreprises = db.prepare('SELECT * FROM entreprises ORDER BY raison_sociale').all();
  const unitesIds = unites.map(u => u.id);
  // Cout retenu : devis des consultations validees (non caduques).
  const coutRetenu = db.prepare(
    `SELECT COALESCE(SUM(f.montant), 0) AS total FROM fichiers f
     JOIN consultations c ON c.id = f.consultation_id
     WHERE f.ticket_id = ? AND f.categorie = 'devis' AND c.validee = 1 AND c.caduque = 0`
  ).get(id).total;
  const totalFacture = db.prepare(
    "SELECT COALESCE(SUM(montant), 0) AS total FROM fichiers WHERE ticket_id = ? AND categorie = 'facture'"
  ).get(id).total;
  const validations = db.prepare(
    `SELECT r.*, u.nom AS auteur_nom, u.conseil_syndical, u.role FROM resolutions r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.ticket_id = ? ORDER BY r.caduque, r.created_at`
  ).all(id);
  const residents = residentsConcernes(id);
  const comptesRendus = db.prepare(
    `SELECT cr.*, u.label AS unite_label, a.nom AS auteur_nom FROM comptes_rendus cr
     LEFT JOIN units u ON u.id = cr.unit_id
     LEFT JOIN users a ON a.id = cr.auteur_id
     WHERE cr.ticket_id = ? ORDER BY cr.unit_id IS NULL, u.type DESC, u.numero`
  ).all(id);
  const validation = infosValidation(id);
  return {
    ticket, unites, evenements, fichiers, photos, factures, devis, consultations, entreprises,
    coutRetenu, totalFacture, unitesIds, validations, residents, comptesRendus,
    infosValidation: validation,
    nbFactures: nbFactures(id)
  };
}

// Transition du cycle de vie v2 : changement d'etape + log + notification
// (les notifications ne partent QUE sur les transitions, spec 18).
function faireTransition(db, ticket, nouvelleEtape, auteurId, contenu) {
  const ancienne = ticket.etape;
  db.prepare("UPDATE tickets SET etape = ?, updated_at = datetime('now') WHERE id = ?").run(nouvelleEtape, ticket.id);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'changement_etape', ?, ?)")
    .run(ticket.id, auteurId, contenu);
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
  notifierTicket(t, 'changement_etape', `Le ticket « ${t.titre} » passe à l'étape « ${ETIQUETTES_ETAPES[nouvelleEtape]} »${auteurId ? '' : ' (automatique)'} — ${contenu}`, auteurId, !!t.urgent);
  return ancienne;
}

function trouverTicket(req, res) {
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(Number(req.params.id));
  if (!ticket) {
    res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
    return null;
  }
  if (!peutVoirTicket(req.user, ticket.id)) {
    res.status(403).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
    return null;
  }
  return ticket;
}

router.get('/', (req, res) => {
  const tickets = listeTickets(req.user, req.query);
  const db = getDb();
  const unitesFiltre = db.prepare('SELECT * FROM units ORDER BY type DESC, numero').all();
  res.render('tickets', {
    user: req.user, tickets,
    etapes: ETAPES, etiquettes: ETIQUETTES_ETAPES, unitesFiltre,
    filtres: req.query, gestionnaire: isGestionnaire(req.user),
    mesUnites: unitsDeUser(req.user.id),
    nonLues: require('../notifications').nonLues(req.user.id)
  });
});

router.get('/nouveau', (req, res) => {
  const mesUnites = unitsDeUser(req.user.id);
  res.render('ticket-form', {
    user: req.user, unites: unitesPossibles(req.user), mesUnites,
    ticket: null, erreur: null, nonLues: require('../notifications').nonLues(req.user.id)
  });
});

router.post('/', (req, res) => {
  upload.array('fichiers', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    creerTicket(req, res);
  });
});

function creerTicket(req, res) {
  const db = getDb();
  const { titre, description, urgent, unite_ids } = req.body;
  const ids = Array.isArray(unite_ids) ? unite_ids : [unite_ids].filter(Boolean);
  const mesUnites = unitsDeUser(req.user.id);
  const erreur = !titre || ids.length === 0
    ? 'Merci de donner un titre et au moins une villa/garage concernée.' : null;
  if (erreur || mesUnites.length === 0) {
    for (const f of req.files || []) fs.unlinkSync(f.path);
    const msg = mesUnites.length === 0
      ? 'Votre rattachement à une villa ou un garage doit d\'abord être accepté avant de pouvoir déclarer un ticket.'
      : erreur;
    return res.status(403).render('ticket-form', {
      user: req.user, unites: unitesPossibles(req.user), mesUnites,
      ticket: req.body, erreur: msg, nonLues: require('../notifications').nonLues(req.user.id)
    });
  }
  if (!peutChoisirUnites(req.user, ids)) {
    for (const f of req.files || []) fs.unlinkSync(f.path);
    return res.status(403).render('erreur', { user: req.user, message: 'Au moins une des unités choisies doit être la vôtre (les parties communes sont réservées au conseil syndical).' });
  }
  const info = db.prepare(
    'INSERT INTO tickets (titre, description, etape, urgent, auteur_id) VALUES (?, ?, ?, ?, ?)'
  ).run(titre.trim(), (description || '').trim(), 'cree', urgent ? 1 : 0, req.user.id);
  const tid = info.lastInsertRowid;
  const ins = db.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, ?)');
  for (const id of ids) ins.run(tid, Number(id));
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'creation', ?, ?)")
    .run(tid, req.user.id, `Ticket déclaré${urgent ? ' (URGENT)' : ''} : ${titre.trim()}`);
  // Photos : moment cadre n°1 = la creation du ticket.
  if ((req.files || []).length > 0) {
    enregistrerFichiers(db, tid, 'photo', req.files, {}, req.user.id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'fichier', ?, ?)")
      .run(tid, req.user.id, `${req.user.nom} a ajouté ${req.files.length} photo(s)`);
  }
  res.redirect('/tickets/' + tid);
}

router.get('/:id', (req, res) => {
  const d = detailTicket(req.user, Number(req.params.id));
  if (!d) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  const mesUnites = new Set(unitsDeUser(req.user.id));
  res.render('ticket-detail', {
    user: req.user, ...d,
    etapes: ETAPES, etiquettes: ETIQUETTES_ETAPES,
    gestionnaire: isGestionnaire(req.user),
    mesUnites,
    peutEditer: peutEditerTicket(req.user, d.ticket),
    peutSupprimer: peutSupprimerTicket(req.user, d.ticket),
    peutValiderTravaux: peutValiderTravaux(req.user, d.ticket),
    peutReouvrir: peutReouvrir(req.user, d.ticket),
    peutArchiver: peutArchiver(req.user, d.ticket),
    dateArchivageAuto: dateArchivageAuto(d.ticket),
    delaiArchivageJours: getParametreJours('archivage_auto_jours', 31),
    estConcerne: estResidentConcerne(req.user, d.ticket.id) || isGestionnaire(req.user),
    unitesModifiables: unitesPossibles(req.user),
    nonLues: require('../notifications').nonLues(req.user.id)
  });
});

router.post('/:id/commentaire', (req, res) => {
  const id = Number(req.params.id);
  if (!peutVoirTicket(req.user, id)) return res.status(403).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  const contenu = (req.body.contenu || '').trim();
  if (!contenu) return res.redirect('/tickets/' + id);
  const db = getDb();
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'commentaire', ?, ?)")
    .run(id, req.user.id, contenu);
  // Pas de notification : seules les transitions notifient (spec 18).
  res.redirect('/tickets/' + id + '#fil');
});

// cree -> consultation : reserve au CS / admin.
router.post('/:id/passer-consultation', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical peut faire passer un ticket en consultation.' });
  }
  if (ticket.etape !== 'cree') {
    return res.status(400).render('erreur', { user: req.user, message: 'Ce ticket n\'est plus à l\'étape « Créé ».' });
  }
  faireTransition(db, ticket, 'consultation', req.user.id, 'Passage en consultation');
  res.redirect('/tickets/' + ticket.id);
});

function lireDevis(req) {
  // Chaque devis = piece jointe + montant. Les montants sont saisis dans le
  // meme ordre que les fichiers (champs devis_montant[] generes cote client).
  const fichiers = req.files || [];
  let montants = req.body.devis_montant || [];
  if (!Array.isArray(montants)) montants = [montants];
  return fichiers.map((f, i) => ({ fichier: f, montant: montants[i] }));
}

function enregistrerDevis(db, ticketId, consultationId, devis, auteurId) {
  const ins = db.prepare(
    `INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, consultation_id, auteur_id)
     VALUES (?, 'devis', ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const d of devis) {
    ins.run(ticketId, d.fichier.originalname, d.fichier.filename, d.fichier.mimetype, d.fichier.size, d.montant, consultationId, auteurId);
  }
}

function nettoyerFichiers(files) {
  for (const f of files || []) { try { fs.unlinkSync(f.path); } catch (e) {} }
}

// Creation d'une consultation (etape 'consultation', CS/admin uniquement) :
// entreprise (existante ou creee a la volee) + date + au moins un devis
// (piece jointe + montant).
router.post('/:id/consultations', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical gère les consultations.' });
  }
  if (ticket.etape !== 'consultation') {
    return res.status(400).render('erreur', { user: req.user, message: 'Les consultations ne se gèrent qu\'à l\'étape « En consultation ».' });
  }
  upload.array('devis_fichiers', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    const { entreprise_id, date_planifiee } = req.body;
    let entrepriseId = null;
    if (entreprise_id && entreprise_id !== 'nouvelle') {
      entrepriseId = Number(entreprise_id);
      if (!db.prepare('SELECT id FROM entreprises WHERE id = ?').get(entrepriseId)) entrepriseId = null;
    }
    if (!entrepriseId) {
      // Creation a la volee d'une fiche entreprise (raison sociale obligatoire).
      const raison = (req.body.nouvelle_raison_sociale || '').trim();
      if (!raison) {
        nettoyerFichiers(req.files);
        return res.status(400).render('erreur', { user: req.user, message: 'Choisissez une entreprise ou renseignez la raison sociale de la nouvelle entreprise.' });
      }
      entrepriseId = db.prepare(
        'INSERT INTO entreprises (raison_sociale, siren_siret, contact_nom, telephone, mail) VALUES (?, ?, ?, ?, ?)'
      ).run(raison, (req.body.nouveau_siren_siret || '').trim(), (req.body.nouveau_contact_nom || '').trim(),
           (req.body.nouveau_telephone || '').trim(), (req.body.nouveau_mail || '').trim()).lastInsertRowid;
    }
    const date = (date_planifiee || '').trim();
    const devis = lireDevis(req);
    if (!date) {
      nettoyerFichiers(req.files);
      return res.status(400).render('erreur', { user: req.user, message: 'La date planifiée est obligatoire pour une consultation.' });
    }
    if (devis.length === 0 || devis.some(d => !(Number(d.montant) > 0))) {
      nettoyerFichiers(req.files);
      return res.status(400).render('erreur', { user: req.user, message: 'Chaque devis doit avoir une pièce jointe et un montant supérieur à 0.' });
    }
    const info = db.prepare('INSERT INTO consultations (ticket_id, entreprise_id, date_planifiee, auteur_id) VALUES (?, ?, ?, ?)')
      .run(ticket.id, entrepriseId, date, req.user.id);
    const cid = info.lastInsertRowid;
    enregistrerDevis(db, ticket.id, cid, devis.map(d => ({ fichier: d.fichier, montant: Number(d.montant) })), req.user.id);
    const ent = db.prepare('SELECT raison_sociale FROM entreprises WHERE id = ?').get(entrepriseId);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'consultation', ?, ?)")
      .run(ticket.id, req.user.id, `${req.user.nom} a ajouté une consultation (${ent.raison_sociale}, ${devis.length} devis, date ${date})`);
    res.redirect('/tickets/' + ticket.id + '#consultations');
  });
});

// Modification d'une consultation (entreprise, date, ajout de devis).
router.post('/:id/consultations/:cid', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical gère les consultations.' });
  }
  if (ticket.etape !== 'consultation') {
    return res.status(400).render('erreur', { user: req.user, message: 'Les consultations ne se gèrent qu\'à l\'étape « En consultation ».' });
  }
  const c = db.prepare('SELECT * FROM consultations WHERE id = ? AND ticket_id = ?').get(Number(req.params.cid), ticket.id);
  if (!c || c.caduque || c.validee) {
    return res.status(400).render('erreur', { user: req.user, message: 'Cette consultation n\'est plus modifiable (lecture seule).' });
  }
  upload.array('devis_fichiers', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    const { entreprise_id, date_planifiee } = req.body;
    if (entreprise_id && entreprise_id !== 'nouvelle') {
      const eid = Number(entreprise_id);
      if (db.prepare('SELECT id FROM entreprises WHERE id = ?').get(eid)) {
        db.prepare('UPDATE consultations SET entreprise_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(eid, c.id);
      }
    }
    if (date_planifiee && date_planifiee.trim()) {
      db.prepare("UPDATE consultations SET date_planifiee = ?, updated_at = datetime('now') WHERE id = ?").run(date_planifiee.trim(), c.id);
    }
    const devis = lireDevis(req);
    if (devis.length > 0) {
      if (devis.some(d => !(Number(d.montant) > 0))) {
        nettoyerFichiers(req.files);
        return res.status(400).render('erreur', { user: req.user, message: 'Chaque nouveau devis doit avoir un montant supérieur à 0.' });
      }
      enregistrerDevis(db, ticket.id, c.id, devis.map(d => ({ fichier: d.fichier, montant: Number(d.montant) })), req.user.id);
      db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'consultation', ?, ?)")
        .run(ticket.id, req.user.id, `${req.user.nom} a ajouté ${devis.length} devis à une consultation`);
    }
    res.redirect('/tickets/' + ticket.id + '#consultations');
  });
});

// Suppression d'une consultation (et ses devis).
router.post('/:id/consultations/:cid/supprimer', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical gère les consultations.' });
  }
  if (ticket.etape !== 'consultation') {
    return res.status(400).render('erreur', { user: req.user, message: 'Les consultations ne se gèrent qu\'à l\'étape « En consultation ».' });
  }
  const c = db.prepare('SELECT * FROM consultations WHERE id = ? AND ticket_id = ?').get(Number(req.params.cid), ticket.id);
  if (!c || c.caduque || c.validee) {
    return res.status(400).render('erreur', { user: req.user, message: 'Cette consultation n\'est plus supprimable (lecture seule).' });
  }
  const devis = db.prepare('SELECT nom_stockage FROM fichiers WHERE consultation_id = ?').all(c.id);
  for (const f of devis) {
    const chemin = path.join(UPLOAD_DIR, f.nom_stockage);
    if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
  }
  db.prepare('DELETE FROM consultations WHERE id = ?').run(c.id); // fichiers en cascade
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'consultation', ?, ?)")
    .run(ticket.id, req.user.id, `${req.user.nom} a supprimé une consultation (${devis.length} devis)`);
  res.redirect('/tickets/' + ticket.id + '#consultations');
});

// Validation d'une consultation pour passer en "travaux planifies" :
// la consultation doit etre complete (entreprise strictement complete,
// au moins un devis piece jointe + montant, date planifiee).
router.post('/:id/consultations/:cid/valider', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical peut valider une consultation.' });
  }
  if (ticket.etape !== 'consultation') {
    return res.status(400).render('erreur', { user: req.user, message: 'Le ticket n\'est plus en consultation.' });
  }
  const c = db.prepare('SELECT * FROM consultations WHERE id = ? AND ticket_id = ?').get(Number(req.params.cid), ticket.id);
  if (!c || c.caduque) {
    return res.status(400).render('erreur', { user: req.user, message: 'Consultation introuvable ou caduque.' });
  }
  if (!consultationComplete(db, c)) {
    return res.status(400).render('erreur', {
      user: req.user,
      message: 'La consultation doit être complète : fiche entreprise strictement complète (raison sociale, SIREN/SIRET, contact, téléphone, mail), au moins un devis (pièce jointe + montant) et une date planifiée.'
    });
  }
  db.prepare('UPDATE consultations SET validee = 1, updated_at = datetime(\'now\') WHERE id = ?').run(c.id);
  const ent = db.prepare('SELECT raison_sociale FROM entreprises WHERE id = ?').get(c.entreprise_id);
  faireTransition(db, ticket, 'intervention_planifiee', req.user.id, `Consultation validée (${ent.raison_sociale}, date ${c.date_planifiee}) — travaux planifiés`);
  res.redirect('/tickets/' + ticket.id);
});

// Factures (PDF + cout) : CS/admin, tant que le ticket n'est pas archive.
router.post('/:id/factures', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical ajoute les factures.' });
  }
  if (ticket.etape === 'archive') {
    return res.status(400).render('erreur', { user: req.user, message: 'Un ticket archivé n\'est plus éditable.' });
  }
  upload.single('fichier')(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    const montant = Number(req.body.montant);
    if (!req.file || req.file.mimetype !== 'application/pdf') {
      nettoyerFichiers(req.files);
      return res.status(400).render('erreur', { user: req.user, message: 'Une facture est un fichier PDF.' });
    }
    if (!(montant > 0)) {
      nettoyerFichiers(req.files);
      return res.status(400).render('erreur', { user: req.user, message: 'Le coût de la facture est obligatoire (supérieur à 0).' });
    }
    db.prepare(
      `INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, auteur_id)
       VALUES (?, 'facture', ?, ?, ?, ?, ?, ?)`
    ).run(ticket.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, montant, req.user.id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'fichier', ?, ?)")
      .run(ticket.id, req.user.id, `${req.user.nom} a ajouté une facture (${montant.toFixed(2)} €)`);
    res.redirect('/tickets/' + ticket.id + '#factures');
  });
});

// Validation des travaux (planifie -> acceptes) : chaque proprietaire/locataire
// concerne valide (commentaire et/ou photos facultatifs) ; parties communes :
// au moins un membre du CS. Le passage a "travaux acceptes" n'a lieu que quand
// tous les concernes ont validé.
router.post('/:id/valider-travaux', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!peutValiderTravaux(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seuls les propriétaires/locataires des unités concernées (ou un membre du CS pour les parties communes) peuvent valider les travaux.' });
  }
  upload.array('photos', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    const commentaire = (req.body.commentaire || '').trim();
    db.prepare('INSERT OR IGNORE INTO resolutions (ticket_id, user_id, commentaire, caduque) VALUES (?, ?, ?, 0)')
      .run(ticket.id, req.user.id, commentaire);
    db.prepare('UPDATE resolutions SET commentaire = ? WHERE ticket_id = ? AND user_id = ? AND caduque = 0')
      .run(commentaire, ticket.id, req.user.id);
    // Photos : moment cadre n°2 = la validation des travaux (facultative).
    if ((req.files || []).length > 0) {
      enregistrerFichiers(db, ticket.id, 'photo', req.files, {}, req.user.id);
    }
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'resolution', ?, ?)")
      .run(ticket.id, req.user.id, `${req.user.nom} a validé les travaux${commentaire ? ` — « ${commentaire.slice(0, 120)} »` : ''}${(req.files || []).length ? ` (${req.files.length} photo(s))` : ''}`);
    // Le passage a "travaux acceptes" n'est possible que si TOUS les concernes
    // ont validé (parties communes : au moins un membre du CS).
    const { residents, besoinCS } = infosValidation(ticket.id);
    const validees = new Set(
      db.prepare('SELECT user_id FROM resolutions WHERE ticket_id = ? AND caduque = 0').all(ticket.id).map(r => r.user_id)
    );
    const tousResidents = residents.every(r => validees.has(r.id));
    const csValide = !besoinCS || db.prepare(
      `SELECT COUNT(*) AS n FROM resolutions r JOIN users u ON u.id = r.user_id
       WHERE r.ticket_id = ? AND r.caduque = 0 AND (u.conseil_syndical = 1 OR u.role = 'admin') AND u.statut = 'actif'`
    ).get(ticket.id).n > 0;
    if (residents.length > 0 || besoinCS) {
      if (tousResidents && csValide) {
        db.prepare("UPDATE tickets SET etape = 'travaux_acceptes', acceptes_at = datetime('now'), notif_archive_j3 = 0, notif_archive_j1 = 0, updated_at = datetime('now') WHERE id = ?").run(ticket.id);
        db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'changement_etape', ?, ?)")
          .run(ticket.id, req.user.id, 'Tous les concernés ont validé — passage à « Travaux acceptés »');
        const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
        notifierTicket(t, 'changement_etape', `Le ticket « ${t.titre} » passe à l'étape « Travaux acceptés » (tous les concernés ont validé)`, req.user.id, !!t.urgent);
      }
    }
    res.redirect('/tickets/' + ticket.id);
  });
});

// Reouverture (travaux acceptes -> consultation) : dans le delai d'archivage
// auto, par tout proprietaire/locataire concerne (parties communes : au moins
// un membre du CS), avec commentaire obligatoire et au moins une photo.
// Consultations et validations precedentes deviennent caduques (lecture seule).
router.post('/:id/reouvrir', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!peutReouvrir(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Réouverture impossible : délai dépassé ou vous n\'êtes pas concerné par ce ticket.' });
  }
  upload.array('photos', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    const commentaire = (req.body.commentaire || '').trim();
    if (!commentaire) {
      nettoyerFichiers(req.files);
      return res.status(400).render('erreur', { user: req.user, message: 'Un commentaire est obligatoire pour rouvrir le ticket.' });
    }
    // Photos : moment cadre n°3 = la reouverture (au moins une obligatoire).
    if ((req.files || []).length === 0) {
      return res.status(400).render('erreur', { user: req.user, message: 'Au moins une photo est obligatoire pour rouvrir le ticket.' });
    }
    enregistrerFichiers(db, ticket.id, 'photo', req.files, {}, req.user.id);
    db.prepare('UPDATE consultations SET caduque = 1 WHERE ticket_id = ?').run(ticket.id);
    db.prepare('UPDATE resolutions SET caduque = 1 WHERE ticket_id = ?').run(ticket.id);
    db.prepare("UPDATE tickets SET etape = 'consultation', acceptes_at = NULL, notif_archive_j3 = 0, notif_archive_j1 = 0, updated_at = datetime('now') WHERE id = ?").run(ticket.id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'changement_etape', ?, ?)")
      .run(ticket.id, req.user.id, `Ticket rouvert par ${req.user.nom} — retour en consultation — « ${commentaire.slice(0, 120)} » (${req.files.length} photo(s)) ; consultations et validations précédentes caduques`);
    const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
    notifierTicket(t, 'changement_etape', `Le ticket « ${t.titre} » est rouvert et repasse en « En consultation »`, req.user.id, !!t.urgent);
    res.redirect('/tickets/' + ticket.id);
  });
});

// Archivage : a tout moment par le CS/admin, mais IMPOSSIBLE sans facture.
router.post('/:id/archiver', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical peut archiver un ticket.' });
  }
  if (ticket.etape === 'archive') return res.redirect('/tickets/' + ticket.id);
  if (nbFactures(ticket.id) === 0) {
    return res.status(400).render('erreur', { user: req.user, message: 'Aucun archivage possible sans au moins une facture jointe au ticket.' });
  }
  faireTransition(db, ticket, 'archive', req.user.id, 'Ticket archivé manuellement');
  res.redirect('/tickets/' + ticket.id);
});

router.post('/:id/unites', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (!peutEditerTicket(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le déclarant ou le conseil syndical peut modifier les unités du ticket (tant qu\'il n\'est pas archivé).' });
  }
  let { unite_ids } = req.body;
  const ids = Array.isArray(unite_ids) ? unite_ids : [unite_ids].filter(Boolean);
  if (!peutChoisirUnites(req.user, ids)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Au moins une des unités doit être la vôtre (parties communes réservées au conseil syndical).' });
  }
  db.prepare('DELETE FROM ticket_units WHERE ticket_id = ?').run(id);
  const ins = db.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, ?)');
  for (const uid of ids) ins.run(id, Number(uid));
  const labels = db.prepare(
    `SELECT GROUP_CONCAT(label, ', ') AS l FROM units WHERE id IN (${ids.map(() => '?').join(',')})`
  ).get(...ids.map(Number)).l;
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'edition', ?, ?)")
    .run(id, req.user.id, `${req.user.nom} a modifié les unités du ticket : ${labels}`);
  res.redirect('/tickets/' + id);
});

// Edition de la description (archive = fige). Plus de photos ici : les photos
// ne sont ajoutables qu'aux 3 moments cadres (creation, validation, reouverture).
router.post('/:id/editer', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (!peutEditerTicket(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Vous ne pouvez pas modifier ce ticket (archivé = figé).' });
  }
  const nouvelleDescription = (req.body.description || '').trim();
  if (nouvelleDescription !== ticket.description) {
    db.prepare("UPDATE tickets SET description = ?, updated_at = datetime('now') WHERE id = ?").run(nouvelleDescription, id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'edition', ?, ?)")
      .run(id, req.user.id, `${req.user.nom} a modifié la description du ticket`);
  }
  res.redirect('/tickets/' + id);
});

router.post('/:id/cr', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (!isGestionnaire(req.user) && !estResidentConcerne(req.user, id)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seuls les résidents concernés peuvent rédiger un compte-rendu.' });
  }
  const contenu = (req.body.contenu || '').trim();
  const unitId = req.body.unit_id === 'cs' || req.body.unit_id === '' ? null : Number(req.body.unit_id);
  if (unitId !== null) {
    const ok = db.prepare('SELECT 1 FROM ticket_units WHERE ticket_id = ? AND unit_id = ?').get(id, unitId);
    if (!ok) return res.status(400).render('erreur', { user: req.user, message: 'Unité non concernée par ce ticket.' });
  }
  const existe = db.prepare('SELECT id FROM comptes_rendus WHERE ticket_id = ? AND COALESCE(unit_id, 0) = ?').get(id, unitId || 0);
  if (existe) {
    db.prepare("UPDATE comptes_rendus SET contenu = ?, auteur_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(contenu, req.user.id, existe.id);
  } else {
    db.prepare('INSERT INTO comptes_rendus (ticket_id, unit_id, contenu, auteur_id) VALUES (?, ?, ?, ?)')
      .run(id, unitId, contenu, req.user.id);
  }
  const label = unitId === null ? 'conseil syndical' : (db.prepare('SELECT label FROM units WHERE id = ?').get(unitId) || {}).label;
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'compte_rendu', ?, ?)")
    .run(id, req.user.id, `${req.user.nom} a rédigé le compte-rendu d'intervention (${label})`);
  res.redirect('/tickets/' + id + '#cr');
});

// Suppression : etape 'cree' uniquement (jamais passé en consultation),
// par le créateur, un membre du CS ou l'admin.
router.post('/:id/supprimer', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (!peutSupprimerTicket(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Suppression réservée au créateur, à un membre du CS ou à l\'admin, et uniquement tant que le ticket est à l\'étape « Créé ».' });
  }
  db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  res.redirect('/tickets');
});

module.exports = { router, listeTickets, detailTicket };
