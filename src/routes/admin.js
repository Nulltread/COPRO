const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireRole, hashPassword } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/comptes', requireRole('syndic', 'conseil', 'admin'), (req, res) => {
  const db = getDb();
  const enAttente = db.prepare(
    `SELECT u.*, GROUP_CONCAT(un.type || ' ' || un.numero) AS unites
     FROM users u LEFT JOIN unit_residents ur ON ur.user_id = u.id LEFT JOIN units un ON un.id = ur.unit_id
     WHERE u.statut = 'en_attente' GROUP BY u.id ORDER BY u.created_at`
  ).all();
  const users = db.prepare(
    `SELECT u.*, GROUP_CONCAT(un.type || ' ' || un.numero, ', ') AS unites
     FROM users u LEFT JOIN unit_residents ur ON ur.user_id = u.id LEFT JOIN units un ON un.id = ur.unit_id
     GROUP BY u.id ORDER BY u.role, u.nom`
  ).all();
  res.render('admin-comptes', { user: req.user, enAttente, users, message: req.query.message || null });
});

router.post('/comptes/:id/valider', requireRole('syndic', 'conseil', 'admin'), (req, res) => {
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.redirect('/admin/comptes');
  const action = req.body.action === 'refuser' ? 'refuse' : 'valide';
  db.prepare('UPDATE users SET statut = ? WHERE id = ?').run(action, u.id);
  res.redirect('/admin/comptes?message=' + encodeURIComponent(`Compte de ${u.nom} ${action === 'valide' ? 'validé' : 'refusé'}.`));
});

router.get('/unites', requireRole('admin'), (req, res) => {
  const db = getDb();
  const unites = db.prepare(
    `SELECT un.*, GROUP_CONCAT(u.nom || ' (' || ur.qualite || ')', ', ') AS residents
     FROM units un
     LEFT JOIN unit_residents ur ON ur.unit_id = un.id
     LEFT JOIN users u ON u.id = ur.user_id AND u.statut = 'valide'
     GROUP BY un.id ORDER BY un.type DESC, un.numero`
  ).all();
  const residents = db.prepare("SELECT id, nom, email FROM users WHERE role = 'resident' ORDER BY nom").all();
  res.render('admin-unites', { user: req.user, unites, residents, message: req.query.message || null });
});

router.post('/unites/:id/rattacher', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { user_id, qualite } = req.body;
  if (user_id && qualite) {
    db.prepare('INSERT OR IGNORE INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, ?)')
      .run(Number(req.params.id), Number(user_id), qualite === 'locataire' ? 'locataire' : 'proprietaire');
  }
  res.redirect('/admin/unites?message=' + encodeURIComponent('Rattachement enregistré.'));
});

router.post('/unites/:id/detacher', requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM unit_residents WHERE unit_id = ? AND user_id = ?').run(Number(req.params.id), Number(req.body.user_id));
  res.redirect('/admin/unites?message=' + encodeURIComponent('Rattachement supprimé.'));
});

module.exports = router;
