# Urgent, photos de la description, libellés et zone unique du bilan

En cas de contradiction, ce fichier (préfixe 31) prime sur `20-cycle-de-vie-des-tickets-v2.md`, `23-corrections-affichage-ticket.md`, `26-acceptation-dans-bilan-et-autosave.md`, `28-bilan-acceptation-refus.md`, `29-...md`, `30-...md` et les fichiers antérieurs pour tous les points ci-dessous.

## Toggle « urgent » sur la fiche ticket

- Un **toggle « 🚨 Urgent »** est affiché sur la fiche ticket (à côté du titre) et **modifiable uniquement tant que le ticket est à l'état « Créé »** (c'est-à-dire avant le passage en consultation par un membre du CS) — ensuite il est figé (comme le reste du ticket figé en archivé).
- **Qui peut basculer** : les acteurs du ticket — membres du CS, occupants (propriétaires/locataires) des unités concernées, et l'admin. (`POST /tickets/:id/urgent` ; refus 403 sinon.)

## Fiche ticket : libellés

- Section « Description » : le **titre du champ description est supprimé** (seul le titre de section « Description » reste ; le champ garde un `aria-label="Description"`).
- Le **titre « Unités concernées » est supprimé** : le placeholder du multiselect suffit.

## Photos de la section Description

- Tant que le ticket est à l'état **« Créé »** (pas encore passé en consultation), **toute personne concernée** (occupant d'une unité du ticket, membre du CS, admin) peut **ajouter et supprimer des photos** de la section Description (contexte « création »).
- Au passage en consultation (et ensuite), les photos de la description sont **figées** : plus d'ajout ni de suppression. (Remplace le « moment cadré n°1 » de la spec 20 pour la phase « Créé ».)

## Bilan : une seule zone commentaire + photos, boutons Accepter / Refuser

- Dans la section « Bilans de l'intervention », pour **l'éditeur courant** (personne concernée qui regarde sa propre zone), il y a **une seule zone éditable** : le texte du bilan + une zone photos (sauvegarde à la volée, spec 26). **Plus de formulaires séparés pour accepter et refuser.**
- Sous cette zone unique, **deux boutons côte à côte : « Accepter » et « Refuser »**, qui soumettent **le même contenu** (le texte de la zone sert de commentaire à l'acceptation/refus, les photos jointes partent avec). Chaque clic passe par une modale de confirmation (le bouton cliqué détermine l'action, via `formaction`).
- **Refus** : contrôle qu'il y a **au moins un commentaire ou une photo** (l'un des deux suffit — assouplissement de la spec 28 qui exigeait les deux).
- Les bilans (texte + photos) **des autres acteurs** et des **cycles précédents** restent visibles en lecture seule dans la même section (spec 28 inchangé).
