const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const { isGestionnaire } = require('../droits');

const router = express.Router();
router.use(requireAuth);

function requireGestionnaire(req, res, next) {
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Page réservée au conseil syndical et à l\'administrateur.' });
  }
  next();
}

function champsEntreprise(body) {
  return {
    raison_sociale: (body.raison_sociale || '').trim(),
    siren_siret: (body.siren_siret || '').trim(),
    contact_nom: (body.contact_nom || '').trim(),
    telephone: (body.telephone || '').trim(),
    mail: (body.mail || '').trim()
  };
}

router.get('/', requireGestionnaire, (req, res) => {
  const db = getDb();
  const entreprises = db.prepare(
    `SELECT e.*, (SELECT COUNT(*) FROM consultations c WHERE c.entreprise_id = e.id) AS nb_utilisations
     FROM entreprises e ORDER BY e.raison_sociale`
  ).all();
  res.render('entreprises', {
    user: req.user, entreprises,
    message: req.query.message || null, erreur: null
  });
});

router.post('/', requireGestionnaire, (req, res) => {
  const db = getDb();
  const e = champsEntreprise(req.body);
  if (!e.raison_sociale) {
    const entreprises = db.prepare('SELECT e.*, (SELECT COUNT(*) FROM consultations c WHERE c.entreprise_id = e.id) AS nb_utilisations FROM entreprises e ORDER BY e.raison_sociale').all();
    return res.status(400).render('entreprises', { user: req.user, entreprises, message: null, erreur: 'La raison sociale est obligatoire.' });
  }
  db.prepare('INSERT INTO entreprises (raison_sociale, siren_siret, contact_nom, telephone, mail) VALUES (?, ?, ?, ?, ?)')
    .run(e.raison_sociale, e.siren_siret, e.contact_nom, e.telephone, e.mail);
  res.redirect('/entreprises?message=' + encodeURIComponent(`Entreprise « ${e.raison_sociale} » ajoutée.`));
});

router.get('/:id/modifier', requireGestionnaire, (req, res) => {
  const db = getDb();
  const e = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.status(404).render('erreur', { user: req.user, message: 'Entreprise introuvable.' });
  res.render('entreprise-form', { user: req.user, entreprise: e, erreur: null });
});

router.post('/:id/modifier', requireGestionnaire, (req, res) => {
  const db = getDb();
  const e = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.status(404).render('erreur', { user: req.user, message: 'Entreprise introuvable.' });
  const champs = champsEntreprise(req.body);
  if (!champs.raison_sociale) {
    return res.status(400).render('entreprise-form', { user: req.user, entreprise: { ...e, ...champs }, erreur: 'La raison sociale est obligatoire.' });
  }
  db.prepare('UPDATE entreprises SET raison_sociale = ?, siren_siret = ?, contact_nom = ?, telephone = ?, mail = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(champs.raison_sociale, champs.siren_siret, champs.contact_nom, champs.telephone, champs.mail, e.id);
  res.redirect('/entreprises?message=' + encodeURIComponent(`Entreprise « ${champs.raison_sociale} » mise à jour.`));
});

// Une entreprise utilisee dans au moins une consultation (quel que soit le
// ticket, quel que soit son etat) n'est plus supprimable.
router.post('/:id/supprimer', requireGestionnaire, (req, res) => {
  const db = getDb();
  const e = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.redirect('/entreprises');
  const nb = db.prepare('SELECT COUNT(*) AS n FROM consultations WHERE entreprise_id = ?').get(e.id).n;
  if (nb > 0) {
    return res.status(403).render('erreur', {
      user: req.user,
      message: `L'entreprise « ${e.raison_sociale} » est utilisée dans ${nb} consultation(s) : elle n'est plus supprimable (elle reste modifiable).`
    });
  }
  db.prepare('DELETE FROM entreprises WHERE id = ?').run(e.id);
  res.redirect('/entreprises?message=' + encodeURIComponent(`Entreprise « ${e.raison_sociale} » supprimée.`));
});

module.exports = router;
