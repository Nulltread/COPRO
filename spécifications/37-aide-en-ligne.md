# Aide en ligne (wiki)

## Règle générale (ajoutée à `00-organisation.md`)

- **Toute modification fonctionnelle de l'application doit impacter l'aide en ligne** dans le même commit : contenu à jour, nouvelle page si nouvelle fonctionnalité, page supprimée si fonctionnalité supprimée.

## Principe

- Aide en ligne **embarquée dans l'application** (pas de PDF externe) : pages markdown dans `src/aide/*.md`, rendues côté serveur (`src/aide-render.js`, mini-markdown : titres, listes, gras/italique, code, liens internes `/aide/...`, citations, échappement HTML).
- **Mode wiki** : bandeau latéral de navigation (sommaire des pages, page active en surbrillance) + zone de lecture ; responsive (sommaire replié en haut sur mobile).
- **Recherche plain text** : champ dans le bandeau (GET `/aide/recherche?q=...`) ; la requête (un mot ou une phrase) est normalisée (minuscules, sans accents) et recherchée dans **toutes les pages** (tous les mots doivent être présents) ; résultats = liste des pages avec extrait autour du premier match et surlignage `<mark>`.
- Lien **« ? »** dans la barre de navigation (desktop + menu burger), visible par tout utilisateur **connecté** (`/aide`, `requireAuth`).

## Ouverture contextuelle (depuis la page courante)

- Le lien « ? » appelle **`GET /aide?depuis=<chemin de la page courante>`** (le chemin est exposé à toutes les vues via `res.locals.cheminCourant`).
- `GET /aide` résout `depuis` via une table de correspondance **préfixe de chemin → page d'aide** (correspondance la plus longue ; slugs toujours validés contre la liste des pages existantes, aucun redirect ouvert) :
  - `/tickets` → `ticket` ; `/tableau-de-bord` → `liste` ; `/documents` → `documents` ; `/notifications` → `notifications` ; `/profil` et `/rattachements` → `logement` ; `/admin/lots` → `lots` ; `/admin/comptes` et `/admin` → `compte` ; `/admin/usage` → `usage` ; `/entreprises` et `/consultation` → `consultations`.
- Si `depuis` correspond à une page d'aide connue : l'aide s'ouvre **directement sur cette page** (même en période de test). Sinon (paramètre absent ou inconnu) : accueil par défaut (`accueil-test` si `periode_test='1'`, sinon `presentation`).


## Pages (contenu)

Accueil (voir ci-dessous), présentation de l'outil, mon compte (inscription locataires, connexion, mot de passe oublié, profil), **mon logement** (rattachement propriétaire via le lot / locataire direct), déclarer et suivre un ticket, consultations et devis, bilans et acceptation, notifications, liste des tickets et recherche, documents, lots et tantièmes, **mesure de l'usage (admin)**, FAQ + contact.

## Page d'accueil « période de test » (temporaire)

- Page `accueil-test` affichée à la place de l'accueil de l'aide tant que le paramètre **`periode_test` = '1'** (défaut `'1'` en v0 ; réglable par l'admin dans le panneau d'administration).
- Contenu : message de bienvenue de la période de test (durée, nettoyage à l'issue, « jouez sans crainte »), **comment se connecter**, et en premier **comment s'attribuer un logement** (lien vers la page « Mon logement »).
- **À la mise en production réelle** : l'admin passe `periode_test` à `'0'` → la page d'accueil de test disparaît du sommaire et `/aide` affiche la présentation ; la page reste dans le code mais n'est plus servie en accueil (elle reste accessible par son URL directe tant que le paramètre est à '1').

## Technique

- Route `src/routes/aide.js` montée sur `/aide` dans `app.js` : `GET /aide` (accueil selon paramètre), `GET /aide/:slug` (404 si page inconnue), `GET /aide/recherche?q=`.
- Vue `src/views/aide.ejs` + styles dédiés dans `src/public/style.css`.
- Recherche et rendu testés (unitaires + API).
