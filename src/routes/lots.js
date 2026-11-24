const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const { isGestionnaire, isAdmin } = require('../droits');
const { notifierUser, notifierCS } = require('../notifications');
const { envoyerMailResetAvecLimite } = require('../mail');
const { synchroniserAliasCS } = require('../mailcow');

const router = express.Router();
router.use(requireAuth);

function interdit(req, res, msg) {
  return res.status(403).render('erreur', { user: req.user, message: msg });
}

// Onglet « Lots » : lecture CS + admin ; modification des lots eux-mêmes
// (tantièmes, désignation, retrait d'unité) reservee a l'admin ; le rachat
// d'un lot est gere par le CS et l'admin (spec 35).
router.get('/', (req, res) => {
  if (!isGestionnaire(req.user)) return interdit(req, res, 'Action réservée au conseil syndical.');
  const db = getDb();
  const lots = db.prepare(
    `SELECT l.*, u.id AS proprio_id, u.nom AS proprio_nom, u.prenom AS proprio_prenom,
            u.email AS proprio_email, u.statut AS proprio_statut
     FROM lots l LEFT JOIN users u ON u.id = l.user_id
     ORDER BY l.numero`
  ).all();
  const lotUnits = db.prepare(
    `SELECT lu.*, un.label AS unite_label, un.type AS unite_type, un.numero AS unite_numero,
            d.prenom AS demandeur_prenom, d.nom AS demandeur_nom
     FROM lot_units lu
     JOIN units un ON un.id = lu.unit_id
     LEFT JOIN users d ON d.id = lu.demande_par
     ORDER BY lu.lot_id, lu.created_at`
  ).all();
  const parLot = new Map();
  for (const lu of lotUnits) {
    if (!parLot.has(lu.lot_id)) parLot.set(lu.lot_id, []);
    parLot.get(lu.lot_id).push(lu);
  }
  const events = db.prepare(
    `SELECT e.*, u.prenom AS auteur_prenom, u.nom AS auteur_nom, l.numero AS lot_numero
     FROM lot_events e
     LEFT JOIN users u ON u.id = e.auteur_id
     LEFT JOIN lots l ON l.id = e.lot_id
     ORDER BY e.created_at DESC, e.id DESC LIMIT 50`
  ).all();
  res.render('admin-lots', {
    user: req.user, lots, parLot, events,
    isAdmin: isAdmin(req.user),
    message: req.query.message || null,
    erreur: req.query.erreur || null
  });
});

function logEvent(db, lotId, type, auteurId, contenu) {
  db.prepare('INSERT INTO lot_events (lot_id, type, auteur_id, contenu) VALUES (?, ?, ?, ?)').run(lotId, type, auteurId, contenu);
}

// Modification d'un lot (designation, type, tantièmes) : admin seul (spec 35),
// modale de confirmation cote client, loguee avec auteur.
router.post('/:id/modifier', (req, res) => {
  if (!isGestionnaire(req.user)) return interdit(req, res, 'Action réservée au conseil syndical.');
  if (!isAdmin(req.user)) return interdit(req, res, 'La modification des lots est réservée à l\'administrateur.');
  const db = getDb();
  const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(Number(req.params.id));
  if (!lot) return res.redirect('/admin/lots');
  const tantiemes = Number(req.body.tantiemes);
  const designation = (req.body.designation || '').trim();
  const typeLot = (req.body.type_lot || '').trim();
  if (!Number.isInteger(tantiemes) || tantiemes < 0) {
    return res.redirect('/admin/lots?erreur=' + encodeURIComponent('Les tantièmes doivent être un nombre entier positif.'));
  }
  const changements = [];
  if (tantiemes !== lot.tantiemes) changements.push(`tantièmes ${lot.tantiemes} → ${tantiemes}`);
  if (designation && designation !== lot.designation) changements.push(`désignation « ${lot.designation} » → « ${designation} »`);
  if (typeLot && typeLot !== lot.type_lot) changements.push(`type « ${lot.type_lot} » → « ${typeLot} »`);
  db.prepare('UPDATE lots SET designation = ?, type_lot = ?, tantiemes = ? WHERE id = ?')
    .run(designation || lot.designation, typeLot || lot.type_lot, tantiemes, lot.id);
  if (changements.length) logEvent(db, lot.id, 'modification', req.user.id, changements.join(' ; '));
  res.redirect('/admin/lots?message=' + encodeURIComponent(`Lot ${lot.numero} mis à jour.`));
});

// Rachat d'un lot (CS + admin, spec 35) : création du compte de l'acheteur,
// transfert du lot et de ses unités acceptées ; l'ancien compte est désactivé
// définitivement s'il n'a plus aucun rattachement (ni lot, ni locataire).
router.post('/:id/rachat', (req, res) => {
  if (!isGestionnaire(req.user)) return interdit(req, res, 'Le rachat est réservé au conseil syndical.');
  const db = getDb();
  const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(Number(req.params.id));
  if (!lot) return res.redirect('/admin/lots');
  const { nom, prenom, telephone, email } = req.body;
  const mail = (email || '').trim().toLowerCase();
  const retourErreur = (msg) => res.redirect('/admin/lots?erreur=' + encodeURIComponent(msg));
  if (!nom || !nom.trim() || !prenom || !prenom.trim()) return retourErreur('Nom et prénom du nouveau propriétaire sont obligatoires.');
  if (mail) {
    const existe = db.prepare("SELECT id FROM users WHERE email = ? AND statut = 'actif'").get(mail);
    if (existe) return retourErreur('Un compte actif existe déjà avec cet email.');
  }
  const ancien = lot.user_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(lot.user_id) : null;
  let nouveauId;
  db.transaction(() => {
    const info = db.prepare(
      'INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(mail || null, crypto.randomBytes(24).toString('hex'), nom.trim(), prenom.trim(), (telephone || '').trim(), 'resident', 'actif');
    nouveauId = info.lastInsertRowid;
    db.prepare('UPDATE lots SET user_id = ? WHERE id = ?').run(nouveauId, lot.id);
    for (const lu of db.prepare("SELECT * FROM lot_units WHERE lot_id = ? AND statut = 'accepte'").all(lot.id)) {
      if (ancien) db.prepare("DELETE FROM unit_residents WHERE user_id = ? AND unit_id = ? AND qualite = 'proprietaire'").run(ancien.id, lu.unit_id);
      db.prepare("INSERT OR IGNORE INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, 'proprietaire')").run(lu.unit_id, nouveauId);
    }
    if (ancien) {
      const nbLots = db.prepare('SELECT COUNT(*) AS n FROM lots WHERE user_id = ?').get(ancien.id).n;
      const nbUnites = db.prepare('SELECT COUNT(*) AS n FROM unit_residents WHERE user_id = ?').get(ancien.id).n;
      const nbDemandes = db.prepare("SELECT COUNT(*) AS n FROM rattachements WHERE user_id = ? AND statut IN ('en_attente','accepte')").get(ancien.id).n;
      if (nbLots === 0 && nbUnites === 0 && nbDemandes === 0) {
        db.prepare("UPDATE users SET statut = 'desactive', conseil_syndical = 0 WHERE id = ?").run(ancien.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(ancien.id);
      }
    }
    logEvent(db, lot.id, 'rachat', req.user.id,
      `Rachat du lot ${lot.numero} : « ${ancien ? `${ancien.prenom} ${ancien.nom}` : 'sans propriétaire'} » → « ${prenom.trim()} ${nom.trim()} »`);
  })();
  if (ancien) notifierUser(ancien.id, null, 'rachat', `Le lot ${lot.numero} a été cédé à ${prenom.trim()} ${nom.trim()}.`);
  notifierUser(nouveauId, null, 'rachat', `Vous êtes maintenant propriétaire du lot ${lot.numero}.`);
  notifierCS('rachat', `Rachat du lot ${lot.numero} : nouveau propriétaire ${prenom.trim()} ${nom.trim()} (par ${req.user.prenom} ${req.user.nom}).`, null, req.user.id);
  if (mail) envoyerMailResetAvecLimite(db.prepare('SELECT * FROM users WHERE id = ?').get(nouveauId));
  synchroniserAliasCS();
  res.redirect('/admin/lots?message=' + encodeURIComponent(`Lot ${lot.numero} cédé à ${prenom.trim()} ${nom.trim()}.`));
});

// Validation (acceptation/refus) d'une demande d'ajout d'une unité à un lot,
// par un membre du CS ou l'admin (spec 35).
router.post('/:id/unites/:luId/valider', (req, res) => {
  if (!isGestionnaire(req.user)) return interdit(req, res, 'Action réservée au conseil syndical.');
  const db = getDb();
  const lu = db.prepare(
    'SELECT lu.*, l.user_id AS lot_user_id, l.numero AS lot_numero FROM lot_units lu JOIN lots l ON l.id = lu.lot_id WHERE lu.id = ? AND lu.lot_id = ?'
  ).get(Number(req.params.luId), Number(req.params.id));
  if (!lu || lu.statut !== 'en_attente') return res.redirect('/admin/lots');
  const action = req.body.action === 'refuser' ? 'refuse' : 'accepte';
  db.prepare('UPDATE lot_units SET statut = ?, valide_par = ?, valide_at = datetime(\'now\') WHERE id = ?').run(action, req.user.id, lu.id);
  if (action === 'accepte' && lu.lot_user_id) {
    db.prepare("INSERT OR IGNORE INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, 'proprietaire')").run(lu.unit_id, lu.lot_user_id);
  }
  logEvent(db, lu.lot_id, 'unite', req.user.id, `Unité « ${lu.unite_label} » ${action === 'accepte' ? 'ajoutée au' : 'refusée pour le'} lot ${lu.lot_numero}`);
  if (lu.demande_par) {
    notifierUser(lu.demande_par, null, 'lot', `Votre demande d'ajout de « ${lu.unite_label} » au lot ${lu.lot_numero} a été ${action === 'accepte' ? 'acceptée' : 'refusée'}.`);
  }
  notifierCS('lot', `Demande d'ajout de « ${lu.unite_label} » au lot ${lu.lot_numero} ${action === 'accepte' ? 'acceptée' : 'refusée'} par ${req.user.prenom} ${req.user.nom}.`, null, req.user.id);
  res.redirect('/admin/lots?message=' + encodeURIComponent(`Demande ${action === 'accepte' ? 'acceptée' : 'refusée'}.`));
});

// Retrait d'une unité d'un lot : admin seul (spec 35), modale de confirmation.
router.post('/:id/unites/:luId/retirer', (req, res) => {
  if (!isGestionnaire(req.user)) return interdit(req, res, 'Action réservée au conseil syndical.');
  if (!isAdmin(req.user)) return interdit(req, res, 'Le retrait d\'une unité d\'un lot est réservé à l\'administrateur.');
  const db = getDb();
  const lu = db.prepare(
    'SELECT lu.*, l.user_id AS lot_user_id, l.numero AS lot_numero FROM lot_units lu JOIN lots l ON l.id = lu.lot_id WHERE lu.id = ? AND lu.lot_id = ?'
  ).get(Number(req.params.luId), Number(req.params.id));
  if (!lu) return res.redirect('/admin/lots');
  if (lu.statut === 'accepte' && lu.lot_user_id) {
    db.prepare("DELETE FROM unit_residents WHERE unit_id = ? AND user_id = ? AND qualite = 'proprietaire'").run(lu.unit_id, lu.lot_user_id);
  }
  db.prepare('DELETE FROM lot_units WHERE id = ?').run(lu.id);
  logEvent(db, lu.lot_id, 'unite', req.user.id, `Unité « ${lu.unite_label} » retirée du lot ${lu.lot_numero}`);
  res.redirect('/admin/lots?message=' + encodeURIComponent(`Unité « ${lu.unite_label} » retirée du lot ${lu.lot_numero}.`));
});

module.exports = router;
