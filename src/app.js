const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { getDb } = require('./db');
const { getSessionUser } = require('./auth');
const { nonLues } = require('./notifications');

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
    next();
  });

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/', (req, res) => {
    if (!req.user) return res.redirect('/connexion');
    res.redirect('/tickets');
  });

  app.get('/tableau-de-bord', (req, res) => {
    if (!req.user) return res.redirect('/connexion');
    if (!['syndic', 'conseil', 'admin'].includes(req.user.role)) return res.redirect('/tickets');
    const db = getDb();
    const ouverts = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE etape != 'cloture'").get().n;
    const enAttenteDecision = db.prepare(
      `SELECT COUNT(*) AS n FROM tickets WHERE etape IN ('consultation','attribution')`
    ).get().n;
    const urgents = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE urgent = 1 AND etape != 'cloture'").get().n;
    const coutRetenu = db.prepare(
      "SELECT COALESCE(SUM(montant),0) AS total FROM fichiers WHERE categorie IN ('devis','avenant') AND retenu = 1"
    ).get().total;
    const totalFacture = db.prepare("SELECT COALESCE(SUM(montant),0) AS total FROM fichiers WHERE categorie = 'facture'").get().total;
    const recents = db.prepare(
      `SELECT t.*, GROUP_CONCAT(u.type || ' ' || u.numero, ', ') AS unites FROM tickets t
       LEFT JOIN ticket_units tu ON tu.ticket_id = t.id LEFT JOIN units u ON u.id = tu.unit_id
       GROUP BY t.id ORDER BY t.updated_at DESC LIMIT 10`
    ).all();
    res.render('tableau', {
      user: req.user, ouverts, enAttenteDecision, urgents, coutRetenu, totalFacture, recents,
      etiquettes: require('./droits').ETIQUETTES_ETAPES
    });
  });

  app.use('/', require('./routes/auth'));
  app.use('/tickets', require('./routes/tickets').router);
  app.use('/', require('./routes/fichiers'));
  app.use('/admin', require('./routes/admin'));
  app.use('/', require('./routes/profil'));
  app.use('/notifications', require('./routes/notifications'));

  app.use((req, res) => res.status(404).render('erreur', { user: req.user, message: 'Page introuvable.' }));

  return app;
}

module.exports = { createApp };
