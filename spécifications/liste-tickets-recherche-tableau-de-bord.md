# Liste des tickets, recherche, filtres et tableau de bord

## Recherche

- **Champ de recherche plaintext pleine largeur**, au-dessus des filtres, portant **uniquement sur le titre et la description** du ticket, appliqué **dès la saisie** (debounce), parmi les tickets déjà filtrés.

## Filtres

- Appliqués **dès la sélection** (plus de bouton « Filtrer ») :
  - par **unité** : composant **multiselect « search »** (champ texte, dropdown des 5 premiers résultats affinée à la saisie, puces retirables à gauche du texte). Côté serveur, le paramètre `unite` accepte **plusieurs valeurs** (`unite=1&unite=2`) ; la valeur spéciale `toutes` = toutes les unités ; **aucune sélection** = comportement par défaut (mes unités pour un résident, toutes les unités sinon) ;
  - par **état** ;
  - par **urgence**.
- **Plus de filtre « coût min »**.
- Par défaut, la liste est **filtrée sur les unités du résident** (sans restriction de visibilité — voir `visibilite.md`) ; l'utilisateur peut voir toutes les unités.
- Par défaut, les tickets **archivés sont masqués** ; ils restent consultables en choisissant explicitement l'état « Archivé » dans le filtre.

## Tri et affichage des cartes

- **Tri par défaut** : tickets **urgents d'abord**, puis par **date de création croissante** (le plus ancien en premier).
- Chaque carte affiche un **mini flowchart** (petits cercles reliés par des lignes) : étapes passées en gris, **étape en cours en couleur** avec le **nom du statut en pastille colorée**, et les **unités concernées en bas à droite** de la carte (voir `fiche-ticket-et-ergonomie.md`).

## Tableau de bord

- Réservé au **conseil syndical et à l'admin**.
- Indicateurs : **tickets ouverts** (non archivés), tickets **en consultation** (en attente de validation d'une consultation), tickets **urgents** (non archivés), **coûts cumulés** (montants des consultations validées + total facturé sur l'ensemble de la copropriété), et **activité récente** (10 derniers tickets modifiés).
- Le mini flowchart est aussi affiché sur le tableau de bord.
