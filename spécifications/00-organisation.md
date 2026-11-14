# Organisation des spécifications

Ce dossier est l'emplacement canonique des spécifications du projet. À chaque nouvelle session, relire l'ensemble des fichiers de ce dossier, dans l'ordre de leur préfixe numérique.

## Sources historiques

Les spécifications ont été initialement consignées dans :

- `PROMPT.md` : brief initial (vision, rôles, cycle de vie, stockage, contraintes techniques).
- `SPEC.md` (branche `vibe/prompt-roles-cycle-2e0696`) : décisions validées avec le demandeur, qui **complètent et priment sur `PROMPT.md`** en cas de contradiction pour les points listés.

## Règle de priorité

En cas de contradiction entre deux fichiers de ce dossier, le fichier au préfixe le plus élevé fait foi (les décisions les plus récentes écrasent les plus anciennes). Les points de `PROMPT.md` non repris par `SPEC.md` restent valables.

## Découpage

| Fichier | Contenu |
|---|---|
| `01-vision-et-contexte.md` | Contexte, objectifs, livrables |
| `02-roles-et-comptes.md` | Rôles, comptes, auto-inscription |
| `03-unites.md` | Villas, garages, parties communes |
| `04-rattachements.md` | Rattachement d'un compte à une unité |
| `05-visibilite.md` | Règles de visibilité des données |
| `06-cycle-de-vie-des-tickets.md` | États et transitions des tickets |
| `07-documents-devis-factures-couts.md` | Photos, devis, factures, décisions, comptes-rendus, coûts |
| `08-notifications.md` | Notifications |
| `09-recherche-filtres-tableau-de-bord.md` | Recherche, filtres, tableau de bord |
| `10-stockage-et-contraintes-techniques.md` | Stockage des fichiers, stack, sécurité, RGPD |
| `11-comportements-constates-code-fonctionnels.md` | Comportements présents dans le code et absents des specs ci-dessus (inventaire) |
| `12-comportements-constates-code-techniques.md` | Comportements techniques/sécurité présents dans le code et absents des specs ci-dessus (inventaire) |
| `16-serveur-mail-et-domaine.md` | Serveur mail auto-hébergé, domaine `copro-pinede-gardanne.fr`, notifications par email, confirmation de compte par email, liste de diffusion du CS |

Les fichiers `11` et `12` sont un inventaire neutre du code existant : ils décrivent ce que fait l'application, sans le prescrire.
