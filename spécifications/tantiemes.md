# Tantièmes — page dédiée

Décision du demandeur : les tantièmes sont précisés dans une **page dédiée, non liée à la facturation** ; la page « Comptes » (`/admin/comptes`, voir `comptes-et-roles.md`) est le modèle de référence (placement dans la barre de navigation, droits).

## Page « Tantièmes »

- Lien dans la **barre de navigation**, réservé au **gestionnaire** (CS/admin), à côté de « Comptes » et « Entreprises ».
- **Référentiel pur** : la page liste toutes les unités — **61 villas, 61 garages, parties communes** — avec pour chacune : **type**, **numéro**, **tantièmes généraux**, **tantièmes spéciaux**. **Aucun montant, aucun appel de fonds, aucune facture** sur cette page : la facturation (module charges, voir `socle-reglementaire.md`) lira ces tantièmes pour calculer les quotes-parts, sans jamais les modifier ni y être liée dans l'interface.
- **Champ de recherche plaintext à la volée** (comme la page Comptes) filtrant sur le **numéro** et le **type** d'unité.
- **Parties communes** : affichées pour information, sans tantièmes (pas de lot) — champ non éditable.

## Droits

- **Lecture** : gestionnaire (CS/admin).
- **Modification des valeurs** : **admin seul** — les tantièmes sont fixés par l'état descriptif de division / le règlement de copropriété et ne sont pas modifiables par la copropriété elle-même. En v1, les valeurs sont **en dur** (jeu de données de démonstration, voir `stockage-securite-deploiement.md`), modifiables par l'admin via un formulaire simple (un champ par tantième, **modale de confirmation**).

## Lien avec les unités

Les tantièmes sont un attribut des unités (voir `unites.md`) : toute modification est **loguée avec son auteur** (fil de suivi de la page, horodaté).
