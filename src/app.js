const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { getDb } = require('./db');
const { getSessionUser } = require('./auth');
const { nonLues } = require('./notifications');
const { isGestionnaire } = require('./droits');
const { enregistrerPageVue, cheminTrace } = require('./audit');

function createApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use((req, res, next) => {
    req.user = getSessionUser(req.cookies.sid);
    res.locals.user = req.user;
    res.locals.nonLues = req.user ? nonLues(req.user.id) : 0;
    res.locals.cheminCourant = req.path;
    next();
  });

  // Mesure de l'usage (spec 38) : une ligne par consultation de page HTML
  // d'un utilisateur connecte (les statiques sont servis avant, donc exclus).
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.user && !req.xhr && req.accepts('html') && cheminTrace(req.path)) {
      enregistrerPageVue(req.user.id, req.path);
    }
    next();
  });

  // Statics : toujours revalider aupres du serveur (le service worker gere le
  // secours hors-ligne) — evite de servir un vieux app.js/style.css/sw.js.
  app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
  }));
  // Pages HTML : no-cache aussi (les changements de rendu sont cote serveur).
  app.use((req, res, next) => {
    if (req.method === 'GET') res.setHeader('Cache-Control', 'no-cache');
    next();
  });

  // La racine répond en 200 (redirection côté client) : une 302 sur / provoquait
  // des ERR_FAILED intermittents dans certains navigateurs.
  app.get('/', (req, res) => {
    const cible = req.user ? '/tickets' : '/connexion';
    res.type('html').send(
      `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${cible}">` +
      `<script>location.replace(${JSON.stringify(cible)})</script>` +
      `<p><a href="${cible}">Continuer</a></p>`
    );
  });

  app.get('/tableau-de-bord', (req, res) => {
    if (!req.user) return res.redirect('/connexion');
    if (!isGestionnaire(req.user)) return res.redirect('/tickets');
    const db = getDb();
    const ouverts = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE etape != 'archive'").get().n;
    const enConsultation = db.prepare(
      `SELECT COUNT(*) AS n FROM tickets WHERE etape = 'consultation'`
    ).get().n;
    const urgents = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE urgent = 1 AND etape != 'archive'").get().n;
    const coutRetenu = db.prepare(
      `SELECT COALESCE(SUM(f.montant),0) AS total FROM fichiers f
       JOIN consultations c ON c.id = f.consultation_id
       WHERE f.categorie = 'devis' AND c.validee = 1 AND c.caduque = 0`
    ).get().total;
    const totalFacture = db.prepare("SELECT COALESCE(SUM(montant),0) AS total FROM fichiers WHERE categorie = 'facture'").get().total;
    const recents = db.prepare(
      `SELECT t.*, GROUP_CONCAT(u.label, ', ') AS unites FROM tickets t
       LEFT JOIN ticket_units tu ON tu.ticket_id = t.id LEFT JOIN units u ON u.id = tu.unit_id
       GROUP BY t.id ORDER BY t.updated_at DESC LIMIT 10`
    ).all();
    res.render('tableau', {
      user: req.user, ouverts, enConsultation, urgents, coutRetenu, totalFacture, recents,
      etapes: require('./droits').ETAPES,
      etiquettes: require('./droits').ETIQUETTES_ETAPES
    });
  });

  app.use('/', require('./routes/auth'));
  // Espace prestataire (sans compte) : monte AVANT le routeur fichiers (qui
  // exige une session sur '/' ) — le jeton personnel fait foi.
  app.use('/consultation', require('./routes/consultation-publique'));
  app.use('/tickets', require('./routes/tickets').router);
  app.use('/documents', require('./routes/documents'));
  app.use('/', require('./routes/fichiers'));
  app.use('/admin/lots', require('./routes/lots'));
  app.use('/admin', require('./routes/admin'));
  app.use('/entreprises', require('./routes/entreprises'));
  app.use('/rattachements', require('./routes/rattachements'));
  app.use('/', require('./routes/profil'));
  app.use('/notifications', require('./routes/notifications'));
  app.use('/aide', require('./routes/aide'));

  app.use((req, res) => res.status(404).render('erreur', { user: req.user, message: 'Page introuvable.' }));

  return app;
}

module.exports = { createApp };
