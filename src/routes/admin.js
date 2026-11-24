const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const { isGestionnaire, isCS, isAdmin } = require('../droits');
const { getParametre, setParametre } = require('../parametres');
const { synchroniserAliasCS } = require('../mailcow');
const { envoyerMailResetAvecLimite } = require('../mail');

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
    `SELECT u.*,
            GROUP_CONCAT(un.type || ' ' || COALESCE(un.numero, ''), ', ') AS unites,
            GROUP_CONCAT('lot ' || l.numero, ', ') AS lots
     FROM users u
     LEFT JOIN unit_residents ur ON ur.user_id = u.id LEFT JOIN units un ON un.id = ur.unit_id
     LEFT JOIN lots l ON l.user_id = u.id
     GROUP BY u.id ORDER BY u.role, u.conseil_syndical DESC, u.nom`
  ).all();
  const lotsLibres = db.prepare('SELECT id, numero, designation FROM lots WHERE user_id IS NULL ORDER BY numero').all();
  res.render('admin-comptes', {
    user: req.user, users, lotsLibres,
    message: req.query.message || null,
    erreur: req.query.erreur || null
  });
});

// Création d'un compte par le gestionnaire (CS/admin, spec 36) : nom et prénom
// obligatoires, email facultatif (unicité parmi les comptes actifs). Si un email
// est renseigné, un mail de réinitialisation du mot de passe est envoyé
// automatiquement ; sans email, le compte reste inaccessible.
router.post('/comptes/creer', (req, res) => {
  const db = getDb();
  if (!isGestionnaire(req.user)) return res.status(403).render('erreur', { user: req.user, message: 'Action réservée au conseil syndical.' });
  const { nom, prenom, telephone, email, lot_id } = req.body;
  const mail = (email || '').trim().toLowerCase();
  const retourErreur = (msg) => res.redirect('/admin/comptes?erreur=' + encodeURIComponent(msg));
  if (!nom || !nom.trim() || !prenom || !prenom.trim()) return retourErreur('Nom et prénom sont obligatoires.');
  if (mail) {
    const existe = db.prepare("SELECT id FROM users WHERE email = ? AND statut = 'actif'").get(mail);
    if (existe) return retourErreur('Un compte actif existe déjà avec cet email.');
  }
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(mail || null, crypto.randomBytes(24).toString('hex'), nom.trim(), prenom.trim(), (telephone || '').trim(), 'resident', 'actif');
  const userId = info.lastInsertRowid;
  if (lot_id) {
    const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(Number(lot_id));
    if (lot && !lot.user_id) {
      db.prepare('UPDATE lots SET user_id = ? WHERE id = ?').run(userId, lot.id);
      db.prepare("INSERT INTO lot_events (lot_id, type, auteur_id, contenu) VALUES (?, 'proprietaire', ?, ?)")
        .run(lot.id, req.user.id, `Propriétaire : ${prenom.trim()} ${nom.trim()}`);
    }
  }
  if (mail) envoyerMailResetAvecLimite(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  const msg = `Compte créé pour ${prenom.trim()} ${nom.trim()}` +
    (mail ? ' — un mail de réinitialisation du mot de passe vient d\'être envoyé.' : ' — sans email : renseignez une adresse pour envoyer le mail de réinitialisation.');
  res.redirect('/admin/comptes?message=' + encodeURIComponent(msg));
});

// Modification d'un compte par le gestionnaire (hors compte admin) : nom et
// prénom obligatoires ; l'email peut être renseigné ou retiré — dès qu'il est
// renseigné (ou changé), un mail de réinitialisation est envoyé automatiquement.
router.post('/comptes/:id/modifier', (req, res) => {
  const db = getDb();
  if (!isGestionnaire(req.user)) return res.status(403).render('erreur', { user: req.user, message: 'Action réservée au conseil syndical.' });
  const cible = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  const retourErreur = (msg) => res.redirect('/admin/comptes?erreur=' + encodeURIComponent(msg));
  if (!cible || cible.role === 'admin') return res.redirect('/admin/comptes');
  const { nom, prenom, telephone, email } = req.body;
  const mail = (email || '').trim().toLowerCase();
  if (!nom || !nom.trim() || !prenom || !prenom.trim()) return retourErreur('Nom et prénom sont obligatoires.');
  if (mail) {
    const existe = db.prepare("SELECT id FROM users WHERE email = ? AND statut = 'actif' AND id != ?").get(mail, cible.id);
    if (existe) return retourErreur('Un compte actif existe déjà avec cet email.');
  }
  const ancienEmail = (cible.email || '').toLowerCase();
  db.prepare('UPDATE users SET nom = ?, prenom = ?, telephone = ?, email = ?, email_verifie = 0 WHERE id = ?')
    .run(nom.trim(), prenom.trim(), (telephone || '').trim(), mail || null, cible.id);
  if (mail && mail !== ancienEmail) {
    envoyerMailResetAvecLimite(db.prepare('SELECT * FROM users WHERE id = ?').get(cible.id));
    synchroniserAliasCS();
  }
  res.redirect('/admin/comptes?message=' + encodeURIComponent(`Compte de ${prenom.trim()} ${nom.trim()} mis à jour.`));
});

// Renvoi manuel du mail de réinitialisation du mot de passe (compte avec email).
router.post('/comptes/:id/renvoyer-reset', (req, res) => {
  const db = getDb();
  if (!isGestionnaire(req.user)) return res.status(403).render('erreur', { user: req.user, message: 'Action réservée au conseil syndical.' });
  const cible = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!cible || cible.role === 'admin' || !cible.email) return res.redirect('/admin/comptes');
  const envoye = envoyerMailResetAvecLimite(cible);
  const msg = envoye
    ? `Mail de réinitialisation envoyé à ${cible.email}.`
    : 'Un mail a déjà été envoyé il y a moins d\'une minute.';
  res.redirect('/admin/comptes?message=' + encodeURIComponent(msg));
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
