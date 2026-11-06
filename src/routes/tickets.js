const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const {
  isGestionnaire, isAdmin, unitsDeUser, peutVoirTicket,
  categoriesTicket, ETAPES, ETIQUETTES_ETAPES, transitionValide
} = require('../droits');
const { notifierTicket } = require('../notifications');
const { upload, enregistrerFichiers } = require('../upload');

const router = express.Router();
router.use(requireAuth);

function listeTickets(user, filtres = {}) {
  const db = getDb();
  let sql, params;
  if (isGestionnaire(user) || isAdmin(user)) {
    sql = `SELECT t.*, GROUP_CONCAT(u.type || ' ' || u.numero, ', ') AS unites
           FROM tickets t
           LEFT JOIN ticket_units tu ON tu.ticket_id = t.id
           LEFT JOIN units u ON u.id = tu.unit_id`;
    params = [];
  } else {
    const mesUnites = unitsDeUser(user.id);
    if (mesUnites.length === 0) return [];
    sql = `SELECT DISTINCT t.*, GROUP_CONCAT(u.type || ' ' || u.numero, ', ') AS unites
           FROM tickets t
           JOIN ticket_units tu ON tu.ticket_id = t.id
           JOIN units u ON u.id = tu.unit_id
           JOIN unit_residents ur ON ur.unit_id = tu.unit_id AND ur.user_id = ?`;
    params = [user.id];
  }
  const where = [];
  if (filtres.etape) { where.push('t.etape = ?'); params.push(filtres.etape); }
  if (filtres.categorie) { where.push('t.categorie = ?'); params.push(filtres.categorie); }
  if (filtres.unite) { where.push('tu.unit_id = ?'); params.push(Number(filtres.unite)); }
  if (filtres.urgent === '1') { where.push('t.urgent = 1'); }
  const coutMin = Number(filtres.cout_min);
  if (filtres.cout_min && !Number.isNaN(coutMin) && coutMin > 0) {
    where.push(`t.id IN (SELECT ticket_id FROM fichiers WHERE categorie IN ('devis','avenant') AND retenu = 1 GROUP BY ticket_id HAVING COALESCE(SUM(montant),0) >= ?)`);
    params.push(coutMin);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' GROUP BY t.id ORDER BY t.urgent DESC, t.updated_at DESC';
  return db.prepare(sql).all(...params);
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
    `SELECT f.*, u.nom AS auteur_nom FROM fichiers f JOIN users u ON u.id = f.auteur_id
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
  return { ticket, unites, evenements, fichiers, coutRetenu, totalFacture, unitesIds };
}

router.get('/', (req, res) => {
  const tickets = listeTickets(req.user, req.query);
  const db = getDb();
  const unitesFiltre = (isGestionnaire(req.user) || isAdmin(req.user))
    ? db.prepare('SELECT * FROM units ORDER BY type DESC, numero').all()
    : db.prepare(
        `SELECT u.* FROM units u JOIN unit_residents ur ON ur.unit_id = u.id WHERE ur.user_id = ? ORDER BY u.type DESC, u.numero`
      ).all(req.user.id);
  res.render('tickets', {
    user: req.user, tickets,
    categories: categoriesTicket(),
    etapes: ETAPES, etiquettes: ETIQUETTES_ETAPES, unitesFiltre,
    filtres: req.query, gestionnaire: isGestionnaire(req.user) || isAdmin(req.user),
    nonLues: require('../notifications').nonLues(req.user.id)
  });
});

router.get('/nouveau', (req, res) => {
  const db = getDb();
  let unites;
  if (isGestionnaire(req.user) || isAdmin(req.user)) {
    unites = db.prepare('SELECT * FROM units ORDER BY type DESC, numero').all();
  } else {
    unites = db.prepare(
      `SELECT u.* FROM units u JOIN unit_residents ur ON ur.unit_id = u.id WHERE ur.user_id = ? ORDER BY u.type DESC, u.numero`
    ).all(req.user.id);
  }
  res.render('ticket-form', {
    user: req.user, unites, categories: categoriesTicket(),
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
  const { titre, description, categorie, urgent, unite_ids } = req.body;
  const ids = Array.isArray(unite_ids) ? unite_ids : [unite_ids].filter(Boolean);
  const erreur = !titre || !categorie || ids.length === 0
    ? 'Merci de donner un titre, une catégorie et au moins une villa/garage concernée.' : null;
  if (erreur) {
    for (const f of req.files || []) require('fs').unlinkSync(f.path);
    const unites = db.prepare('SELECT * FROM units ORDER BY type DESC, numero').all();
    return res.status(400).render('ticket-form', {
      user: req.user, unites, categories: categoriesTicket(),
      ticket: req.body, erreur, nonLues: require('../notifications').nonLues(req.user.id)
    });
  }
  if (!isGestionnaire(req.user) && !isAdmin(req.user)) {
    const mesUnites = new Set(unitsDeUser(req.user.id));
    if (!ids.every(id => mesUnites.has(Number(id)))) {
      for (const f of req.files || []) require('fs').unlinkSync(f.path);
      return res.status(403).render('erreur', { user: req.user, message: 'Vous ne pouvez déclarer un ticket que pour votre propre villa/garage.' });
    }
  }
  const info = db.prepare(
    'INSERT INTO tickets (titre, description, categorie, etape, urgent, auteur_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(titre.trim(), (description || '').trim(), categorie, 'declaration', urgent ? 1 : 0, req.user.id);
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
  res.render('ticket-detail', {
    user: req.user, ...d,
    etapes: ETAPES, etiquettes: ETIQUETTES_ETAPES,
    gestionnaire: isGestionnaire(req.user),
    categoriesFichier: ['photo', 'devis', 'avenant', 'facture', 'decision', 'compte_rendu'],
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

router.post('/:id/transition', requireRole('syndic', 'conseil'), (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  const cible = req.body.etape;
  const motif = (req.body.motif || '').trim();
  if (!transitionValide(ticket.etape, cible)) {
    return res.status(400).render('erreur', {
      user: req.user,
      message: `Passage de « ${ETIQUETTES_ETAPES[ticket.etape]} » à « ${ETIQUETTES_ETAPES[cible] || cible} » non autorisé.`
    });
  }
  if (ticket.etape === 'reception' && cible === 'planification' && !motif) {
    return res.status(400).render('erreur', { user: req.user, message: 'Merci d\'indiquer le motif du retour en planification.' });
  }
  db.prepare("UPDATE tickets SET etape = ?, updated_at = datetime('now') WHERE id = ?").run(cible, id);
  const label = ETIQUETTES_ETAPES[cible];
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'changement_etape', ?, ?)")
    .run(id, req.user.id, motif
      ? `Retour à l'étape « ${label} » — motif : ${motif}`
      : `Passage à l'étape « ${label} »`);
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  notifierTicket(t, 'changement_etape', `Le ticket « ${t.titre} » passe à l'étape « ${label} »${motif ? ` (motif : ${motif})` : ''}`, req.user.id, !!t.urgent);
  res.redirect('/tickets/' + id);
});

router.post('/:id/decision', requireRole('syndic', 'conseil'), (req, res) => {
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

module.exports = { router, listeTickets, detailTicket };
