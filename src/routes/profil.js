const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth, hashPassword, destroySession } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/profil', (req, res) => {
  const db = getDb();
  const mesUnites = db.prepare(
    `SELECT un.*, ur.qualite FROM units un JOIN unit_residents ur ON ur.unit_id = un.id WHERE ur.user_id = ? ORDER BY un.type DESC, un.numero`
  ).all(req.user.id);
  const sub = db.prepare('SELECT id FROM push_subscriptions WHERE user_id = ?').get(req.user.id);
  res.render('profil', { user: req.user, mesUnites, pushActive: !!sub, vapidPublic: process.env.VAPID_PUBLIC_KEY || '', message: req.query.message || null });
});

router.post('/profil', (req, res) => {
  const db = getDb();
  const { nom, motdepasse } = req.body;
  if (nom && nom.trim()) db.prepare('UPDATE users SET nom = ? WHERE id = ?').run(nom.trim(), req.user.id);
  if (motdepasse && motdepasse.length >= 8) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(motdepasse), req.user.id);
  }
  res.redirect('/profil?message=' + encodeURIComponent('Profil mis à jour.'));
});

router.get('/profil/export', (req, res) => {
  const db = getDb();
  const u = db.prepare('SELECT id, email, nom, role, statut, created_at FROM users WHERE id = ?').get(req.user.id);
  const unites = db.prepare(
    `SELECT un.type, un.numero, un.label, ur.qualite FROM units un JOIN unit_residents ur ON ur.unit_id = un.id WHERE ur.user_id = ?`
  ).all(req.user.id);
  const tickets = db.prepare(
    `SELECT t.id, t.titre, t.description, t.categorie, t.etape, t.urgent, t.created_at
     FROM tickets t JOIN ticket_units tu ON tu.ticket_id = t.id JOIN unit_residents ur ON ur.unit_id = tu.unit_id
     WHERE ur.user_id = ? GROUP BY t.id`
  ).all(req.user.id);
  const notifications = db.prepare('SELECT type, message, lu, created_at FROM notifications WHERE user_id = ?').all(req.user.id);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mes-donnees-copro.json"');
  res.send(JSON.stringify({ exporte_le: new Date().toISOString(), compte: u, unites, tickets, notifications }, null, 2));
});

router.post('/profil/supprimer', (req, res) => {
  const db = getDb();
  const id = req.user.id;
  db.prepare('DELETE FROM unit_residents WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  db.prepare('UPDATE users SET email = ?, password_hash = ?, nom = ?, statut = ? WHERE id = ?')
    .run(`supprime-${id}@invalid.local`, crypto.randomBytes(32).toString('hex'), 'Compte supprimé', 'refuse', id);
  destroySession(req.cookies.sid);
  res.clearCookie('sid');
  res.redirect('/connexion');
});

module.exports = router;
