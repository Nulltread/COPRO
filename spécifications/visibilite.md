# Visibilité des données

## Principe général : lecture ouverte

- Tout utilisateur connecté ayant **au moins une unité validée** voit **tous les tickets**, même ceux des unités dont il n'est pas résident. Les filtres d'affichage sont par défaut positionnés sur les unités du résident, mais **sans aucune restriction**.
- Cas particulier du compte **sans aucune unité validée** : il ne voit aucun ticket (voir `rattachements.md`). Le compte **admin** voit tous les tickets sans condition d'unité.

## Par type de contenu

- **Tickets, fil de suivi, consultations, factures** : lisibles par tous les utilisateurs pouvant voir le ticket.
- **Écriture sur les consultations, devis et factures** : réservée au gestionnaire (CS/admin) — voir `consultations-entreprises-factures.md`.
- **Section « Bilans de l'intervention »** de la fiche ticket : visible **uniquement aux personnes concernées** (occupants des unités du ticket + membres du CS, admin exclu) — voir `bilans-de-intervention.md`.
- **Fichiers** (photos, documents) : servis uniquement via l'application, après authentification et vérification des droits, en ligne (`inline`) avec l'en-tête `nosniff` — **pas d'URL publiques directes** (voir `stockage-securite-deploiement.md`).
