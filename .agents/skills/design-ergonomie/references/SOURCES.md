# Sources des références vendored

Fichiers copiés tels quels depuis des dépôts publics, épinglés à un commit précis le
2026-11-17. Ne pas modifier ces fichiers à la main : toute mise à jour consiste à
re-vendorer un nouveau commit amont et à mettre à jour ce tableau.

| Référence | Dépôt amont | Commit | Fichiers vendored | Licence |
|---|---|---|---|---|
| Vercel — Web Interface Guidelines (règles MUST/SHOULD/NEVER) | `vercel-labs/web-interface-guidelines` | `434b7f91364665f2f733b310ec54809bf8f37937` | `vercel-web-interface-guidelines/AGENTS.md`, `vercel-web-interface-guidelines/LICENSE` | MIT (Copyright (c) 2025 Vercel Labs) |
| Anthropic — skill `frontend-design` | `anthropics/skills` | `e4bb5d960d87126ff3b3a8af1a104b7db67560ba` | `anthropics-frontend-design/SKILL.md`, `anthropics-frontend-design/LICENSE.txt` | Apache-2.0 |

## Audit de sécurité (2026-11-17)

- Contenus lus en entier avant vendoring : markdown et licence uniquement, **aucun
  script, aucun hook, aucune commande externe, aucun appel réseau à l'exécution**.
- La variante « wrapper » `web-design-guidelines` de `vercel-labs/agent-skills` est
  **volontairement exclue** : elle ordonne de fetcher des règles depuis une URL
  distante à chaque exécution (risque d'injection et de panne hors ligne). Seuls les
  fichiers de règles statiques sont vendored ici.
