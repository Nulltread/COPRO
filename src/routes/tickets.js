const express = require('express');
const fs = require('fs');
const { getDb } = require('../db');
const { requireAuth, requireGestion } = require('../auth');
const {
  isGestionnaire, isAdmin, unitsDeUser, peutVoirTicket, peutChoisirUnites,
  estResidentConcerne, peutEditerTicket, peutSupprimerTicket, peutReouvrir,
  ETAPES, ETIQUETTES_ETAPES, transitionValide
} = require('../droits');
const { notifierTicket } = require('../notifications');
const { upload, enregistrerFichiers } = require('../upload');

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
  let sql = `SELECT t.*, GROUP_CONCAT(u.type || ' ' || u.numero, ', ') AS unites
             FROM tickets t
             LEFT JOIN ticket_units tu ON tu.ticket_id = t.id
             LEFT JOIN units u ON u.id = tu.unit_id`;
  const params = [];
  const where = [];
  if (filtres.unite && filtres.unite !== 'toutes') {
    where.push('tu.unit_id = ?');
    params.push(Number(filtres.unite));
  } else if (!filtres.unite) {
    // Filtre par defaut : les unites du resident (lecture ouverte sinon).
    const mesUnites = unitsDeUser(user.id);
    if (mesUnites.length > 0) {
      where.push(`t.id IN (SELECT ticket_id FROM ticket_units WHERE unit_id IN (${mesUnites.map(() => '?').join(',')}))`);
      params.push(...mesUnites);
    }
  }
  if (filtres.etape) { where.push('t.etape = ?'); params.push(filtres.etape); }
  else { where.push("t.etape != 'archive'"); } // par défaut, les tickets archivés sont masqués
  if (filtres.urgent === '1') { where.push('t.urgent = 1'); }
  const coutMin = Number(filtres.cout_min);
  if (filtres.cout_min && !Number.isNaN(coutMin) && coutMin > 0) {
    where.push(`t.id IN (SELECT ticket_id FROM fichiers WHERE categorie IN ('devis','avenant') AND retenu = 1 GROUP BY ticket_id HAVING COALESCE(SUM(montant),0) >= ?)`);
    params.push(coutMin);
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
  const unitesIds = unites.map(u => u.id);
  const coutRetenu = db.prepare(
    `SELECT COALESCE(SUM(montant), 0) AS total FROM fichiers
     WHERE ticket_id = ? AND categorie IN ('devis','avenant') AND retenu = 1`
  ).get(id).total;
  const totalFacture = db.prepare(
    `SELECT COALESCE(SUM(montant), 0) AS total FROM fichiers WHERE ticket_id = ? AND categorie = 'facture'`
  ).get(id).total;
  const resolutions = db.prepare(
    `SELECT r.*, u.nom AS auteur_nom FROM resolutions r LEFT JOIN users u ON u.id = r.user_id
     WHERE r.ticket_id = ? ORDER BY r.created_at`
  ).all(id);
  const residents = residentsConcernes(id);
  const comptesRendus = db.prepare(
    `SELECT cr.*, u.label AS unite_label, a.nom AS auteur_nom FROM comptes_rendus cr
     LEFT JOIN units u ON u.id = cr.unit_id
     LEFT JOIN users a ON a.id = cr.auteur_id
     WHERE cr.ticket_id = ? ORDER BY cr.unit_id IS NULL, u.type DESC, u.numero`
  ).all(id);
  return { ticket, unites, evenements, fichiers, coutRetenu, totalFacture, unitesIds, resolutions, residents, comptesRendus };
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
  if ((req.files || []).length > 0) {
    enregistrerFichiers(db, tid, 'photo', req.files, {}, req.user.id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'fichier', ?, ?)")
      .run(tid, req.user.id, `${req.user.nom} a ajouté ${req.files.length} photo(s)`);
  }
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(tid);
  notifierTicket(t, 'creation', `${req.user.nom} a déclaré un nouveau ticket${urgent ? ' URGENT' : ''} : « ${titre.trim()} »`, req.user.id, !!urgent);
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
    peutReouvrir: peutReouvrir(req.user, d.ticket),
    estConcerne: estResidentConcerne(req.user, d.ticket.id) || isGestionnaire(req.user),
    categoriesFichier: ['photo', 'devis', 'avenant', 'facture', 'decision', 'compte_rendu'],
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
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  notifierTicket(t, 'commentaire', `${req.user.nom} a commenté : « ${contenu.slice(0, 80)} »`, req.user.id, !!t.urgent);
  res.redirect('/tickets/' + id + '#fil');
});

router.post('/:id/transition', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  const cible = req.body.etape;
  const motif = (req.body.motif || '').trim();
  if (isGestionnaire(req.user)) {
    // En v1 le conseil syndical passe le ticket a n'importe quel etat.
    if (!transitionValide(ticket.etape, cible)) {
      return res.status(400).render('erreur', {
        user: req.user,
        message: `Passage de « ${ETIQUETTES_ETAPES[ticket.etape]} » à « ${ETIQUETTES_ETAPES[cible] || cible} » non autorisé.`
      });
    }
  } else {
    // Un resident ne peut que rouvrir un ticket archive (retour a l'etat d'avant consultation).
    if (!peutReouvrir(req.user, ticket) || cible !== ticket.etape_avant_consultation) {
      return res.status(403).render('erreur', { user: req.user, message: 'Seul le conseil syndical peut changer l\'état d\'un ticket (les résidents peuvent rouvrir un ticket archivé).' });
    }
  }
  const ancienne = ticket.etape;
  db.prepare("UPDATE tickets SET etape = ?, updated_at = datetime('now') WHERE id = ?").run(cible, id);
  if (cible === 'consultation' && ancienne !== 'consultation') {
    db.prepare("UPDATE tickets SET etape_avant_consultation = ? WHERE id = ?").run(ancienne, id);
  }
  const label = ETIQUETTES_ETAPES[cible];
  const contenu = cible === ticket.etape_avant_consultation && ancienne === 'archive'
    ? `Ticket rouvert — retour à l'étape « ${label} »`
    : `Passage à l'étape « ${label} »`;
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'changement_etape', ?, ?)")
    .run(id, req.user.id, motif ? `${contenu} — motif : ${motif}` : contenu);
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  notifierTicket(t, 'changement_etape', `Le ticket « ${t.titre} » passe à l'étape « ${label} »${motif ? ` (motif : ${motif})` : ''}`, req.user.id, !!t.urgent);
  res.redirect('/tickets/' + id);
});

router.post('/:id/decision', requireGestion, (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  const { fichier_id, justification } = req.body;
  const fichier = db.prepare("SELECT * FROM fichiers WHERE id = ? AND ticket_id = ? AND categorie IN ('devis','avenant')").get(Number(fichier_id), id);
  if (!fichier) return res.status(400).render('erreur', { user: req.user, message: 'Devis introuvable.' });
  db.prepare('UPDATE fichiers SET retenu = 0 WHERE ticket_id = ? AND categorie = ?').run(id, fichier.categorie);
  db.prepare('UPDATE fichiers SET retenu = 1 WHERE id = ?').run(fichier.id);
  const donnees = JSON.stringify({ fichier_id: fichier.id, montant: fichier.montant, entreprise: fichier.entreprise, justification: (justification || '').trim() });
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu, donnees) VALUES (?, 'decision', ?, ?, ?)")
    .run(id, req.user.id, `Décision : ${fichier.categorie === 'avenant' ? 'avenant' : 'devis'} retenu (${fichier.entreprise || 'entreprise non précisée'}, ${fichier.montant != null ? fichier.montant + ' €' : 'montant non précisé'})${(justification || '').trim() ? ' — ' + justification.trim() : ''}`, donnees);
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  notifierTicket(t, 'decision', `Décision enregistrée sur « ${t.titre} » : ${fichier.entreprise || 'devis retenu'}`, req.user.id, !!t.urgent);
  res.redirect('/tickets/' + id);
});

router.post('/:id/unites', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (!(peutEditerTicket(req.user, ticket))) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le déclarant ou le conseil syndical peut modifier les unités du ticket.' });
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
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  notifierTicket(t, 'changement_etape', `Les unités du ticket « ${t.titre} » ont été modifiées : ${labels}`, req.user.id, !!t.urgent);
  res.redirect('/tickets/' + id);
});

router.post('/:id/editer', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (!peutEditerTicket(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Vous ne pouvez pas modifier ce ticket.' });
  }
  upload.array('fichiers', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    const nouvelleDescription = (req.body.description || '').trim();
    const parties = [];
    if (nouvelleDescription !== ticket.description) {
      db.prepare("UPDATE tickets SET description = ?, updated_at = datetime('now') WHERE id = ?").run(nouvelleDescription, id);
      parties.push('description modifiée');
    }
    if ((req.files || []).length > 0) {
      enregistrerFichiers(db, id, 'photo', req.files, {}, req.user.id);
      parties.push(`${req.files.length} photo(s) ajoutée(s)`);
    }
    if (parties.length > 0) {
      db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'edition', ?, ?)")
        .run(id, req.user.id, `${req.user.nom} a modifié le ticket (${parties.join(', ')})`);
      const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
      notifierTicket(t, 'edition', `${req.user.nom} a modifié « ${t.titre} » (${parties.join(', ')})`, req.user.id, !!t.urgent);
    }
    res.redirect('/tickets/' + id);
  });
});

router.post('/:id/resolution', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (ticket.etape !== 'travaux_acceptes') {
    return res.status(400).render('erreur', { user: req.user, message: 'La résolution n\'est possible qu\'au stade « Travaux acceptés ».' });
  }
  if (!isGestionnaire(req.user) && !estResidentConcerne(req.user, id)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seuls les résidents concernés peuvent accepter la résolution.' });
  }
  db.prepare('INSERT OR IGNORE INTO resolutions (ticket_id, user_id) VALUES (?, ?)').run(id, req.user.id);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'resolution', ?, ?)")
    .run(id, req.user.id, `${req.user.nom} a accepté la résolution (travaux acceptés)`);
  let archive = false;
  if (isGestionnaire(req.user)) {
    archive = true;
  } else {
    const concernes = residentsConcernes(id);
    const acceptes = new Set(db.prepare('SELECT user_id FROM resolutions WHERE ticket_id = ?').all(id).map(r => r.user_id));
    archive = concernes.length > 0 && concernes.every(r => acceptes.has(r.id));
  }
  if (archive) {
    db.prepare("UPDATE tickets SET etape = 'archive', updated_at = datetime('now') WHERE id = ?").run(id);
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'changement_etape', ?, ?)")
      .run(id, req.user.id, 'Ticket archivé — résolution acceptée');
  }
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  notifierTicket(t, 'resolution', archive
    ? `La résolution de « ${t.titre} » est acceptée, le ticket est archivé.`
    : `${req.user.nom} a accepté la résolution de « ${t.titre} »`, req.user.id, !!t.urgent);
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
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  notifierTicket(t, 'compte_rendu', `${req.user.nom} a rédigé un compte-rendu d'intervention sur « ${t.titre} »`, req.user.id, !!t.urgent);
  res.redirect('/tickets/' + id + '#cr');
});

router.post('/:id/supprimer', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  if (!peutSupprimerTicket(req.user, ticket)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul le créateur peut supprimer son ticket, et uniquement s\'il n\'a jamais évolué.' });
  }
  db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  res.redirect('/tickets');
});

module.exports = { router, listeTickets, detailTicket };
