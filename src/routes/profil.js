const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth, hashPassword, destroySession } = require('../auth');
const { notifierCS, notifierAdminEtCS } = require('../notifications');
const { envoyerMailVerification } = require('../mail');
const { synchroniserAliasCS } = require('../mailcow');

const router = express.Router();
router.use(requireAuth);

router.get('/profil', (req, res) => {
  const db = getDb();
  const mesUnites = db.prepare(
    `SELECT un.*, ur.qualite FROM units un JOIN unit_residents ur ON ur.unit_id = un.id WHERE ur.user_id = ? ORDER BY un.type DESC, un.numero`
  ).all(req.user.id);
  const mesRattachements = db.prepare(
    `SELECT r.*, un.label AS unite_label, un.type AS unite_type, un.numero AS unite_numero
     FROM rattachements r JOIN units un ON un.id = r.unit_id
     WHERE r.user_id = ? ORDER BY r.created_at DESC`
  ).all(req.user.id);
  const unitesReclamables = db.prepare("SELECT * FROM units WHERE type != 'communes' ORDER BY type DESC, numero").all();
  const mesLots = db.prepare(
    `SELECT l.*, GROUP_CONCAT(CASE WHEN lu.statut = 'accepte' THEN un.label END, ', ') AS unites
     FROM lots l
     LEFT JOIN lot_units lu ON lu.lot_id = l.id AND lu.statut = 'accepte'
     LEFT JOIN units un ON un.id = lu.unit_id
     WHERE l.user_id = ? GROUP BY l.id ORDER BY l.numero`
  ).all(req.user.id);
  const mesDemandesLot = db.prepare(
    `SELECT lu.*, un.label AS unite_label, l.numero AS lot_numero
     FROM lot_units lu JOIN lots l ON l.id = lu.lot_id JOIN units un ON un.id = lu.unit_id
     WHERE lu.demande_par = ? ORDER BY lu.created_at DESC`
  ).all(req.user.id);
  const unitesLibres = db.prepare(
    `SELECT * FROM units WHERE type != 'communes'
     AND id NOT IN (SELECT unit_id FROM lot_units WHERE statut IN ('en_attente','accepte'))
     ORDER BY type DESC, numero`
  ).all();
  res.render('profil', {
    user: req.user, mesUnites, mesRattachements, unitesReclamables,
    mesLots, mesDemandesLot, unitesLibres,
    message: req.query.message || null,
    erreur: req.query.erreur || null
  });
});

// Renvoyer l'email de validation de l'adresse.
router.post('/profil/renvoyer-confirmation', (req, res) => {
  const db = getDb();
  const moi = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (moi && !moi.email_verifie) envoyerMailVerification(moi);
  res.redirect('/profil?message=' + encodeURIComponent('Email de validation renvoyé si votre adresse n\'est pas encore vérifiée.'));
});

router.post('/profil', (req, res) => {
  const db = getDb();
  const { nom, prenom, telephone, motdepasse, notif_email } = req.body;
  if (!nom || !nom.trim() || !prenom || !prenom.trim()) {
    return res.redirect('/profil?erreur=' + encodeURIComponent('Nom et prénom sont obligatoires — profil non enregistré.'));
  }
  db.prepare('UPDATE users SET nom = ?, prenom = ? WHERE id = ?').run(nom.trim(), prenom.trim(), req.user.id);
  if (telephone && telephone.trim()) db.prepare('UPDATE users SET telephone = ? WHERE id = ?').run(telephone.trim(), req.user.id);
  if (motdepasse && motdepasse.length >= 8) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(motdepasse), req.user.id);
  }
  db.prepare('UPDATE users SET notif_email = ? WHERE id = ?').run(notif_email ? 1 : 0, req.user.id);
  res.redirect('/profil?message=' + encodeURIComponent('Profil mis à jour.'));
});

// Reclamer un rattachement a une unite, toujours en qualite locataire (spec 36 :
// les proprietaires passent par leur lot, jamais par une demande directe).
router.post('/profil/reclamer', (req, res) => {
  const db = getDb();
  const { unite_id } = req.body;
  if (unite_id) {
    const unitId = Number(unite_id);
    const deja = db.prepare('SELECT 1 FROM unit_residents WHERE user_id = ? AND unit_id = ?').get(req.user.id, unitId);
    if (deja) {
      return res.redirect('/profil?erreur=' + encodeURIComponent('Vous êtes déjà rattaché à cette unité (via votre lot ou en locataire).'));
    }
    db.prepare('INSERT OR IGNORE INTO rattachements (unit_id, user_id, qualite, statut) VALUES (?, ?, ?, ?)')
      .run(unitId, req.user.id, 'locataire', 'en_attente');
    const label = db.prepare('SELECT label FROM units WHERE id = ?').get(unitId).label;
    notifierCS('rattachement', `${req.user.prenom} ${req.user.nom} réclame un rattachement à « ${label} ».`, null, req.user.id);
  }
  res.redirect('/profil?message=' + encodeURIComponent('Demande de rattachement envoyée. Elle sera examinée par un résident de l\'unité ou le conseil syndical.'));
});

// Demande d'ajout d'une unite a son lot (proprietaire) — validee ensuite par
// le CS/admin depuis l'onglet Lots (spec 35). L'unite doit etre libre.
router.post('/profil/lots/:id/demander-unite', (req, res) => {
  const db = getDb();
  const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(Number(req.params.id));
  if (!lot || lot.user_id !== req.user.id) return res.redirect('/profil');
  const unitId = Number(req.body.unite_id);
  const unite = db.prepare('SELECT * FROM units WHERE id = ?').get(unitId);
  const dejaMienne = db.prepare('SELECT 1 FROM unit_residents WHERE user_id = ? AND unit_id = ?').get(req.user.id, unitId);
  const prise = db.prepare("SELECT 1 FROM lot_units WHERE unit_id = ? AND statut IN ('en_attente','accepte')").get(unitId);
  const dejaDemandee = db.prepare("SELECT 1 FROM lot_units WHERE lot_id = ? AND unit_id = ? AND statut = 'en_attente'").get(lot.id, unitId);
  if (!unite || unite.type === 'communes' || prise || dejaMienne || dejaDemandee) {
    return res.redirect('/profil?erreur=' + encodeURIComponent('Cette unité n\'est pas disponible pour votre lot.'));
  }
  db.prepare('INSERT INTO lot_units (lot_id, unit_id, statut, demande_par) VALUES (?, ?, ?, ?)').run(lot.id, unitId, 'en_attente', req.user.id);
  notifierAdminEtCS('lot', `${req.user.prenom} ${req.user.nom} demande l'ajout de « ${unite.label} » à son lot ${lot.numero}.`);
  res.redirect('/profil?message=' + encodeURIComponent(`Demande d'ajout de « ${unite.label} » envoyée. Elle sera examinée par le conseil syndical.`));
});

// Annulation par le demandeur d'une demande d'ajout d'unite encore en attente.
router.post('/profil/lots-demandes/:luId/annuler', (req, res) => {
  const db = getDb();
  const lu = db.prepare('SELECT * FROM lot_units WHERE id = ? AND demande_par = ?').get(Number(req.params.luId), req.user.id);
  if (lu && lu.statut === 'en_attente') db.prepare('DELETE FROM lot_units WHERE id = ?').run(lu.id);
  res.redirect('/profil?message=' + encodeURIComponent('Demande annulée.'));
});

// Annulation d'une demande de rattachement en attente (spec 29), avec modale
// de confirmation cote client (data-confirm).
router.post('/profil/rattachements/:id/annuler', (req, res) => {
  const db = getDb();
  const r = db.prepare('SELECT * FROM rattachements WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (r && r.statut === 'en_attente') {
    db.prepare('DELETE FROM rattachements WHERE id = ?').run(r.id);
    return res.redirect('/profil?message=' + encodeURIComponent('Demande de rattachement annulée.'));
  }
  res.redirect('/profil');
});

// Auto-retrait d'une unite en locataire (les unites du proprietaire viennent de
// son lot et se retirent depuis l'onglet Lots, par le CS/admin) : aucun impact
// sur les tickets (ils restent rattachés à l'unité).
router.post('/profil/retirer-unite', (req, res) => {
  const db = getDb();
  const unitId = Number(req.body.unit_id);
  const row = db.prepare('SELECT qualite FROM unit_residents WHERE user_id = ? AND unit_id = ?').get(req.user.id, unitId);
  if (!row || row.qualite !== 'locataire') {
    return res.redirect('/profil?erreur=' + encodeURIComponent('Seul un rattachement locataire peut être retiré ici.'));
  }
  db.prepare('DELETE FROM unit_residents WHERE user_id = ? AND unit_id = ?').run(req.user.id, unitId);
  db.prepare("UPDATE rattachements SET statut = 'refuse' WHERE user_id = ? AND unit_id = ? AND statut = 'accepte'").run(req.user.id, unitId);
  res.redirect('/profil?message=' + encodeURIComponent('Vous n\'êtes plus rattaché à cette unité. Vos tickets restent visibles.'));
});

router.get('/profil/export', (req, res) => {
  const db = getDb();
  const u = db.prepare('SELECT id, email, nom, prenom, telephone, role, conseil_syndical, statut, created_at FROM users WHERE id = ?').get(req.user.id);
  const unites = db.prepare(
    `SELECT un.type, un.numero, un.label, ur.qualite FROM units un JOIN unit_residents ur ON ur.unit_id = un.id WHERE ur.user_id = ?`
  ).all(req.user.id);
  const tickets = db.prepare('SELECT id, titre, description, etape, urgent, created_at FROM tickets WHERE auteur_id = ?').all(req.user.id);
  const notifications = db.prepare('SELECT type, message, lu, created_at FROM notifications WHERE user_id = ?').all(req.user.id);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mes-donnees-copro.json"');
  res.send(JSON.stringify({ exporte_le: new Date().toISOString(), compte: u, unites, tickets, notifications }, null, 2));
});

// Suppression de compte : anonymisation, aucun impact sur les tickets
// (ils restent rattachés a l'unite).
router.post('/profil/supprimer', (req, res) => {
  const db = getDb();
  const id = req.user.id;
  db.prepare('DELETE FROM unit_residents WHERE user_id = ?').run(id);
  db.prepare("UPDATE rattachements SET statut = 'refuse' WHERE user_id = ? AND statut IN ('en_attente','accepte')").run(id);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  db.prepare('UPDATE users SET email = ?, password_hash = ?, nom = ?, prenom = ?, telephone = ?, statut = ?, email_verifie = 0 WHERE id = ?')
    .run(`supprime-${id}@invalid.local`, crypto.randomBytes(32).toString('hex'), 'Compte supprimé', '', '', 'supprime', id);
  synchroniserAliasCS();
  destroySession(req.cookies.sid);
  res.clearCookie('sid');
  res.redirect('/connexion');
});

module.exports = router;
