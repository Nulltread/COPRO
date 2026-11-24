# Tantièmes — attribut des lots

Décision du demandeur : les tantièmes sont conservés **au niveau du lot** (et non de l'unité), le mapping lot ↔ unités n'existant pas à date. La seule source est la **clé de répartition CCG** (colonne « Valeur » de chaque lot) ; les autres fichiers (BAT A, BAT B, GARAGE A, GARAGE B, HORS LOT 39) sont **ignorés**.

## Affichage et gestion

- Les tantièmes figurent dans l'**onglet « Lots »** (voir `35-lots.md`), à côté de chaque lot. **Référentiel pur, sans aucun impact fonctionnel** : aucun montant, aucun appel de fonds, aucune facture, aucun lien avec la facturation.
- **Modification des valeurs : admin seul**, via l'onglet Lots, avec **modale de confirmation** ; chaque modification est **loguée avec son auteur et horodatée** (fil de suivi de la page).
- Les valeurs initiales proviennent du **script de peuplement depuis la CCG** (voir `35-lots.md`).

## Plus de page dédiée

- La page « Tantièmes » autonome prévue initialement est **supprimée** : les tantièmes vivent dans l'onglet Lots (lecture CS + admin, écriture admin seul).
