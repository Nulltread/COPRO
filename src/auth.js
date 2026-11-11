const crypto = require('crypto');
const { getDb } = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function createSession(userId, days = 30) {
  const db = getDb();
  const sid = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (sid, user_id, expires_at) VALUES (?, ?, ?)').run(sid, userId, expires);
  return sid;
}

function getSessionUser(sid) {
  if (!sid) return null;
  const db = getDb();
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.sid = ? AND s.expires_at > datetime('now')`
  ).get(sid);
  return row || null;
}

function destroySession(sid) {
  if (!sid) return;
  getDb().prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
}

function requireAuth(req, res, next) {
  const user = req.user;
  if (!user) {
    if (req.accepts('html') && !req.xhr && req.method === 'GET') {
      return res.redirect('/connexion?suite=' + encodeURIComponent(req.originalUrl));
    }
    return res.status(401).json({ erreur: 'Connexion requise' });
  }
  if (user.statut !== 'actif') {
    destroySession(req.cookies.sid);
    res.clearCookie('sid');
    return res.status(403).render('erreur', { user: null, message: 'Ce compte a été supprimé.' });
  }
  next();
}

function requireGestion(req, res, next) {
  const { isGestionnaire } = require('./droits');
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Action réservée au conseil syndical.' });
  }
  next();
}

module.exports = { hashPassword, verifyPassword, createSession, getSessionUser, destroySession, requireAuth, requireGestion };
