const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const { isGestionnaire, isCS, isAdmin } = require('../droits');

const router = express.Router();
router.use(requireAuth);

router.get('/comptes', (req, res, next) => {
  if (!isGestionnaire(req.user)) return res.status(403).render('erreur', { user: req.user, message: 'Action réservée au conseil syndical.' });
  next();
}, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    `SELECT u.*, GROUP_CONCAT(un.label, ', ') AS unites
     FROM users u LEFT JOIN unit_residents ur ON ur.user_id = u.id LEFT JOIN units un ON un.id = ur.unit_id
     GROUP BY u.id ORDER BY u.role, u.conseil_syndical DESC, u.nom`
  ).all();
  res.render('admin-comptes', { user: req.user, users, message: req.query.message || null });
});

// Gestion collegiale du statut de membre du conseil syndical :
// un membre CS peut s'attribuer / se retirer le statut, ou le faire pour un
// autre membre CS ; l'admin peut tout faire.
router.post('/comptes/:id/conseil', (req, res) => {
  const db = getDb();
  const cible = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!cible) return res.redirect('/admin/comptes');
  const veutCS = req.body.action === 'ajouter';
  const moiMembreCS = isCS(req.user);
  const cibleDejaCS = isCS(cible);
  if (!isAdmin(req.user)) {
    if (!moiMembreCS) {
      return res.status(403).render('erreur', { user: req.user, message: 'Seuls les membres du conseil syndical gèrent ce statut.' });
    }
    if (!cibleDejaCS && !veutCS) {
      return res.redirect('/admin/comptes');
    }
    if (!cibleDejaCS && veutCS) {
      return res.status(403).render('erreur', { user: req.user, message: 'Un membre du conseil syndical ne peut attribuer ce statut qu\'à un autre membre du conseil syndical.' });
    }
  }
  db.prepare('UPDATE users SET conseil_syndical = ? WHERE id = ?').run(veutCS ? 1 : 0, cible.id);
  res.redirect('/admin/comptes?message=' + encodeURIComponent(
    veutCS ? `${cible.prenom} ${cible.nom} est maintenant membre du conseil syndical.` : `${cible.prenom} ${cible.nom} n'est plus membre du conseil syndical.`
  ));
});

module.exports = router;
