const express = require('express');
const { getDb } = require('../db');
const { hashPassword, verifyPassword, createSession, destroySession } = require('../auth');
const { notifierCS } = require('../notifications');
const { envoyerMailVerification } = require('../mail');
const { synchroniserAliasCS } = require('../mailcow');

const router = express.Router();

router.get('/inscription', (req, res) => {
  const db = getDb();
  const units = db.prepare("SELECT * FROM units WHERE type != 'communes' ORDER BY type DESC, numero").all();
  res.render('inscription', { user: null, units, erreur: null });
});

router.post('/inscription', (req, res) => {
  const db = getDb();
  const { nom, prenom, telephone, email, motdepasse, unite_id } = req.body;
  const erreur = !nom || !prenom || !telephone || !email || !motdepasse || motdepasse.length < 8
    ? 'Merci de remplir tous les champs (nom, prénom, téléphone, email ; mot de passe : 8 caractères minimum).'
    : (!unite_id ? 'Merci de choisir la villa ou le garage à laquelle vous souhaitez être rattaché.' : null);
  if (erreur) {
    const units = db.prepare("SELECT * FROM units WHERE type != 'communes' ORDER BY type DESC, numero").all();
    return res.status(400).render('inscription', { user: null, units, erreur });
  }
  // Unicite de l'email UNIQUEMENT parmi les comptes actifs (spec 36) : un compte
  // desactive ou supprime ne bloque pas la reutilisation de son adresse.
  const mail = email.toLowerCase().trim();
  const existe = db.prepare("SELECT id FROM users WHERE email = ? AND statut = 'actif'").get(mail);
  if (existe) {
    const units = db.prepare("SELECT * FROM units WHERE type != 'communes' ORDER BY type DESC, numero").all();
    return res.status(400).render('inscription', { user: null, units, erreur: 'Un compte actif existe déjà avec cet email.' });
  }
  // Auto-inscription : locataires uniquement (spec 36) — les comptes de
  // proprietaires ne sont crees que par le CS/admin. Le compte est actif tout
  // de suite, mais l'email doit être validé via le lien envoyé par mail (le
  // rattachement doit aussi être accepté avant de pouvoir déclarer un ticket).
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(mail, hashPassword(motdepasse), nom.trim(), prenom.trim(), telephone.trim(), 'resident', 'actif');
  const userId = info.lastInsertRowid;
  db.prepare('INSERT INTO rattachements (unit_id, user_id, qualite, statut) VALUES (?, ?, ?, ?)')
    .run(Number(unite_id), userId, 'locataire', 'en_attente');
  notifierCS('rattachement', `${prenom.trim()} ${nom.trim()} réclame un rattachement à cette unité.`, null, null);
  const nouveau = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  envoyerMailVerification(nouveau);
  res.render('inscription-ok', { user: null, nom: prenom.trim() });
});

// Validation de l'email via le lien unique reçu par mail.
router.get('/verifier-email', (req, res) => {
  const db = getDb();
  const { token } = req.query;
  const enregistrement = token
    ? db.prepare('SELECT * FROM email_verifications WHERE token = ? AND used_at IS NULL').get(token)
    : null;
  if (!enregistrement || new Date(enregistrement.expires_at) < new Date()) {
    return res.status(400).render('erreur', { user: req.user || null, message: 'Ce lien de validation est invalide ou a expiré. Demandez un nouvel email depuis votre profil.' });
  }
  db.prepare("UPDATE users SET email_verifie = 1 WHERE id = ?").run(enregistrement.user_id);
  db.prepare('UPDATE email_verifications SET used_at = ? WHERE id = ?').run(new Date().toISOString(), enregistrement.id);
  synchroniserAliasCS();
  const cible = req.user ? '/profil?message=' + encodeURIComponent('Votre adresse email est maintenant vérifiée.') : '/connexion?message=' + encodeURIComponent('Votre adresse email est maintenant vérifiée.');
  res.redirect(cible);
});

router.get('/connexion', (req, res) => {
  res.render('connexion', { user: null, erreur: null, suite: req.query.suite || '/', message: req.query.message || null, pasVerifie: false, email: '' });
});

router.post('/connexion', (req, res) => {
  const { email, motdepasse } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase().trim());
  if (!user || !verifyPassword(motdepasse || '', user.password_hash)) {
    return res.status(401).render('connexion', { user: null, erreur: 'Email ou mot de passe incorrect.', suite: req.body.suite || '/', message: null, pasVerifie: false, email: '' });
  }
  if (user.statut !== 'actif') {
    const msg = user.statut === 'desactive' ? 'Ce compte a été désactivé.' : 'Ce compte a été supprimé.';
    return res.status(403).render('connexion', { user: null, erreur: msg, suite: req.body.suite || '/', message: null, pasVerifie: false, email: '' });
  }
  // Connexion bloquée tant que l'email n'est pas validé (lien envoyé par mail).
  if (!user.email_verifie) {
    return res.status(403).render('connexion', {
      user: null, suite: req.body.suite || '/',
      erreur: 'Veuillez d\'abord valider votre adresse email via le lien reçu par mail.',
      pasVerifie: true, email: user.email
    });
  }
  const sid = createSession(user.id);
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400000 });
  const suite = req.body.suite || '';
  res.redirect(suite.startsWith('/') && suite !== '/' ? suite : '/tickets');
});

// Réinitialisation du mot de passe : lien unique et expirable envoyé par mail
// dès qu'un email est renseigné sur un compte (spec 36). L'utilisation du lien
// vaut aussi vérification de l'adresse email.
router.get('/reinitialiser-mot-de-passe', (req, res) => {
  res.render('reinitialiser-mdp', { user: req.user || null, token: req.query.token || '', erreur: null });
});

router.post('/reinitialiser-mot-de-passe', (req, res) => {
  const db = getDb();
  const { token, motdepasse } = req.body;
  const enregistrement = token
    ? db.prepare('SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL').get(token)
    : null;
  if (!enregistrement || new Date(enregistrement.expires_at) < new Date()) {
    return res.status(400).render('reinitialiser-mdp', {
      user: req.user || null, token: '',
      erreur: 'Ce lien est invalide ou a expiré. Demandez un nouveau mail depuis la page Comptes (réservée au conseil syndical).'
    });
  }
  if (!motdepasse || motdepasse.length < 8) {
    return res.status(400).render('reinitialiser-mdp', { user: req.user || null, token, erreur: 'Mot de passe : 8 caractères minimum.' });
  }
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(enregistrement.user_id);
  if (!u || u.statut !== 'actif') {
    return res.status(403).render('erreur', { user: req.user || null, message: 'Ce compte n\'est plus actif.' });
  }
  db.prepare('UPDATE users SET password_hash = ?, email_verifie = 1 WHERE id = ?').run(hashPassword(motdepasse), u.id);
  db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(new Date().toISOString(), enregistrement.id);
  synchroniserAliasCS();
  res.redirect('/connexion?message=' + encodeURIComponent('Votre mot de passe a été défini. Vous pouvez vous connecter.'));
});

// Renvoi public du lien de validation (depuis la page de connexion si bloqué).
router.post('/renvoyer-confirmation', (req, res) => {
  const db = getDb();
  const email = (req.body.email || '').toLowerCase().trim();
  const u = email ? db.prepare('SELECT * FROM users WHERE email = ?').get(email) : null;
  if (u && u.statut === 'actif' && !u.email_verifie) {
    const dernier = db.prepare('SELECT created_at FROM email_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(u.id);
    const maintenant = Date.now();
    if (!dernier || maintenant - new Date(dernier.created_at.replace(' ', 'T') + 'Z').getTime() > 60000) {
      envoyerMailVerification(u);
    }
  }
  res.redirect('/connexion?message=' + encodeURIComponent('Si ce compte existe et n\'est pas encore validé, un nouvel email de validation vient d\'être envoyé.'));
});

router.post('/deconnexion', (req, res) => {
  destroySession(req.cookies.sid);
  res.clearCookie('sid');
  res.redirect('/connexion');
});

module.exports = router;
