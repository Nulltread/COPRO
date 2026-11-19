# Consultations, entreprises et factures

La section « documents » des tickets n'existe plus : elle est remplacée par la section **Consultation** (état « consultation ») et la section **Factures** de la fiche ticket (voir `fiche-ticket-et-ergonomie.md`).

## Consultations (état « consultation »)

- Seuls les **membres du CS et l'admin** peuvent **ajouter, modifier ou supprimer** une consultation.
- Une **consultation** est un tuple composé de :
  - une **entreprise** (**obligatoire**, marquée de l'étoile rouge `*`) — choisie parmi les entreprises connues ou **créée à la volée** depuis le formulaire : la modale « Créer et utiliser » recopie la fiche dans les champs cachés du formulaire et affiche la raison sociale saisie dans l'option du sélecteur (valeur `nouvelle`) ; la **création effective a lieu à la soumission du formulaire** (bouton « Ajouter ») ;
  - **un seul devis** par consultation : **pièce jointe (PDF ou image) + montant** ;
  - une **date d'intervention facultative à la création** — elle ne devient **obligatoire que lors de la sélection** de la consultation (voir ci-dessous).
- **Plusieurs consultations en parallèle** sont possibles (mise en concurrence).
- Affichage : **liste de tuples {case à cocher, Entreprise, devis, prix, date d'intervention}**, puis un **formulaire d'ajout directement visible** (pas de bouton intermédiaire) : les champs de saisie sont directement éditables et un **seul bouton « Ajouter »** récupère les champs saisis et les persiste en un seul envoi. Ordre de la liste : d'abord les consultations **actives** (cycle en cours), puis les consultations **caduques** (cycles précédents, en lecture seule).
- **Sélection (validation)** : chaque consultation active porte une **case à cocher** (`form="form-selectionner"`) ; un **bouton global « Sélectionner »**, après la liste, soumet toutes les consultations cochées (POST `/consultations/selectionner`) avec une **modale de confirmation**. Les **mêmes vérifications s'appliquent à chaque consultation sélectionnée**, quel que soit leur nombre : fiche entreprise **strictement complète** (raison sociale, SIREN/SIRET, contact, téléphone, mail), **exactement 1 devis** (pièce jointe + montant > 0) et **date planifiée renseignée**. Si une seule est incomplète, aucune n'est sélectionnée (400 avec le nom des entreprises concernées). Sinon, toutes les cochées passent « VALIDÉE » et le ticket passe en « Travaux planifiés ».
- La **suppression** d'une consultation active se fait par une **icône poubelle en haut à droite de la carte** (modale de confirmation), comme la suppression des photos — plus de bouton texte.
- Les consultations **non sélectionnées restent consultables** sur le ticket. Une fois le ticket en « travaux planifiés », **toutes les consultations passent en lecture seule**.

## Devis (1 seul par consultation)

- Le devis s'ajoute comme les photos : un **carré « + » avec un logo fichier 📄** (zone `zone-devis`) ; à la sélection, une **tuile explicite** apparaît (miniature image, ou logo 📄 + nom du fichier pour un PDF), **supprimable** (poubelle sur la tuile) tant que la consultation est ouverte, et **1 seul devis par consultation** (choisir un nouveau fichier remplace l'ancien).
- Un champ **montant (€), obligatoire** (étoile rouge), apparaît sous la zone.
- Dans le formulaire « Modifier cette consultation », le champ devis **remplace** l'ancien (fichier + montant).

## Référentiel des entreprises

- Les **membres du CS et l'admin** disposent d'une **page de gestion des entreprises**, ouverte depuis la **barre de navigation** (lien visible uniquement pour ces rôles) : on peut y **ajouter** une entreprise et **modifier** une fiche existante.
- **Fiche entreprise** : **raison sociale** (obligatoire) ; **SIREN/SIRET** (un seul champ texte) ; **nom du contact** ; **téléphone** ; **mail**.
- **Non-suppression** : une entreprise figurant dans au moins une consultation d'un ticket (quel que soit l'état du ticket) **n'est plus supprimable** ; elle reste **modifiable**. Tant qu'elle n'est utilisée dans aucune consultation, elle peut être supprimée depuis la page de gestion.

## Avenants

- Plus de catégorie dédiée « avenant » : un avenant se gère en **remplaçant le devis** d'une consultation (formulaire « Modifier », à l'état « consultation » — ce que rend possible la réouverture, voir `cycle-de-vie-des-tickets.md`).

## Factures

- Section dédiée de la fiche ticket. Les **membres du CS et l'admin** peuvent ajouter des **factures** (PDF + coût) **tant que le ticket n'est pas archivé**.
- **Archivage** (manuel par le CS/admin, ou automatique après le délai réglable en « travaux acceptés ») : **aucune condition de facture**.
- Règle cible documentée mais **« en sommeil » en v1** : la validation de la **réception des travaux** par au moins un **membre du conseil syndical (jamais l'admin)** exigerait qu'au moins une facture soit jointe au ticket (bouton grisé + explication tant qu'il n'y a pas de facture ; rejet côté serveur sinon). En v1, **aucune facture n'est exigée** pour accepter, refuser ou archiver, tant que la fonctionnalité « factures » n'est pas active. Pour un ticket sur les seules parties communes, la réception par un membre du CS suffirait (pas de résident à valider).
- À la réouverture (travaux acceptés → consultation), une éventuelle réception précédente devient caduque comme les autres validations.

## Coûts

- Il n'y a **plus de section « Coût du ticket »** sur la fiche, ni de **filtre « coût min »** sur la liste des tickets. Les montants figurent dans les consultations (devis) et les factures ; le tableau de bord affiche des coûts cumulés (voir `liste-tickets-recherche-tableau-de-bord.md`).
