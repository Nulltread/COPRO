# Gestion des comptes — conseil syndical et recherche

En cas de contradiction, ce fichier (préfixe 17) prime sur `02-roles-et-comptes.md` et `11-comportements-constates-code-fonctionnels.md` pour les points ci-dessous.

## Ajout / retrait du statut conseil syndical, avec confirmation

- L'**administrateur ET tout membre du conseil syndical** peuvent :
  - **ajouter** le statut CS à un compte non-admin (y compris à eux-mêmes si déjà membres, et à tout autre compte non-admin) ;
  - **retirer** le statut CS (à un autre membre du CS ou à eux-mêmes).
- Chaque ajout ou retrait passe par une **modale de confirmation** (ou équivalent) : texte explicite (« Confirmer l'ajout de « Prénom Nom » au conseil syndical ? » / « Confirmer le retrait du conseil syndical de « Prénom Nom » ? »), boutons **Confirmer** / **Annuler**. Aucun changement n'est appliqué sans confirmation explicite.

## Recherche plaintext sur la liste des comptes

- La liste des comptes (page de gestion des comptes, réservée au gestionnaire) comporte un **champ de recherche texte plaintext** qui filtre **à la volée** (côté client, sans rechargement de page).
- La recherche porte sur : **nom**, **prénom**, **numéro de l'unité rattachée** (ex. « 12 » trouve les comptes rattachés à la villa 12 ou au garage 12) et **type de l'unité rattachée** (villa / garage / parties communes).
