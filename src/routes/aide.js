const express = require('express');
const { requireAuth } = require('../auth');
const { getParametre } = require('../parametres');
const { rendreMarkdown, chargerPages, rechercher, surligner } = require('../aide-render');

const router = express.Router();
router.use(requireAuth);

const ORDRE = [
  ['accueil-test', "Accueil (période de test)"],
  ['presentation', "Présentation de l'outil"],
  ['compte', 'Mon compte'],
  ['logement', 'Mon logement (villa / garage)'],
  ['ticket', 'Déclarer et suivre un ticket'],
  ['consultations', 'Consultations et devis'],
  ['bilans', 'Bilans et acceptation des travaux'],
  ['notifications', 'Notifications'],
  ['liste', 'Liste des tickets et recherche'],
  ['documents', 'Documents de la copropriété'],
  ['lots', 'Lots et tantièmes'],
  ['faq', 'Questions fréquentes']
];

router.get('/', (req, res) => {
  const periodeTest = getParametre('periode_test') === '1';
  const slug = periodeTest ? 'accueil-test' : 'presentation';
  rendrePage(req, res, slug, periodeTest);
});

router.get('/recherche', (req, res) => {
  const q = String(req.query.q || '').trim();
  const pages = chargerPages();
  const resultats = q ? rechercher(pages, q) : [];
  res.render('aide', {
    user: req.user,
    titre: 'Aide — recherche',
    pages: sidebar(req),
    page: null,
    contenuHtml: null,
    recherche: { q, resultats, surligner: (t) => surligner(t, q) },
    periodeTest: getParametre('periode_test') === '1'
  });
});

router.get('/:slug', (req, res) => {
  rendrePage(req, res, String(req.params.slug).toLowerCase(), getParametre('periode_test') === '1');
});

function sidebar(req) {
  const periodeTest = getParametre('periode_test') === '1';
  return ORDRE
    .filter(([slug]) => slug !== 'accueil-test' || periodeTest)
    .map(([slug, titre]) => ({ slug, titre, active: false }));
}

function rendrePage(req, res, slug, periodeTest) {
  const pages = chargerPages();
  const page = pages.find(p => p.slug === slug);
  if (!page) {
    return res.status(404).render('erreur', { user: req.user, message: "Page d'aide introuvable." });
  }
  const nav = sidebar(req).map(p => ({ ...p, active: p.slug === slug }));
  res.render('aide', {
    user: req.user,
    titre: 'Aide — ' + page.titre,
    pages: nav,
    page,
    contenuHtml: rendreMarkdown(page.brut),
    recherche: null,
    periodeTest
  });
}

module.exports = router;
