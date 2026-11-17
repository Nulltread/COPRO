# Identité visuelle — direction « Terre de Gardanne » (retenue le 2026-11-17)

Décision : parmi les trois moodboards de `design/moodboards/`, la **direction B — Terre de
Gardanne** est retenue. Ambiance : toits de tuiles et chênes-lièges, fond sable chaud,
cartes blanc pur en relief doux, brique sourde comme seule couleur vive. Moderne, épuré,
doux.

## Tokens (source unique : `:root` de `src/public/style.css`)

| Token | Hex | Rôle |
|---|---|---|
| `--brique` | `#9C4A2F` | primaire (boutons, marque, étape en cours, focus) |
| `--brique-fonce` | `#7E3B24` | état actif des boutons primaires |
| `--sable` | `#F7F3EB` | fond de page |
| `--sable-fonce` | `#EFE8DB` | blocs, fonds de section, bouton secondaire |
| `--encre` | `#2A2118` | texte principal (brun-noir) |
| `--olive` | `#6B7A3F` | secondaire : travaux acceptés, validé |
| `--bordure` | `#E0D8C8` | bordures de cartes |
| `--bordure-input` | `#8F8266` | bordures de champs (contraste ≥ 3:1, WCAG 1.4.11) |
| `--carte` | `#FFFFFF` | fond des cartes |
| `--texte-secondaire` | `#6B5C48` | textes secondaires (contraste AA sur sable ≈ 5,5:1) |
| `--rouge` | `#C01C28` | sémantique urgence/danger (inchangé) |
| `--gris-etape` | `#6B7280` | état archivé |
| `--puce-faite` / `--puce-vide` | `#CFC4AE` / `#E6DDCD` | mini-flow : étapes faites / à venir |

Les anciennes variables `--bleu`, `--bleu-fonce`, `--vert`, `--gris`, `--texte` restent
définies comme alias vers les tokens ci-dessus (compatibilité des vues existantes).

## Règles d'application

- **Fond** : page en `--sable` ; cartes, listes, bulles de fil en `--carte` avec bordure
  `--bordure`, ombre douce en deux couches, radius 16 px (cartes) / 12 px (boutons) /
  10 px (champs).
- **Header** : clair — fond `--sable`, bordure basse `--bordure`, texte `--encre`. Marque
  en **serif Georgia** accompagnée du pictogramme « toit en V imbriqués » (SVG inline dans
  `header.ejs`), **pas d'emoji**. Bouton « + Nouveau ticket » : encadré brique, texte brique.
- **Typographie** : serif Georgia réservé à la marque et aux `h1` ; `h2`/`h3` et toute
  l'interface en sans système, 17 px, interligne 1,45.
- **Boutons** : primaire = fond `--brique`, texte blanc, radius 12 px ; secondaire = fond
  `--sable-fonce`, bordure `--bordure-input`. Noms d'action en sentence case (« Déclarer
  le ticket »).
- **États des tickets** : pilule d'étape **en cours = brique**, **travaux acceptés = olive**,
  **archivé = gris** ; le **nom de l'état est toujours affiché en texte** (jamais couleur
  seule). Mini-flow des cartes : étape actuelle = couleur de l'état, étapes faites =
  `--puce-faite`, à venir = `--puce-vide`.
- **Urgence / danger** : `--rouge` sémantique, inchangé.
- **Accessibilité** (règles vendored du skill `design-ergonomie`) : `:focus-visible` global
  = outline 2 px `--brique` ; bordures de champs ≥ 3:1 ; cibles ≥ 44 px ;
  `prefers-reduced-motion` respecté ; contrastes texte ≥ AA (blanc sur brique ≈ 6:1, sur
  olive ≈ 4,7:1, encre sur sable ≈ 12:1).
- **PWA / favicon** : pictogramme « toit en V imbriqués » blanc sur fond `--brique`
  (`src/public/icon.svg`, `icon-192.png`, `icon-512.png`) ; `theme-color` = `#9C4A2F` ;
  `manifest.webmanifest` : `theme_color` `#9C4A2F`, `background_color` `#F7F3EB`.
- **Zéro dégradé** ; aucun texte en capitales ; microcopy en français courant.
- **Mockups** : régénérés depuis les vues (`node scripts/render-mockups.js`), le
  `style.css` des mockups est copié depuis `src/public/style.css`.

Toute évolution ultérieure de l'identité passe par ce fichier (ou un nouveau fichier de
`spécifications/` si le sujet est neuf).
