const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth, hashPassword, destroySession } = require('../auth');
const { notifierCS } = require('../notifications');
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
    `SELECT r.*, un.label AS unite_label FROM rattachements r JOIN units un ON un.id = r.unit_id
     WHERE r.user_id = ? ORDER BY r.created_at DESC`
  ).all(req.user.id);
  const unitesReclamables = db.prepare("SELECT * FROM units WHERE type != 'communes' ORDER BY type DESC, numero").all();
  res.render('profil', {
    user: req.user, mesUnites, mesRattachements, unitesReclamables,
    message: req.query.message || null
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
  if (nom && nom.trim()) db.prepare('UPDATE users SET nom = ? WHERE id = ?').run(nom.trim(), req.user.id);
  if (prenom && prenom.trim()) db.prepare('UPDATE users SET prenom = ? WHERE id = ?').run(prenom.trim(), req.user.id);
  if (telephone && telephone.trim()) db.prepare('UPDATE users SET telephone = ? WHERE id = ?').run(telephone.trim(), req.user.id);
  if (motdepasse && motdepasse.length >= 8) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(motdepasse), req.user.id);
  }
  db.prepare('UPDATE users SET notif_email = ? WHERE id = ?').run(notif_email ? 1 : 0, req.user.id);
  res.redirect('/profil?message=' + encodeURIComponent('Profil mis à jour.'));
});

// Reclamer un rattachement a une unite (valide ensuite par un resident de
// l'unite ou le conseil syndical).
router.post('/profil/reclamer', (req, res) => {
  const db = getDb();
  const { unite_id, qualite } = req.body;
  if (unite_id) {
    db.prepare('INSERT OR IGNORE INTO rattachements (unit_id, user_id, qualite, statut) VALUES (?, ?, ?, ?)')
      .run(Number(unite_id), req.user.id, qualite === 'locataire' ? 'locataire' : 'proprietaire', 'en_attente');
    const label = db.prepare('SELECT label FROM units WHERE id = ?').get(Number(unite_id)).label;
    notifierCS('rattachement', `${req.user.prenom} ${req.user.nom} réclame un rattachement à « ${label} ».`, null, req.user.id);
  }
  res.redirect('/profil?message=' + encodeURIComponent('Demande de rattachement envoyée. Elle sera examinée par un résident de l\'unité ou le conseil syndical.'));
});

// Auto-retrait d'une unite : aucun impact sur les tickets (ils restent
// rattaches a l'unite).
router.post('/profil/retirer-unite', (req, res) => {
  const db = getDb();
  const unitId = Number(req.body.unit_id);
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
