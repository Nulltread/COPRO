const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const {
  isGestionnaire, isAdmin, isCS, unitsDeUser, peutVoirTicket, peutChoisirUnites,
  estResidentConcerne, peutEditerTicket, peutEditerUnites, peutSupprimerTicket,
  infosValidation, peutAccepterRefuser, peutReouvrir, dateArchivageAuto,
  nbFactures, peutArchiver, consultationComplete, consultationSelectionnable, peutValiderDate,
  personnesConcerneesCR, peutRedigerCR, crVisibles, peutVoirCR, sectionsVisibles,
  peutToggleUrgent, peutGererPhotosDescription,
  ETAPES, ETIQUETTES_ETAPES
} = require('../droits');
const { getParametreJours } = require('../parametres');
const { notifierTicket, notifierCS } = require('../notifications');
const { upload, enregistrerFichiers, UPLOAD_DIR } = require('../upload');
const { solliciterConsultation, envoyerMailDatesSelection, notifierDateRetenue } = require('../sollicitations');
const { enregistrerAction } = require('../audit');

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
  // Filtre unite multiselect (spec 29) : unite peut etre une valeur ou un tableau.
  const unitesBrutes = (!filtres.unite ? [] : (Array.isArray(filtres.unite) ? filtres.unite : [filtres.unite]))
    .map(String).filter(v => v !== '');
  const toutes = unitesBrutes.includes('toutes');
  const unitesSel = unitesBrutes.filter(v => v !== 'toutes');
  if (!isAdmin(user) && mesUnites.length === 0) {
    // Sans unite validee, aucun ticket n'est visible.
    where.push('1 = 0');
  } else if (toutes) {
    // « Toutes les unités » l'emporte sur toute sélection individuelle.
  } else if (unitesSel.length > 0) {
    where.push(`tu.unit_id IN (${unitesSel.map(() => '?').join(',')})`);
    params.push(...unitesSel.map(Number));
  } else if (mesUnites.length > 0) {
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
  const photosParContexte = {};
  for (const p of photos) { (photosParContexte[p.contexte || 'creation'] = photosParContexte[p.contexte || 'creation'] || []).push(p); }
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
  const validations = db.prepare(
    `SELECT r.*, u.nom AS auteur_nom, u.conseil_syndical, u.role FROM resolutions r
     LEFT JOIN users u ON u.id = r.user_id
     WHERE r.ticket_id = ? ORDER BY r.caduque, r.created_at`
  ).all(id);
  const residents = residentsConcernes(id);
  // Comptes-rendus : une instance par personne concernee (cle ticket_id, user_id).
  const comptesRendus = db.prepare(
    `SELECT cr.*, a.nom AS auteur_nom, a.prenom AS auteur_prenom FROM comptes_rendus cr
     LEFT JOIN users a ON a.id = cr.auteur_id
     WHERE cr.ticket_id = ? ORDER BY cr.cycle DESC, cr.updated_at`
  ).all(id);
  // Photos des bilans, groupees par cycle (spec 28) : les cycles passes sont
  // figes en lecture seule, le cycle en cours reste modifiable par son auteur.
  const photosCRParCycle = {};
  for (const f of fichiers) {
    if (f.categorie === 'photo' && (f.contexte || 'creation') === 'compte_rendu') {
      const c = f.cycle || 1;
      (photosCRParCycle[c] = photosCRParCycle[c] || []).push(f);
    }
  }
  const personnesCR = personnesConcerneesCR(id);
  const validation = infosValidation(id);
  // Sollicitations/relances et dates proposees, groupees par consultation.
  const sollicitations = db.prepare(
    `SELECT s.*, u.nom AS auteur_nom FROM sollicitations s
     LEFT JOIN users u ON u.id = s.auteur_id
     JOIN consultations c ON c.id = s.consultation_id
     WHERE c.ticket_id = ? ORDER BY s.created_at, s.id`
  ).all(id);
  const sollicitationsParConsultation = {};
  for (const s of sollicitations) { (sollicitationsParConsultation[s.consultation_id] = sollicitationsParConsultation[s.consultation_id] || []).push(s); }
  const datesProposees = db.prepare(
    `SELECT d.*, u.nom AS valide_par_nom FROM consultation_dates d
     LEFT JOIN users u ON u.id = d.valide_par
     JOIN consultations c ON c.id = d.consultation_id
     WHERE c.ticket_id = ? ORDER BY d.created_at, d.id`
  ).all(id);
  const datesParConsultation = {};
  for (const d of datesProposees) { (datesParConsultation[d.consultation_id] = datesParConsultation[d.consultation_id] || []).push(d); }
  const nbSansDevisAvecMail = consultations.filter(c => !c.caduque && !c.validee && !devis.some(x => x.consultation_id === c.id) && (c.ent_mail || '').trim()).length;
  const nbSelectionnees = consultations.filter(c => c.validee && !c.caduque).length;
  return {
    ticket, unites, evenements, fichiers, photos, photosParContexte, factures, devis, consultations, entreprises,
    unitesIds, validations, residents, comptesRendus, personnesCR, photosCRParCycle,
    sollicitationsParConsultation, datesParConsultation, nbSansDevisAvecMail, nbSelectionnees,
    infosValidation: validation,
    nbFactures: nbFactures(id),
    crVisibles: crVisibles(ticket),
    peutVoirCR: peutVoirCR(user, ticket),
    peutRedigerCR: peutRedigerCR(null, ticket), // recalcule par user dans la route
    sections: sectionsVisibles(ticket) // spec 29 : visibilite par etat, regle « archive » incluse
  };
}

// Transition du cycle de vie v2 : changement d'etape + log + notification
// (les notifications ne partent QUE sur les transitions, spec 18).
function faireTransition(db, ticket, nouvelleEtape, auteurId, contenu) {
  const ancienne = ticket.etape;
  db.prepare("UPDATE tickets SET etape = ?, updated_at = datetime('now') WHERE id = ?").run(nouvelleEtape, ticket.id);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu, donnees) VALUES (?, 'changement_etape', ?, ?, ?)")
    .run(ticket.id, auteurId, contenu, JSON.stringify({ etape: nouvelleEtape }));
  enregistrerAction('ticket_etape', auteurId || null, 'ticket', ticket.id,
    `${contenu} — « ${ETIQUETTES_ETAPES[ancienne]} » → « ${ETIQUETTES_ETAPES[nouvelleEtape]} »`);
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
  // Multiselect « search » des unites (spec 29) : options + valeurs selectionnees.
  const unitesOptions = [
    { value: 'toutes', label: 'Toutes les unités' },
    ...unitesFiltre.map(u => ({ value: String(u.id), label: u.label }))
  ];
  const unitesSelectionnees = (!req.query.unite ? [] : (Array.isArray(req.query.unite) ? req.query.unite : [req.query.unite]))
    .map(String).filter(v => v !== '' && unitesOptions.some(o => o.value === v));
  res.render('tickets', {
    user: req.user, tickets,
    etapes: ETAPES, etiquettes: ETIQUETTES_ETAPES, unitesFiltre, unitesOptions, unitesSelectionnees,
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
  enregistrerAction('ticket_cree', req.user.id, 'ticket', tid, `Ticket créé : « ${titre.trim().slice(0, 120)} »`);
  // Photos : moment cadre n°1 = la creation du ticket (contexte 'creation').
  if ((req.files || []).length > 0) {
    enregistrerFichiers(db, tid, 'photo', req.files, {}, req.user.id, 'creation');
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
    peutEditerUnites: peutEditerUnites(req.user, d.ticket),
    peutRedigerCR: peutRedigerCR(req.user, d.ticket),
    peutSupprimer: peutSupprimerTicket(req.user, d.ticket),
    peutAccepterRefuser: peutAccepterRefuser(req.user, d.ticket),
    peutToggleUrgent: peutToggleUrgent(req.user, d.ticket),
    peutGererPhotos: peutGererPhotosDescription(req.user, d.ticket),
    peutVoirCR: d.peutVoirCR,
    peutReouvrir: peutReouvrir(req.user, d.ticket),
    peutArchiver: peutArchiver(req.user, d.ticket),
    peutValiderDate: peutValiderDate(req.user, d.ticket),
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
  if (devis.length) {
    enregistrerAction('fichier_ajoute', auteurId || null, 'ticket', ticketId,
      `Devis ajouté(s) : ${devis.map(d => d.fichier.originalname).join(', ')}`);
  }
}

function nettoyerFichiers(files) {
  for (const f of files || []) { try { fs.unlinkSync(f.path); } catch (e) {} }
}

// Creation d'une consultation (etape 'consultation', CS/admin uniquement) :
// entreprise (existante ou creee a la volee) + UN seul devis (piece jointe +
// montant). La date planifiee est FACULTATIVE a la creation : elle ne devient
// obligatoire qu'a la selection de la consultation (voir /selectionner).
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
  upload.array('devis_fichiers', 1)(req, res, (err) => {
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
    const date = (date_planifiee || '').trim() || null;
    const devis = lireDevis(req);
    if (devis.length !== 1 || !(Number(devis[0].montant) > 0)) {
      nettoyerFichiers(req.files);
      return res.status(400).render('erreur', { user: req.user, message: 'Une consultation attend exactement un devis (pièce jointe + montant supérieur à 0).' });
    }
    const info = db.prepare('INSERT INTO consultations (ticket_id, entreprise_id, date_planifiee, auteur_id) VALUES (?, ?, ?, ?)')
      .run(ticket.id, entrepriseId, date, req.user.id);
    // date peut etre NULL ici (renseignee a la selection)
    const cid = info.lastInsertRowid;
    enregistrerDevis(db, ticket.id, cid, devis.map(d => ({ fichier: d.fichier, montant: Number(d.montant) })), req.user.id);
    const ent = db.prepare('SELECT raison_sociale FROM entreprises WHERE id = ?').get(entrepriseId);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'consultation', ?, ?)")
      .run(ticket.id, req.user.id, `${req.user.nom} a ajouté une consultation (${ent.raison_sociale}, ${devis.length} devis, date ${date})`);
    res.redirect('/tickets/' + ticket.id + '#consultations');
  });
});

// Selection globale : une ou plusieurs consultations cochées passent en
// « sélectionnée » (validee) et un mail de planification des dates est envoyé
// à chaque entreprise sélectionnée. Le ticket RESTE en « consultation » : le
// passage en « Travaux planifiés » est une action séparée (POST
// /travaux-planifies), bloquée tant que les consultations sélectionnées
// n'ont pas de date acceptée (voir sollicitations-relances.md).
// Mêmes vérifications pour CHAQUE consultation sélectionnée : fiche entreprise
// strictement complète + exactement 1 devis (pièce jointe + montant > 0).
router.post('/:id/consultations/selectionner', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical peut sélectionner une consultation.' });
  }
  if (ticket.etape !== 'consultation') {
    return res.status(400).render('erreur', { user: req.user, message: 'Le ticket n\'est plus en consultation.' });
  }
  let idsSel = req.body.consultation_ids || [];
  if (!Array.isArray(idsSel)) idsSel = [idsSel];
  idsSel = idsSel.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (idsSel.length === 0) {
    return res.status(400).render('erreur', { user: req.user, message: 'Cochez au moins une consultation à sélectionner.' });
  }
  const incompletes = [];
  const retenues = [];
  for (const cid of idsSel) {
    const c = db.prepare('SELECT * FROM consultations WHERE id = ? AND ticket_id = ?').get(cid, ticket.id);
    if (!c || c.caduque || c.validee || !consultationSelectionnable(db, c)) {
      const e = c && c.entreprise_id ? db.prepare('SELECT raison_sociale FROM entreprises WHERE id = ?').get(c.entreprise_id) : null;
      incompletes.push(e ? e.raison_sociale : `#${cid}`);
      continue;
    }
    retenues.push(c);
  }
  if (incompletes.length > 0) {
    return res.status(400).render('erreur', {
      user: req.user,
      message: `Consultation(s) non sélectionnable(s) : ${incompletes.join(', ')} — il faut une fiche entreprise strictement complète (raison sociale, SIREN/SIRET, contact, téléphone, mail) et exactement 1 devis (pièce jointe + montant > 0).`
    });
  }
  const noms = [];
  for (const c of retenues) {
    db.prepare('UPDATE consultations SET validee = 1, updated_at = datetime(\'now\') WHERE id = ?').run(c.id);
    const e = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(c.entreprise_id);
    noms.push(e.raison_sociale);
    envoyerMailDatesSelection(db, ticket, c, req.user);
  }
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'selection', ?, ?)")
    .run(ticket.id, req.user.id, `${req.user.nom} a sélectionné ${retenues.length} consultation(s) (${noms.join(', ')}) — en attente des dates d'intervention`);
  notifierCS('selection', `Consultation(s) sélectionnée(s) pour le ticket « ${ticket.titre} » (${noms.join(', ')}) — mails de planification envoyés aux prestataires`, ticket.id, req.user.id);
  res.redirect('/tickets/' + ticket.id + '#consultations');
});

// Passage en « Travaux planifiés » : action dédiée du CS/admin à l'étape
// « consultation ». Impossible si aucune consultation n'est sélectionnée, ou si
// l'une d'elles n'est pas complète avec une date acceptée (renseignée à la
// main par le CS, ou proposition du prestataire validée par le CS / un occupant).
router.post('/:id/travaux-planifies', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical peut passer un ticket en travaux planifiés.' });
  }
  if (ticket.etape !== 'consultation') {
    return res.status(400).render('erreur', { user: req.user, message: 'Le ticket n\'est plus en consultation.' });
  }
  const retenues = db.prepare('SELECT * FROM consultations WHERE ticket_id = ? AND validee = 1 AND caduque = 0 ORDER BY created_at').all(ticket.id);
  if (retenues.length === 0) {
    return res.status(400).render('erreur', { user: req.user, message: 'Sélectionnez d’abord au moins une consultation.' });
  }
  const incompletes = [];
  for (const c of retenues) {
    if (!c.date_planifiee) {
      // adopte une éventuelle date proposée validée
      const prop = db.prepare('SELECT date FROM consultation_dates WHERE consultation_id = ? AND validee = 1 ORDER BY created_at LIMIT 1').get(c.id);
      if (prop) db.prepare("UPDATE consultations SET date_planifiee = ?, updated_at = datetime('now') WHERE id = ?").run(prop.date, c.id);
    }
    const maj = db.prepare('SELECT * FROM consultations WHERE id = ?').get(c.id);
    if (!consultationComplete(db, maj)) {
      const e = db.prepare('SELECT raison_sociale FROM entreprises WHERE id = ?').get(c.entreprise_id);
      incompletes.push(e ? e.raison_sociale : `#${c.id}`);
    }
  }
  if (incompletes.length > 0) {
    return res.status(400).render('erreur', {
      user: req.user,
      message: `Impossible de passer en « Travaux planifiés » : ${incompletes.join(', ')} — chaque consultation sélectionnée doit avoir une fiche entreprise strictement complète, 1 devis et une date acceptée (renseignée à la main ou validée parmi les propositions du prestataire).`
    });
  }
  const noms = retenues.map(c => {
    const e = db.prepare('SELECT raison_sociale FROM entreprises WHERE id = ?').get(c.entreprise_id);
    const maj = db.prepare('SELECT date_planifiee FROM consultations WHERE id = ?').get(c.id);
    return `${e.raison_sociale} (date ${maj.date_planifiee})`;
  }).join(', ');
  faireTransition(db, ticket, 'intervention_planifiee', req.user.id, `Consultation(s) sélectionnée(s) avec date(s) acceptée(s) (${noms}) — travaux planifiés`);
  res.redirect('/tickets/' + ticket.id);
});

// Sollicitation individuelle par email d'une consultation active sans devis
// (sollicitation, ou relance si déjà sollicité — le mail s'adapte).
router.post('/:id/consultations/:cid/solliciter', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical sollicite les prestataires.' });
  }
  if (ticket.etape !== 'consultation') {
    return res.status(400).render('erreur', { user: req.user, message: 'Les sollicitations ne se gèrent qu’à l’étape « En consultation ».' });
  }
  const c = db.prepare('SELECT * FROM consultations WHERE id = ? AND ticket_id = ?').get(Number(req.params.cid), ticket.id);
  if (!c || c.caduque || c.validee) {
    return res.status(400).render('erreur', { user: req.user, message: 'Consultation introuvable ou plus active.' });
  }
  const r = solliciterConsultation(db, ticket, c, req.user);
  if (!r.ok) {
    const msg = r.raison === 'email_manquant'
      ? 'La fiche entreprise n’a pas d’email : renseignez-la d’abord.'
      : 'Un devis a déjà été déposé pour cette consultation.';
    return res.status(400).render('erreur', { user: req.user, message: msg });
  }
  notifierCS('sollicitation', `${r.type === 'relance' ? 'Relance' : 'Sollicitation'} envoyée par email à « ${r.ent.raison_sociale} » pour le ticket « ${ticket.titre} »`, ticket.id, req.user.id);
  res.redirect('/tickets/' + ticket.id + '#consultations');
});

// Sollicitation globale en un clic : toutes les consultations actives sans
// devis dont l'entreprise a un email reçoivent un mail.
router.post('/:id/solliciter', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical sollicite les prestataires.' });
  }
  if (ticket.etape !== 'consultation') {
    return res.status(400).render('erreur', { user: req.user, message: 'Les sollicitations ne se gèrent qu’à l’étape « En consultation ».' });
  }
  const cibles = db.prepare(
    `SELECT c.* FROM consultations c JOIN entreprises e ON e.id = c.entreprise_id
     WHERE c.ticket_id = ? AND c.caduque = 0 AND c.validee = 0 AND TRIM(COALESCE(e.mail,'')) != ''
     ORDER BY c.created_at`
  ).all(ticket.id).filter(c => !db.prepare("SELECT 1 FROM fichiers WHERE consultation_id = ? AND categorie = 'devis'").get(c.id));
  if (cibles.length === 0) {
    return res.status(400).render('erreur', { user: req.user, message: 'Aucune entreprise à solliciter : devis déjà déposé ou email manquant sur la fiche entreprise.' });
  }
  const envoyes = [];
  for (const c of cibles) {
    const r = solliciterConsultation(db, ticket, c, req.user);
    if (r.ok) envoyes.push(r.ent.raison_sociale);
  }
  if (envoyes.length > 0) {
    notifierCS('sollicitation', `Sollicitations envoyées par email pour le ticket « ${ticket.titre} » : ${envoyes.join(', ')}`, ticket.id, req.user.id);
  }
  res.redirect('/tickets/' + ticket.id + '#consultations');
});

// Validation d'une date proposée par le prestataire : membre du CS ou occupant
// des unités concernées. Elle devient la date d'intervention de la consultation.
router.post('/:id/consultations/:cid/dates/:did/valider', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!peutValiderDate(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seuls un membre du conseil syndical ou un occupant des unités concernées peuvent valider une date proposée.' });
  }
  const c = db.prepare('SELECT * FROM consultations WHERE id = ? AND ticket_id = ?').get(Number(req.params.cid), ticket.id);
  if (!c || c.caduque || !c.validee) {
    return res.status(400).render('erreur', { user: req.user, message: 'Consultation introuvable, caduque ou non sélectionnée.' });
  }
  const d = db.prepare('SELECT * FROM consultation_dates WHERE id = ? AND consultation_id = ?').get(Number(req.params.did), c.id);
  if (!d || d.validee) {
    return res.status(400).render('erreur', { user: req.user, message: 'Date introuvable ou déjà validée.' });
  }
  db.prepare('UPDATE consultation_dates SET validee = 1, valide_par = ? WHERE id = ?').run(req.user.id, d.id);
  db.prepare("UPDATE consultations SET date_planifiee = ?, updated_at = datetime('now') WHERE id = ?").run(d.date, c.id);
  const ent = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(c.entreprise_id);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'date_validee', ?, ?)")
    .run(ticket.id, req.user.id, `${req.user.nom} a retenu la date proposée du ${d.date}${d.heure ? ` à ${d.heure}` : ''} pour « ${ent.raison_sociale} »`);
  notifierDateRetenue(db, ticket, ent, d.date, d.heure, req.user.id);
  res.redirect('/tickets/' + ticket.id + '#consultations');
});

// Modification d'une consultation (entreprise, date, remplacement du devis).
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
  if (!c || c.caduque) {
    return res.status(400).render('erreur', { user: req.user, message: 'Cette consultation n\'est plus modifiable (lecture seule).' });
  }
  upload.array('devis_fichiers', 1)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    const { entreprise_id, date_planifiee } = req.body;
    if (c.validee) {
      // Consultation sélectionnée : seule la date d'intervention reste
      // renseignable à la main (l'échange a eu lieu hors outil) — elle est
      // considérée comme acceptée.
      nettoyerFichiers(req.files);
      if (date_planifiee && date_planifiee.trim()) {
        db.prepare("UPDATE consultations SET date_planifiee = ?, updated_at = datetime('now') WHERE id = ?").run(date_planifiee.trim(), c.id);
        const ent = db.prepare('SELECT raison_sociale FROM entreprises WHERE id = ?').get(c.entreprise_id);
        db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'consultation', ?, ?)")
          .run(ticket.id, req.user.id, `${req.user.nom} a renseigné la date d'intervention (${date_planifiee.trim()}) pour « ${ent.raison_sociale} »`);
      }
      return res.redirect('/tickets/' + ticket.id + '#consultations');
    }
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
      if (!(Number(devis[0].montant) > 0)) {
        nettoyerFichiers(req.files);
        return res.status(400).render('erreur', { user: req.user, message: 'Le devis doit avoir un montant supérieur à 0.' });
      }
      // 1 seul devis par consultation : le nouveau remplace l'ancien (fichier + ligne).
      const anciens = db.prepare("SELECT nom_stockage FROM fichiers WHERE consultation_id = ? AND categorie = 'devis'").all(c.id);
      for (const f of anciens) {
        const chemin = path.join(UPLOAD_DIR, f.nom_stockage);
        if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
      }
      db.prepare("DELETE FROM fichiers WHERE consultation_id = ? AND categorie = 'devis'").run(c.id);
      enregistrerDevis(db, ticket.id, c.id, devis.map(d => ({ fichier: d.fichier, montant: Number(d.montant) })), req.user.id);
      db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'consultation', ?, ?)")
        .run(ticket.id, req.user.id, `${req.user.nom} a remplacé le devis d'une consultation`);
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

// Sélection individuelle d'une consultation : elle passe « sélectionnée »
// (validee) et un mail de planification des dates est envoyé à l'entreprise.
// Le ticket RESTE en « consultation » : le passage en « Travaux planifiés »
// se fait ensuite via POST /travaux-planifies, une fois la date acceptée.
router.post('/:id/consultations/:cid/valider', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical peut sélectionner une consultation.' });
  }
  if (ticket.etape !== 'consultation') {
    return res.status(400).render('erreur', { user: req.user, message: 'Le ticket n\'est plus en consultation.' });
  }
  const c = db.prepare('SELECT * FROM consultations WHERE id = ? AND ticket_id = ?').get(Number(req.params.cid), ticket.id);
  if (!c || c.caduque) {
    return res.status(400).render('erreur', { user: req.user, message: 'Consultation introuvable ou caduque.' });
  }
  if (c.validee) return res.redirect('/tickets/' + ticket.id + '#consultations');
  if (!consultationSelectionnable(db, c)) {
    return res.status(400).render('erreur', {
      user: req.user,
      message: 'La consultation doit être complète : fiche entreprise strictement complète (raison sociale, SIREN/SIRET, contact, téléphone, mail) et 1 devis (pièce jointe + montant > 0).'
    });
  }
  db.prepare('UPDATE consultations SET validee = 1, updated_at = datetime(\'now\') WHERE id = ?').run(c.id);
  const ent = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(c.entreprise_id);
  envoyerMailDatesSelection(db, ticket, c, req.user);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'selection', ?, ?)")
    .run(ticket.id, req.user.id, `${req.user.nom} a sélectionné la consultation « ${ent.raison_sociale} » — en attente de la date d'intervention`);
  notifierCS('selection', `Consultation « ${ent.raison_sociale} » sélectionnée pour le ticket « ${ticket.titre} » — mail de planification envoyé au prestataire`, ticket.id, req.user.id);
  res.redirect('/tickets/' + ticket.id + '#consultations');
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
    enregistrerAction('fichier_ajoute', req.user.id, 'ticket', ticket.id,
      `Facture ajoutée : ${req.file.originalname} (${montant.toFixed(2)} €)`);
    res.redirect('/tickets/' + ticket.id + '#factures');
  });
});
// Acceptation des travaux (planifie -> acceptes), spec 28 : un SEUL acceptant
// au total suffit (occupant d'une unite concernee ou membre du CS — admin
// exclu du quorum). Commentaire et photos facultatifs. AUCUNE facture requise
// en v1 (reception des travaux « en sommeil », spec 28).
router.post('/:id/accepter', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!peutAccepterRefuser(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seuls les occupants des unités concernées et les membres du conseil syndical peuvent accepter ou refuser les travaux.' });
  }
  upload.array('photos', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    // spec 31 : la zone unique du bilan envoie « contenu » ; le commentaire d'acceptation en hérite.
    const commentaire = (req.body.commentaire ?? req.body.contenu ?? '').trim();
    db.prepare('INSERT OR IGNORE INTO resolutions (ticket_id, user_id, commentaire, caduque) VALUES (?, ?, ?, 0)')
      .run(ticket.id, req.user.id, commentaire);
    db.prepare('UPDATE resolutions SET commentaire = ? WHERE ticket_id = ? AND user_id = ? AND caduque = 0')
      .run(commentaire, ticket.id, req.user.id);
    // Photos : moment cadre n°2 = l'acceptation des travaux (facultative).
    if ((req.files || []).length > 0) {
      enregistrerFichiers(db, ticket.id, 'photo', req.files, {}, req.user.id, 'validation');
    }
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'resolution', ?, ?)")
      .run(ticket.id, req.user.id, `${req.user.nom} a accepté les travaux${commentaire ? ` — « ${commentaire.slice(0, 120)} »` : ''}${(req.files || []).length ? ` (${req.files.length} photo(s))` : ''}`);
    // Un seul acceptant suffit -> passage immédiat en « travaux acceptés ».
    db.prepare("UPDATE tickets SET etape = 'travaux_acceptes', acceptes_at = datetime('now'), notif_archive_j3 = 0, notif_archive_j1 = 0, updated_at = datetime('now') WHERE id = ?").run(ticket.id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu, donnees) VALUES (?, 'changement_etape', ?, ?, ?)")
      .run(ticket.id, req.user.id, 'Passage à « Travaux acceptés » (un seul acceptant a suffi)', JSON.stringify({ etape: 'travaux_acceptes' }));
    enregistrerAction('ticket_etape', req.user.id, 'ticket', ticket.id, 'Passage à « Travaux acceptés »');
    const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
    notifierTicket(t, 'changement_etape', `Le ticket « ${t.titre} » passe à l'étape « Travaux acceptés »`, req.user.id, !!t.urgent);
    res.redirect('/tickets/' + ticket.id);
  });
});

// Refus des travaux (planifie -> consultation), spec 28 : tout occupant d'une
// unite du ticket ou membre du CS peut refuser, avec commentaire obligatoire
// et au moins une photo obligatoire. Consultations et acceptations precedentes
// caduques ; on passe au cycle suivant (les bilans du cycle sont figes
// definitivement en lecture seule).
router.post('/:id/refuser', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!peutAccepterRefuser(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seuls les occupants des unités concernées et les membres du conseil syndical peuvent refuser les travaux.' });
  }
  upload.array('photos', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    // spec 31 : le refus exige au moins un commentaire OU une photo (l'un des deux suffit).
    const commentaire = (req.body.commentaire ?? req.body.contenu ?? '').trim();
    if (!commentaire && (req.files || []).length === 0) {
      nettoyerFichiers(req.files);
      return res.status(400).render('erreur', { user: req.user, message: 'Un commentaire ou au moins une photo est obligatoire pour refuser les travaux.' });
    }
    // Photos : moment cadre n°4 = le refus des travaux.
    enregistrerFichiers(db, ticket.id, 'photo', req.files, {}, req.user.id, 'refus');
    db.prepare('UPDATE consultations SET caduque = 1 WHERE ticket_id = ?').run(ticket.id);
    db.prepare('UPDATE resolutions SET caduque = 1 WHERE ticket_id = ?').run(ticket.id);
    db.prepare("UPDATE tickets SET etape = 'consultation', acceptes_at = NULL, cycle = cycle + 1, notif_archive_j3 = 0, notif_archive_j1 = 0, updated_at = datetime('now') WHERE id = ?").run(ticket.id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu, donnees) VALUES (?, 'changement_etape', ?, ?, ?)")
      .run(ticket.id, req.user.id, `Travaux refusés par ${req.user.nom} — retour en consultation — « ${commentaire.slice(0, 120)} » (${req.files.length} photo(s)) ; consultations et acceptations précédentes caduques, bilans figés (cycle suivant)`, JSON.stringify({ etape: 'consultation' }));
    enregistrerAction('ticket_etape', req.user.id, 'ticket', ticket.id, 'Travaux refusés — retour en « En consultation » (cycle suivant)');
    const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
    notifierTicket(t, 'changement_etape', `Le ticket « ${t.titre} » est refusé et repasse en « En consultation »`, req.user.id, !!t.urgent);
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
    enregistrerFichiers(db, ticket.id, 'photo', req.files, {}, req.user.id, 'reouverture');
    db.prepare('UPDATE consultations SET caduque = 1 WHERE ticket_id = ?').run(ticket.id);
    db.prepare('UPDATE resolutions SET caduque = 1 WHERE ticket_id = ?').run(ticket.id);
    db.prepare("UPDATE tickets SET etape = 'consultation', acceptes_at = NULL, cycle = cycle + 1, notif_archive_j3 = 0, notif_archive_j1 = 0, updated_at = datetime('now') WHERE id = ?").run(ticket.id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu, donnees) VALUES (?, 'changement_etape', ?, ?, ?)")
      .run(ticket.id, req.user.id, `Ticket rouvert par ${req.user.nom} — retour en consultation — « ${commentaire.slice(0, 120)} » (${req.files.length} photo(s)) ; consultations et validations précédentes caduques`, JSON.stringify({ etape: 'consultation' }));
    enregistrerAction('ticket_etape', req.user.id, 'ticket', ticket.id, 'Ticket rouvert — retour en « En consultation »');
    const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
    notifierTicket(t, 'changement_etape', `Le ticket « ${t.titre} » est rouvert et repasse en « En consultation »`, req.user.id, !!t.urgent);
    res.redirect('/tickets/' + ticket.id);
  });
});

// Archivage : a tout moment par le CS/admin, sans condition de facture (spec 24).
router.post('/:id/archiver', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical peut archiver un ticket.' });
  }
  if (ticket.etape === 'archive') return res.redirect('/tickets/' + ticket.id);
  faireTransition(db, ticket, 'archive', req.user.id, 'Ticket archivé manuellement');
  res.redirect('/tickets/' + ticket.id);
});

// Toggle « urgent » (spec 31) : uniquement a l'etape « cree », par les acteurs
// du ticket (occupants des unites concernees, CS, admin).
router.post('/:id/urgent', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!peutToggleUrgent(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Le caractère urgent n\'est modifiable qu\'à l\'étape « Créé », par un occupant des unités concernées, un membre du conseil syndical ou l\'admin.' });
  }
  const urgent = req.body.urgent ? 1 : 0;
  if (ticket.urgent !== urgent) {
    db.prepare("UPDATE tickets SET urgent = ?, updated_at = datetime('now') WHERE id = ?").run(urgent, ticket.id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'edition', ?, ?)")
      .run(ticket.id, req.user.id, `${req.user.nom} a ${urgent ? 'marqué le ticket comme URGENT' : 'retiré le caractère urgent du ticket'}`);
    enregistrerAction('ticket_modifie', req.user.id, 'ticket', ticket.id, urgent ? 'Ticket marqué URGENT' : 'Caractère urgent retiré');
  }
  res.redirect('/tickets/' + ticket.id);
});

// Ajout de photos a la section Description (spec 31) : aux etapes
// « cree » et « consultation » (jusqu'au debut des travaux), par toute
// personne concernee (occupant, CS, admin).
router.post('/:id/photos', (req, res) => {
  const db = getDb();
  const ticket = trouverTicket(req, res);
  if (!ticket) return;
  if (!peutGererPhotosDescription(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Les photos de la description ne sont ajoutables qu\'aux étapes « Créé » et « En consultation » (jusqu\'au début des travaux), par une personne concernée.' });
  }
  upload.array('photos', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    if ((req.files || []).length > 0) {
      enregistrerFichiers(db, ticket.id, 'photo', req.files, {}, req.user.id, 'creation');
      db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'fichier', ?, ?)")
        .run(ticket.id, req.user.id, `${req.user.nom} a ajouté ${req.files.length} photo(s) à la description`);
    }
    res.redirect('/tickets/' + ticket.id + '#description');
  });
});

router.post('/:id/unites', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (!peutEditerUnites(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Les unités ne sont modifiables qu\'aux étapes « Créé » et « En consultation » (jusqu\'au passage en « Travaux planifiés »), par le déclarant, les résidents concernés, le conseil syndical ou l\'admin.' });
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
  enregistrerAction('ticket_modifie', req.user.id, 'ticket', id, `Unités modifiées : ${labels}`);
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
    enregistrerAction('ticket_modifie', req.user.id, 'ticket', id, 'Description modifiée');
  }
  res.redirect('/tickets/' + id);
});

// Compte-rendu d'intervention : UNE instance par personne concernée
// (cle ticket_id + user_id), rédigée par soi-même. Des photos peuvent être
// jointes lors de la saisie (contexte 'compte_rendu'). Visible à partir de
// « Travaux planifiés ».
router.post('/:id/cr', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (!peutRedigerCR(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seules les personnes concernées (résidents des unités, membres du CS — admin exclu) peuvent rédiger leur bilan, à partir de « Travaux planifiés ».' });
  }
  upload.array('photos', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    const contenu = (req.body.contenu || '').trim();
    if (!contenu && (req.files || []).length === 0) {
      for (const f of req.files || []) fs.unlinkSync(f.path);
      return res.redirect('/tickets/' + id + '#cr');
    }
    // Bilan du cycle en cours uniquement (spec 28) : les bilans des cycles
    // passes restent figes en lecture seule.
    const cycle = ticket.cycle || 1;
    const existe = db.prepare('SELECT id FROM comptes_rendus WHERE ticket_id = ? AND user_id = ? AND cycle = ?').get(id, req.user.id, cycle);
    if (existe) {
      db.prepare("UPDATE comptes_rendus SET contenu = ?, auteur_id = ?, updated_at = datetime('now') WHERE id = ?")
        .run(contenu, req.user.id, existe.id);
    } else {
      db.prepare('INSERT INTO comptes_rendus (ticket_id, user_id, cycle, contenu, auteur_id) VALUES (?, ?, ?, ?, ?)')
        .run(id, req.user.id, cycle, contenu, req.user.id);
    }
    // Photos saisies avec le compte-rendu (contexte 'compte_rendu').
    if ((req.files || []).length > 0) {
      enregistrerFichiers(db, id, 'photo', req.files, {}, req.user.id, 'compte_rendu', cycle);
    }
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'compte_rendu', ?, ?)")
      .run(id, req.user.id, `${req.user.nom} a rédigé son bilan de l’intervention${(req.files || []).length ? ` (${req.files.length} photo(s))` : ''}`);
    res.redirect('/tickets/' + id + '#cr');
  });
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
  enregistrerAction('ticket_supprime', req.user.id, 'ticket', id, `Ticket supprimé : « ${ticket.titre.slice(0, 120)} »`);
  db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  res.redirect('/tickets');
});

module.exports = { router, listeTickets, detailTicket };
