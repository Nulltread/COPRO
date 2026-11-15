# Corrections d'affichage de la fiche ticket et bugs

En cas de contradiction, ce fichier (préfixe 23) prime sur `20-cycle-de-vie-des-tickets-v2.md` et les fichiers antérieurs pour les points ci-dessous.

## Fiche ticket

- **La section « Coût du ticket » disparaît** (elle fera l'objet de spécifications futures).
- **Boutons « Archiver » et « Supprimer » directement sous le titre** du ticket (à côté du titre/du badge URGENT), et non dans une section en bas de page. Il n'y a plus de section « Archiver le ticket » ni de section de suppression en bas. Les boutons sont **grisés (désactivés, avec explication au survol) quand l'action est inaccessible** ; quand ils sont actifs, une modale de confirmation s'ouvre avant l'action.
- **Pas de titre « Modifier le ticket »** : le formulaire d'édition ne contient que le champ description (pré-rempli) et le bouton d'enregistrement. La description en texte brut sous le chronogramme est retirée (le champ de saisie suffit) ; elle n'est affichée en lecture seule que quand le ticket n'est plus éditable (archivé).
- **Plus de ligne de commentaire sous le fil de suivi** : le fil est purement consultatif.
- **Unités concernées** : tant que le ticket est « Créé », modifiables comme l'édition (créateur, résidents concernés, CS/admin) ; **une fois passé en consultation, modifiables UNIQUEMENT par les membres du CS et l'admin** — les occupants voient alors un affichage simplifié (simple liste des unités, sans formulaire).

## Comptes-rendus d'intervention

- **Un compte-rendu d'intervention par personne concernée** (résident des unités du ticket, membre du CS, admin) — et non plus une instance par unité plus une pour le CS. Chacun rédige le sien (clé `ticket_id + user_id`). Un membre du CS également propriétaire d'une unité du ticket n'a qu'un seul compte-rendu.
- Des **photos peuvent être jointes lors de la saisie du compte-rendu**.

## Photos attachées à leur section

- Les photos sont attachées au **moment/section où elles sont saisies** et affichées dans cette section : création du ticket (sous la description), validation des travaux, réouverture, compte-rendu d'intervention. Il n'y a plus de section « Photos » globale.

## Affichage par sections selon les états atteints

- La fiche ticket est **par sections**, et seules les sections des **états en cours ou déjà passés** sont affichées. Aucune section d'un état non encore atteint n'est affichée (ex. : pas de comptes-rendus tant que le ticket n'a pas atteint « Travaux planifiés » ; pas de consultations/factures tant que le ticket est « Créé »).

## Bugs corrigés

- Le **service worker** sert désormais les assets (`app.js`, `style.css`) en **réseau d'abord** (cache uniquement hors-ligne) : auparavant le cache-first servait indéfiniment l'ancien `app.js`, ce qui cassait la recherche à la volée des comptes, la recherche des tickets et l'auto-submit des filtres.
- **Recherche des comptes** : champ plaintext filtrant à la volée (au fil de la saisie) la liste des comptes sur nom, prénom, numéro et type d'unité rattachée.
- **Recherche des tickets** : champ plaintext **pleine largeur** (au-dessus des filtres), sur titre + description uniquement, appliqué dès la saisie (debounce), parmi les tickets déjà filtrés.
- **Filtres état / unité / urgents** : appliqués dès la sélection (plus de bouton « Filtrer »).
