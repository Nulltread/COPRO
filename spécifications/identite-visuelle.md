# Identité visuelle — direction v2 « neutre éditorial » (retenue le 2026-11-17)

Décision : après la direction B « Terre de Gardanne » (ocres/sable jugés vieillissants et
trop proches du rouge sémantique), l'identité retenue est la **v2 « neutre éditorial »** :
fond blanc pur, bandes pleine largeur gris clair, coins quasi vifs, blocs de section bien
délimités, une seule accentuation froide (bleu ardoise), et le **rouge réservé à l'urgent /
danger / refus**. Le jeu de couleur est volontairement sobre ; l'essentiel du travail porte
sur les espaces, les formes et la lisibilité. Moodboard : `design/moodboards/` (v2).

## Tokens (source unique : `:root` de `src/public/style.css`)

| Token | Hex | Rôle |
|---|---|---|
| `--accent` | `#24466B` | bleu ardoise profond : boutons primaires, liens, étape en cours, focus (blanc/dessus ≈ 8:1) |
| `--accent-fonce` | `#1B3554` | état actif des boutons primaires |
| `--fond` | `#FFFFFF` | fond de page (blanc pur) |
| `--bande` | `#F4F5F7` | bandes pleine largeur : header + blocs de section |
| `--carte` | `#FFFFFF` | cartes (liste des tickets…) |
| `--encre` | `#1F2328` | texte principal (quasi-noir) |
| `--bordure` | `#E4E6EA` | séparateurs nets (1 px) |
| `--bordure-input` | `#8A9099` | bordures de champs (contraste ≥ 3:1, WCAG 1.4.11) |
| `--texte-secondaire` | `#5C6470` | textes secondaires (≈ 6:1 sur blanc, AA) |
| `--rouge` | `#C01C28` | **seule couleur chaude** : URGENT, danger, refus |
| `--etat-accepte` | `#3E4C59` | gris ardoise foncé : travaux acceptés, validé |
| `--gris-etape` | `#9AA0A8` | archivé, puces |
| `--puce-faite` / `--puce-vide` | `#C9CDD4` / `#E4E6EA` | mini-flow : étapes faites / à venir |

Les anciennes variables `--bleu`, `--bleu-fonce`, `--vert`, `--gris`, `--texte` restent
définies comme alias vers les tokens ci-dessus (compatibilité des vues existantes).

## Règles d'application

- **Fond** : blanc pur. **Header** : bande pleine largeur `--bande`, bordure basse 1 px
  `--bordure`, texte `--encre`.
- **Sections** : chaque section (`.bloc` : description, consultation, bilans, factures, fil
  de suivi…) est un **bloc bien délimité** : fond `--bande`, bordure 1 px `--bordure`,
  radius 2 px, padding 16 px, marge haute 24 px — les espaces sont clairement identifiables,
  sans filets flous.
- **Formes** : coins quasi vifs **2 px** partout (boutons, champs, cartes, tags, modale,
  tuiles) ; seuls les compteurs/points restent ronds (badge de notifications, puces du
  mini-flow, pastille du toggle). Boutons primaires pleine hauteur (~48 px).
- **Cartes** (liste des tickets) : fond `--carte`, bordure 1 px `--bordure`, radius 2 px,
  **pas d'ombre** — la bordure nette porte la séparation.
- **Typographie** : 100 % sans système, 17 px, interligne 1,45 ; `h1` 1,6 rem graisse 700
  letter-spacing -0,01em ; marque en 700 avec le pictogramme « toit » (SVG inline), sans serif.
- **Boutons** : primaire = fond `--accent`, texte blanc, radius 2 px ; secondaire = fond
  blanc, bordure `--bordure-input` ; « + Nouveau ticket » = encadré `--accent`. Noms
  d'action en sentence case (« Déclarer le ticket »).
- **États des tickets** : pilule d'étape **en cours = `--accent`**, **travaux acceptés =
  `--etat-accepte`**, **archivé = `--gris-etape`** ; le **nom de l'état est toujours affiché
  en texte** (jamais couleur seule). Mini-flow : étape actuelle = couleur de l'état, faites =
  `--puce-faite`, à venir = `--puce-vide`.
- **Sémantique chaude** : `--rouge` UNIQUEMENT pour urgent / danger / refus **et l'étoile `*`
  des champs obligatoires** (plus de confusion avec une couleur de marque).
- **Accessibilité** (skill `design-ergonomie`) : `:focus-visible` global = outline 2 px
  `--accent` ; bordures de champs ≥ 3:1 ; cibles ≥ 44 px ; `prefers-reduced-motion` ;
  contrastes texte ≥ AA.
- **PWA / favicon** : pictogramme « toit en V imbriqués » blanc sur fond `--accent`
  (`src/public/icon.svg`, `icon-192.png`, `icon-512.png`) ; `theme-color` = `#24466B` ;
  `manifest.webmanifest` : `theme_color` `#24466B`, `background_color` `#FFFFFF`.
- **Versionnement des icônes** : les URL d'icônes portent `?v=N` (`/icon.svg?v=3`,
  `/icon-192.png?v=3` dans le header et le manifest) pour forcer le recache navigateur —
  Chrome conserve sinon l'ancien favicon en cache. Incrémenter `N` à chaque changement
  d'icône, et versionner en conséquence le cache du service worker (`CACHE = 'copro-v5'`
  dans `src/public/sw.js`, avec les URL versionnées dans `STATIQUES`).
- **Zéro dégradé** ; aucun texte en capitales ; microcopy en français courant ; plus d'air
  (padding contenu 24 px, gaps 16 px).
- **Mockups** : régénérés depuis les vues (`node scripts/render-mockups.js`), le
  `style.css` des mockups est copié depuis `src/public/style.css`.

Toute évolution ultérieure de l'identité passe par ce fichier (ou un nouveau fichier de
`spécifications/` si le sujet est neuf). **Aucun changement fonctionnel** n'est couvert par
ce fichier : UI uniquement.
