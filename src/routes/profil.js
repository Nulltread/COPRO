const express = require('express');
const { getDb } = require('../db');
const { requireAuth, hashPassword } = require('../auth');

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


module.exports = router;
