---
name: design-ergonomie
description: >-
  Règles de design et d'ergonomie de l'application Copro (suivi de travaux et sinistres
  de copropriété). S'activer dès qu'une tâche touche à l'interface : nouvelle page ou
  nouveau composant, modification de style, revue d'ergonomie, d'accessibilité ou de
  qualité visuelle sur src/views/, src/public/, mockups/ ou tout écran de l'app.
---

# Design et ergonomie — Copro La Pinède de Notre Dame

Ce skill applique le design et l'ergonomie **en filigrane à tout le projet**. Il se
combine avec les spécifications du dossier `spécifications/` (voir
`spécifications/design-et-ergonomie.md`).

## Principes du projet (font foi)

Issus de `spécifications/vision-et-principes.md` et
`spécifications/fiche-ticket-et-ergonomie.md` :

- Utilisateurs **non techniques** : interface **simplissime**, **mobile-first**,
  chaque action atteignable en un minimum de clics.
- Interface en **français**, vocabulaire courant, aucune notion technique exposée.
- **Moins de texte explicatif** dans les pages : on ne ré-explique pas le
  fonctionnement des boutons.
- Cibles tactiles généreuses, focus clavier visible, états vides/erreur prévus,
  actions destructrices confirmées (modale) — cohérents avec les règles vendored
  ci-dessous.

## Références publiques vendored (épinglées, hors réseau)

- `references/vercel-web-interface-guidelines/AGENTS.md` — règles MUST / SHOULD /
  NEVER de Vercel (interactions, clavier, focus, cibles, formulaires, contenu,
  accessibilité, performance, design). Ignorer les passages spécifiques à
  React/Next.js : la stack ici est Express + EJS + CSS vanilla.
- `references/anthropics-frontend-design/SKILL.md` — direction visuelle délibérée
  (palette, typographie, mise en page) et microcopy en langage simple, voix active,
  nommer les choses comme l'utilisateur les comprend.
- Licences et provenance exactes : `references/SOURCES.md`.

**Ne jamais récupérer ces règles depuis le réseau à l'exécution** : les copies
vendored dans `references/` sont la source faisant foi. Toute mise à jour se fait en
re-vendoring un commit amont précis, avec sa licence, et en mettant à jour
`references/SOURCES.md`.

## Application

- **Précédence** : `spécifications/` du projet > références publiques vendored >
  habitudes génériques. En cas de conflit, les spécifications du projet gagnent.
- Toute tâche UI applique ces règles **dès la conception** (mockups, composants),
  pas seulement en revue.
- Toute revue d'interface produit des constats au format `fichier:ligne —
  [bloquant/majeur/mineur] — règle violée — correction proposée`, triés par
  sévérité. Un constat bloquant = obstacle clavier, nom absent sur un contrôle,
  contraste insuffisant sur le contenu principal, action destructive sans
  confirmation.

## Hors périmètre

Ce skill ne modifie pas la logique métier, les routes, la base de données ni les
règles de visibilité : il ne porte que sur l'interface (vues EJS, `src/public/`,
`mockups/`).
