const express = require('express');
const { getDb } = require('../db');
const { hashPassword, verifyPassword, createSession, destroySession } = require('../auth');

const router = express.Router();

router.get('/inscription', (req, res) => {
  const db = getDb();
  const units = db.prepare("SELECT * FROM units ORDER BY type DESC, numero").all();
  res.render('inscription', { user: null, units, erreur: null });
});

router.post('/inscription', (req, res) => {
  const db = getDb();
  const { nom, email, motdepasse, unite_id, qualite } = req.body;
  const erreur = !nom || !email || !motdepasse || motdepasse.length < 8
    ? 'Merci de remplir tous les champs (mot de passe : 8 caractères minimum).'
    : (!unite_id ? 'Merci de choisir votre villa ou garage.' : null);
  if (erreur) {
    const units = db.prepare('SELECT * FROM units ORDER BY type DESC, numero').all();
    return res.status(400).render('inscription', { user: null, units, erreur });
  }
  const existe = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existe) {
    const units = db.prepare('SELECT * FROM units ORDER BY type DESC, numero').all();
    return res.status(400).render('inscription', { user: null, units, erreur: 'Un compte existe déjà avec cet email.' });
  }
  const info = db.prepare('INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?, ?, ?, ?, ?)')
    .run(email.toLowerCase().trim(), hashPassword(motdepasse), nom.trim(), 'resident', 'en_attente');
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, ?)')
    .run(Number(unite_id), info.lastInsertRowid, qualite === 'locataire' ? 'locataire' : 'proprietaire');
  res.render('inscription-ok', { user: null });
});

router.get('/connexion', (req, res) => {
  res.render('connexion', { user: null, erreur: null, suite: req.query.suite || '/' });
});

router.post('/connexion', (req, res) => {
  const { email, motdepasse } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase().trim());
  if (!user || !verifyPassword(motdepasse || '', user.password_hash)) {
    return res.status(401).render('connexion', { user: null, erreur: 'Email ou mot de passe incorrect.', suite: req.body.suite || '/' });
  }
  const sid = createSession(user.id);
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400000 });
  res.redirect(req.body.suite && req.body.suite.startsWith('/') ? req.body.suite : '/');
});

router.post('/deconnexion', (req, res) => {
  destroySession(req.cookies.sid);
  res.clearCookie('sid');
  res.redirect('/connexion');
});

module.exports = router;
