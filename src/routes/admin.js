const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const { isGestionnaire, isCS, isAdmin } = require('../droits');
const { getParametre, setParametre } = require('../parametres');
const { synchroniserAliasCS } = require('../mailcow');
const { envoyerMailResetAvecLimite } = require('../mail');
const { TYPES_AUDIT, ETIQUETTES_AUDIT } = require('../audit');

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
    periodeTest: getParametre('periode_test') === '1',
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
      periodeTest: req.body.periode_test === '1',
      message: null,
      erreur: 'Les deux délais doivent être des nombres entiers de jours supérieurs ou égaux à 1.'
    });
  }
  setParametre('peremption_rattachement_jours', peremption);
  setParametre('archivage_auto_jours', archivage);
  setParametre('periode_test', req.body.periode_test === '1' ? '1' : '0');
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

// Mesure de l'usage (spec 38) : reserve a l'admin seul. Trois sections :
// connexions par compte, consultations des pages sur 7 jours (barregraphe
// filtrable par page, ?page=), journal d'activite (filtre ?type=, pagination ?p=).
router.get('/usage', (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Réservé à l\'administrateur.' });
  }
  const db = getDb();

  // 1. Connexions par compte (total, semaine, derniere connexion).
  const connexions = db.prepare(
    `SELECT u.id, u.prenom, u.nom, u.email, u.role, u.conseil_syndical, u.statut,
            COUNT(c.id) AS total,
            SUM(CASE WHEN c.created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS semaine,
            MAX(c.created_at) AS derniere
     FROM users u LEFT JOIN connexions c ON c.user_id = u.id
     GROUP BY u.id
     ORDER BY (derniere IS NULL), derniere DESC, total DESC, u.nom`
  ).all();

  // 2. Consultations des pages sur les 7 derniers jours (aujourd'hui inclus),
  //    filtre par page facultatif.
  const pageFiltre = typeof req.query.page === 'string' ? req.query.page : '';
  const pagesOptions = db.prepare(
    `SELECT chemin, COUNT(*) AS n FROM page_views
     WHERE created_at >= datetime('now', '-7 days')
     GROUP BY chemin ORDER BY n DESC, chemin`
  ).all();
  const totalPages7j = db.prepare(
    "SELECT COUNT(*) AS n FROM page_views WHERE created_at >= datetime('now', '-7 days')"
  ).get().n;
  const lignesJour = db.prepare(
    `SELECT date(created_at) AS jour, COUNT(*) AS n FROM page_views
     WHERE created_at >= datetime('now', '-7 days')` + (pageFiltre ? ' AND chemin = ?' : '') +
    ` GROUP BY jour ORDER BY jour`
  ).all(...(pageFiltre ? [pageFiltre] : []));
  const parJour = {};
  for (const l of lignesJour) parJour[l.jour] = l.n;
  const jours = [];
  for (let i = 6; i >= 0; i--) {
    const iso = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    jours.push({ iso, label: iso.slice(8, 10) + '/' + iso.slice(5, 7), n: parJour[iso] || 0 });
  }
  const max = Math.max(1, ...jours.map(j => j.n));
  // Barres du graphe SVG (viewBox 700 x 210, ligne de base y = 186).
  const LARG = 700, HAUT = 210, BASE = 186, MARGE = 10;
  const slot = (LARG - 2 * MARGE) / 7;
  const barres = jours.map((j, i) => {
    const h = Math.round((j.n / max) * (BASE - 34));
    return { x: Math.round(MARGE + i * slot + 7), w: Math.round(slot - 14), y: BASE - h, h, label: j.label, n: j.n };
  });

  // 3. Journal d'activite, filtre par type + pagination (50/page).
  const typeFiltre = TYPES_AUDIT.includes(req.query.type) ? req.query.type : '';
  const pageNum = Math.max(1, Number.parseInt(req.query.p, 10) || 1);
  const PAR_PAGE = 50;
  const where = typeFiltre ? 'WHERE a.type = ?' : '';
  const totalEntrees = db.prepare(`SELECT COUNT(*) AS n FROM audit_log a ${where}`)
    .get(...(typeFiltre ? [typeFiltre] : [])).n;
  const entrees = db.prepare(
    `SELECT a.*, u.prenom AS auteur_prenom, u.nom AS auteur_nom FROM audit_log a
     LEFT JOIN users u ON u.id = a.auteur_id ${where}
     ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`
  ).all(...(typeFiltre ? [typeFiltre] : []), PAR_PAGE, (pageNum - 1) * PAR_PAGE);
  const nbPages = Math.max(1, Math.ceil(totalEntrees / PAR_PAGE));

  const fmtDate = (s) => s
    ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) + ' ' + s.slice(11, 16)
    : '—';

  res.render('admin-usage', {
    user: req.user,
    connexions, fmtDate,
    barres, LARG, HAUT, BASE, max, pageFiltre, pagesOptions, totalPages7j,
    entrees, types: TYPES_AUDIT, etiquettesAudit: ETIQUETTES_AUDIT, typeFiltre,
    pageNum, nbPages, totalEntrees, parPage: PAR_PAGE
  });
});

module.exports = router;
