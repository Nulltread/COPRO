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
  const { nom, prenom, telephone, email, motdepasse, unite_id, qualite } = req.body;
  const erreur = !nom || !prenom || !telephone || !email || !motdepasse || motdepasse.length < 8
    ? 'Merci de remplir tous les champs (nom, prénom, téléphone, email ; mot de passe : 8 caractères minimum).'
    : (!unite_id ? 'Merci de choisir la villa ou le garage à laquelle vous souhaitez être rattaché.' : null);
  if (erreur) {
    const units = db.prepare("SELECT * FROM units WHERE type != 'communes' ORDER BY type DESC, numero").all();
    return res.status(400).render('inscription', { user: null, units, erreur });
  }
  const existe = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existe) {
    const units = db.prepare("SELECT * FROM units WHERE type != 'communes' ORDER BY type DESC, numero").all();
    return res.status(400).render('inscription', { user: null, units, erreur: 'Un compte existe déjà avec cet email.' });
  }
  // Auto-inscription : le compte est actif tout de suite, mais l'email doit être
  // validé via le lien envoyé par mail (le rattachement doit aussi être accepté
  // avant de pouvoir déclarer un ticket).
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(email.toLowerCase().trim(), hashPassword(motdepasse), nom.trim(), prenom.trim(), telephone.trim(), 'resident', 'actif');
  const userId = info.lastInsertRowid;
  db.prepare('INSERT INTO rattachements (unit_id, user_id, qualite, statut) VALUES (?, ?, ?, ?)')
    .run(Number(unite_id), userId, qualite === 'locataire' ? 'locataire' : 'proprietaire', 'en_attente');
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
    return res.status(403).render('connexion', { user: null, erreur: 'Ce compte a été supprimé.', suite: req.body.suite || '/', message: null, pasVerifie: false, email: '' });
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
