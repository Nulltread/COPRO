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

// Ouverture contextuelle : le bouton « ? » de l'application appelle /aide?depuis=<chemin>
// et l'aide s'ouvre directement sur la page correspondant à l'écran courant (spec 37).
const CORRESPONDANCE_PAGE_AIDE = [
  ['/tickets', 'ticket'],
  ['/tableau-de-bord', 'liste'],
  ['/documents', 'documents'],
  ['/notifications', 'notifications'],
  ['/profil', 'logement'],
  ['/rattachements', 'logement'],
  ['/admin/lots', 'lots'],
  ['/admin/comptes', 'compte'],
  ['/admin', 'compte'],
  ['/entreprises', 'consultations'],
  ['/consultation', 'consultations']
];

function slugPourChemin(chemin) {
  const p = String(chemin || '').split('?')[0];
  let meilleure = null;
  for (const [prefixe, slug] of CORRESPONDANCE_PAGE_AIDE) {
    if ((p === prefixe || p.startsWith(prefixe + '/')) && (!meilleure || prefixe.length > meilleure.prefixe.length)) {
      meilleure = { prefixe, slug };
    }
  }
  return meilleure ? meilleure.slug : null;
}

router.get('/', (req, res) => {
  const periodeTest = getParametre('periode_test') === '1';
  const pages = chargerPages();
  const depuis = slugPourChemin(req.query.depuis);
  const slug = (depuis && pages.some(p => p.slug === depuis))
    ? depuis
    : (periodeTest ? 'accueil-test' : 'presentation');
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
