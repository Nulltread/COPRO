const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const { isGestionnaire, unitsDeUser } = require('../droits');
const { creerNotification, notifierCS, notifierUser } = require('../notifications');

const router = express.Router();
router.use(requireAuth);

// Demandes visibles : celles des unites du resident, toutes pour le CS/admin.
router.get('/', (req, res) => {
  const db = getDb();
  let enAttente;
  if (isGestionnaire(req.user)) {
    enAttente = db.prepare(
      `SELECT r.*, u.label AS unite_label, usr.nom AS user_nom, usr.prenom AS user_prenom, usr.email AS user_email
       FROM rattachements r
       JOIN units u ON u.id = r.unit_id
       JOIN users usr ON usr.id = r.user_id
       WHERE r.statut = 'en_attente' ORDER BY r.created_at`
    ).all();
  } else {
    const mesUnites = unitsDeUser(req.user.id);
    if (mesUnites.length === 0) {
      enAttente = [];
    } else {
      enAttente = db.prepare(
        `SELECT r.*, u.label AS unite_label, usr.nom AS user_nom, usr.prenom AS user_prenom, usr.email AS user_email
         FROM rattachements r
         JOIN units u ON u.id = r.unit_id
         JOIN users usr ON usr.id = r.user_id
         WHERE r.statut = 'en_attente' AND r.unit_id IN (${mesUnites.map(() => '?').join(',')})
         ORDER BY r.created_at`
      ).all(...mesUnites);
    }
  }
  const miennes = db.prepare(
    `SELECT r.*, u.label AS unite_label FROM rattachements r JOIN units u ON u.id = r.unit_id
     WHERE r.user_id = ? ORDER BY r.created_at DESC`
  ).all(req.user.id);
  res.render('rattachements', { user: req.user, enAttente, miennes, gestionnaire: isGestionnaire(req.user), message: req.query.message || null });
});

router.post('/:id/valider', (req, res) => {
  const db = getDb();
  const r = db.prepare(
    `SELECT r.*, u.label AS unite_label, usr.nom AS user_nom FROM rattachements r
     JOIN units u ON u.id = r.unit_id JOIN users usr ON usr.id = r.user_id WHERE r.id = ?`
  ).get(Number(req.params.id));
  if (!r || r.statut !== 'en_attente') return res.redirect('/rattachements');
  const action = req.body.action === 'refuser' ? 'refuse' : 'accepte';
  // Acceptation par un resident de la meme unite ou un membre du CS.
  const mesUnites = unitsDeUser(req.user.id);
  if (!isGestionnaire(req.user) && !mesUnites.includes(r.unit_id)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul un résident de cette unité ou un membre du conseil syndical peut valider ce rattachement.' });
  }
  db.prepare('UPDATE rattachements SET statut = ?, valide_par = ?, valide_at = datetime(\'now\') WHERE id = ?')
    .run(action, req.user.id, r.id);
  if (action === 'accepte') {
    db.prepare('INSERT OR IGNORE INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, ?)')
      .run(r.unit_id, r.user_id, r.qualite);
    notifierUser(r.user_id, null, 'rattachement', `Votre rattachement à « ${r.unite_label} » a été accepté par ${req.user.nom}.`);
  } else {
    notifierUser(r.user_id, null, 'rattachement', `Votre demande de rattachement à « ${r.unite_label} » a été refusée.`);
  }
  notifierCS('rattachement', `Rattachement de ${r.user_nom} à « ${r.unite_label} » ${action === 'accepte' ? 'accepté' : 'refusé'} par ${req.user.nom}.`, null, req.user.id);
  res.redirect('/rattachements?message=' + encodeURIComponent(`Rattachement ${action === 'accepte' ? 'accepté' : 'refusé'}.`));
});

module.exports = router;
