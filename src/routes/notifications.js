const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const db = getDb();
  const notifs = db.prepare(
    `SELECT n.*, t.titre AS ticket_titre FROM notifications n LEFT JOIN tickets t ON t.id = n.ticket_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 100`
  ).all(req.user.id);
  res.render('notifications', { user: req.user, notifs });
});

router.post('/lire', (req, res) => {
  getDb().prepare('UPDATE notifications SET lu = 1 WHERE user_id = ?').run(req.user.id);
  res.redirect('/notifications');
});

router.get('/api/non-lues', (req, res) => {
  res.json({ nonLues: require('../notifications').nonLues(req.user.id) });
});

module.exports = router;
