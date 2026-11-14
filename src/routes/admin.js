const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const { isGestionnaire, isCS, isAdmin } = require('../droits');
const { getParametre, setParametre } = require('../parametres');
const { synchroniserAliasCS } = require('../mailcow');

const router = express.Router();
router.use(requireAuth);

// Panneau d'administration : reserve a l'admin seul (spec 19).
router.get('/', (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Réservé à l\'administrateur.' });
  }
  res.render('admin', {
    user: req.user,
    peremption: getParametre('peremption_rattachement_jours'),
    archivage: getParametre('archivage_auto_jours'),
    message: req.query.message || null,
    erreur: null
  });
});

router.post('/', (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Réservé à l\'administrateur.' });
  }
  const peremption = Number(req.body.peremption_rattachement_jours);
  const archivage = Number(req.body.archivage_auto_jours);
  if (!Number.isInteger(peremption) || peremption < 1 || !Number.isInteger(archivage) || archivage < 1) {
    return res.status(400).render('admin', {
      user: req.user,
      peremption: req.body.peremption_rattachement_jours,
      archivage: req.body.archivage_auto_jours,
      message: null,
      erreur: 'Les deux délais doivent être des nombres entiers de jours supérieurs ou égaux à 1.'
    });
  }
  setParametre('peremption_rattachement_jours', peremption);
  setParametre('archivage_auto_jours', archivage);
  res.redirect('/admin?message=' + encodeURIComponent('Réglages enregistrés.'));
});

router.get('/comptes', (req, res, next) => {
  if (!isGestionnaire(req.user)) return res.status(403).render('erreur', { user: req.user, message: 'Action réservée au conseil syndical.' });
  next();
}, (req, res) => {
  const db = getDb();
  const users = db.prepare(
    `SELECT u.*, GROUP_CONCAT(un.type || ' ' || COALESCE(un.numero, ''), ', ') AS unites
     FROM users u LEFT JOIN unit_residents ur ON ur.user_id = u.id LEFT JOIN units un ON un.id = ur.unit_id
     GROUP BY u.id ORDER BY u.role, u.conseil_syndical DESC, u.nom`
  ).all();
  res.render('admin-comptes', { user: req.user, users, message: req.query.message || null });
});

// Gestion collegiale du statut de membre du conseil syndical (spec 17) :
// l'admin ET tout membre du CS peuvent ajouter ou retirer le statut
// (a un autre compte ou a eux-memes) ; chaque action passe par une modale
// de confirmation cote interface.
router.post('/comptes/:id/conseil', (req, res) => {
  const db = getDb();
  const cible = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!cible) return res.redirect('/admin/comptes');
  const veutCS = req.body.action === 'ajouter';
  if (!isGestionnaire(req.user) || cible.role === 'admin') {
    return res.status(403).render('erreur', { user: req.user, message: 'Seuls l\'administrateur et les membres du conseil syndical gèrent ce statut (hors compte admin).' });
  }
  db.prepare('UPDATE users SET conseil_syndical = ? WHERE id = ?').run(veutCS ? 1 : 0, cible.id);
  synchroniserAliasCS();
  res.redirect('/admin/comptes?message=' + encodeURIComponent(
    veutCS ? `${cible.prenom} ${cible.nom} est maintenant membre du conseil syndical.` : `${cible.prenom} ${cible.nom} n'est plus membre du conseil syndical.`
  ));
});

module.exports = router;
