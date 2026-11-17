# Design et ergonomie en filigrane du projet

Décision : le **design et l'ergonomie sont un fil conducteur de toutes les évolutions**
de l'interface, pas une passe en fin de projet. L'objectif est l'adhésion rapide des
résidents, utilisateurs non techniques.

## Skill `design-ergonomie`

- **Emplacement** : `.agents/skills/design-ergonomie/SKILL.md` (format Agent Skills),
  avec les références publiques vendored dans `.agents/skills/design-ergonomie/references/`.
- **Chargement à chaque session** : via `AGENTS.md` à la racine du dépôt, qui ordonne
  de lire `spécifications/` puis ce skill.
- **Sources publiques épinglées** (voir `references/SOURCES.md`) :
  - Vercel, *Web Interface Guidelines* (règles MUST/SHOULD/NEVER : interactions,
    clavier, focus, cibles tactiles, formulaires, accessibilité, contenu) — licence
    **MIT**, commit `434b7f91364665f2f733b310ec54809bf8f37937` ;
  - Anthropic, skill `frontend-design` (direction visuelle délibérée + microcopy en
    langage simple) — licence **Apache-2.0**, commit
    `e4bb5d960d87126ff3b3a8af1a104b7db67560ba`.
- **Audit de sécurité** : contenus lus en entier avant copie — markdown/licence
  uniquement, aucun script ni appel réseau à l'exécution. La variante « wrapper » de
  `vercel-labs/agent-skills` (fetch de règles distantes à chaque exécution) est
  volontairement exclue ; seules les règles statiques sont vendored. Toute mise à
  jour = re-vendoring d'un commit amont précis, licence incluse, documenté dans
  `references/SOURCES.md`.

## Règles d'application

- Toute tâche touchant l'interface (vues EJS, `src/public/`, `mockups/`) applique le
  skill `design-ergonomie` **et** les règles de `vision-et-principes.md` et
  `fiche-ticket-et-ergonomie.md`, dès la conception.
- **Précédence** : `spécifications/` > références publiques vendored > habitudes
  génériques de l'agent.
- Toute revue d'interface produit des constats `fichier:ligne` avec sévérité
  (bloquant / majeur / mineur), triés par sévérité.
- Le skill ne porte que sur l'interface : il ne modifie jamais la logique métier, les
  routes, la base de données ni les règles de visibilité.
