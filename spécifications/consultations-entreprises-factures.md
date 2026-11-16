# Consultations, entreprises et factures

La section « documents » des tickets n'existe plus : elle est remplacée par la section **Consultation** (état « consultation ») et la section **Factures** de la fiche ticket (voir `fiche-ticket-et-ergonomie.md`).

## Consultations (état « consultation »)

- Seuls les **membres du CS et l'admin** peuvent **ajouter, modifier ou supprimer** une consultation.
- Une **consultation** est un tuple composé de :
  - une **entreprise** (obligatoire) — choisie parmi les entreprises connues ou **créée à la volée** depuis le formulaire (modale contenant les champs de la fiche entreprise ; création effective à l'enregistrement de la consultation) ;
  - **un ou plusieurs devis**, chacun composé d'une **pièce jointe** (fichier) et d'un **montant** ;
  - une **date** (date d'intervention).
- **Plusieurs consultations en parallèle** sont possibles (mise en concurrence).
- Affichage : **liste de tuples {Entreprise, devis, prix, date d'intervention, bouton de choix}**, plus un bouton **« ajouter »** qui ajoute une ligne (formulaire de saisie) à la liste. Ordre : d'abord les consultations **actives** (cycle en cours), puis les consultations **caduques** (cycles précédents, en lecture seule).
- Le **bouton de choix** d'une consultation active **valide** celle-ci et fait passer le ticket en « travaux planifiés ». La validation exige que :
  - la fiche de l'entreprise soit **strictement complète** : raison sociale, SIREN/SIRET, nom du contact, téléphone, mail — **tous** remplis ;
  - la consultation comporte **au moins un devis** (pièce jointe + montant) ;
  - une **date planifiée** soit renseignée.
- Les consultations **non validées restent consultables** sur le ticket. Une fois le ticket en « travaux planifiés », **toutes les consultations passent en lecture seule**.

## Référentiel des entreprises

- Les **membres du CS et l'admin** disposent d'une **page de gestion des entreprises**, ouverte depuis la **barre de navigation** (lien visible uniquement pour ces rôles) : on peut y **ajouter** une entreprise et **modifier** une fiche existante.
- **Fiche entreprise** : **raison sociale** (obligatoire) ; **SIREN/SIRET** (un seul champ texte) ; **nom du contact** ; **téléphone** ; **mail**.
- **Non-suppression** : une entreprise figurant dans au moins une consultation d'un ticket (quel que soit l'état du ticket) **n'est plus supprimable** ; elle reste **modifiable**. Tant qu'elle n'est utilisée dans aucune consultation, elle peut être supprimée depuis la page de gestion.

## Avenants

- Plus de catégorie dédiée « avenant » : un avenant se gère en **supprimant un devis précédent et en ajoutant un nouveau devis dans une consultation** — uniquement à l'état « consultation » (ce que rend possible la réouverture, voir `cycle-de-vie-des-tickets.md`).

## Factures

- Section dédiée de la fiche ticket. Les **membres du CS et l'admin** peuvent ajouter des **factures** (PDF + coût) **tant que le ticket n'est pas archivé**.
- **Archivage** (manuel par le CS/admin, ou automatique après le délai réglable en « travaux acceptés ») : **aucune condition de facture**.
- Règle cible documentée mais **« en sommeil » en v1** : la validation de la **réception des travaux** par au moins un **membre du conseil syndical (jamais l'admin)** exigerait qu'au moins une facture soit jointe au ticket (bouton grisé + explication tant qu'il n'y a pas de facture ; rejet côté serveur sinon). En v1, **aucune facture n'est exigée** pour accepter, refuser ou archiver, tant que la fonctionnalité « factures » n'est pas active. Pour un ticket sur les seules parties communes, la réception par un membre du CS suffirait (pas de résident à valider).
- À la réouverture (travaux acceptés → consultation), une éventuelle réception précédente devient caduque comme les autres validations.

## Coûts

- Il n'y a **plus de section « Coût du ticket »** sur la fiche, ni de **filtre « coût min »** sur la liste des tickets. Les montants figurent dans les consultations (devis) et les factures ; le tableau de bord affiche des coûts cumulés (voir `liste-tickets-recherche-tableau-de-bord.md`).
