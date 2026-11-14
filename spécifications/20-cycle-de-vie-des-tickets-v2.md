# Cycle de vie des tickets — v2 (transitions contraintes)

En cas de contradiction, ce fichier (préfixe 20) prime sur `06-cycle-de-vie-des-tickets.md`, `07-documents-devis-factures-couts.md` et `11-comportements-constates-code-fonctionnels.md` pour tous les points ci-dessous.

## États

**créé → consultation → travaux planifiés → travaux acceptés → archivé**

L'état « validé » est **supprimé** : un ticket créé passe directement en **consultation**. Il n'y a plus de section « changer d'état » libre : selon l'état du ticket et les droits de l'utilisateur, **une seule section de transition** est affichée à la fois.

## Transitions et droits

| Transition | Qui | Conditions |
|---|---|---|
| créé → consultation | membre du CS ou admin | — |
| suppression du ticket | **créateur**, membre du CS ou admin | uniquement si le ticket est encore à l'état **« créé »** (jamais entré en consultation), avec modale de confirmation |
| → archivé | membre du CS ou admin | **à tout moment** (quel que soit l'état courant), mais **impossible tant qu'aucune facture n'est jointe** (voir Factures) |
| consultation → travaux planifiés | membre du CS ou admin | en **validant au moins une consultation** complète (voir ci-dessous) |
| travaux planifiés → travaux acceptés | tous les propriétaires et locataires des unités concernées | **tous** doivent avoir explicitement validé (voir Validations) |
| travaux acceptés → archivé | automatique | après le délai réglé (défaut **31 jours**, panneau d'administration `19`), **uniquement si au moins une facture est jointe** ; sinon le ticket reste en « travaux acceptés » |

- **Archivé** : le ticket reste **consultable** mais est **plus jamais éditable** (plus aucune modification, commentaire, photo, consultation, facture ni transition).

## Consultations (état « consultation »)

- Seuls les **membres du CS et l'admin** peuvent **ajouter, modifier ou supprimer** une consultation.
- Une **consultation** est un tuple composé de :
  - une **entreprise** (obligatoire) — choisie parmi les entreprises connues ou **créée à la volée** depuis le formulaire (voir `21-entreprises.md`) ;
  - **un ou plusieurs devis**, chacun composé d'une **pièce jointe** (fichier) et d'un **montant** ;
  - une **date**.
- **Plusieurs consultations en parallèle** sont possibles (mise en concurrence).
- **Passage en « travaux planifiés »** : le membre du CS / admin **valide au moins une consultation**, ce qui exige que :
  - la fiche de l'entreprise soit **strictement complète** (raison sociale, SIREN/SIRET, nom du contact, téléphone, mail — **tous** remplis) ;
  - la consultation comporte **au moins un devis** (pièce jointe + montant) ;
  - une **date planifiée** soit renseignée.
- Les consultations **non validées restent consultables** sur le ticket. Une fois le ticket en « travaux planifiés », **toutes les consultations passent en lecture seule**.

## Validations des travaux (planifié → acceptés)

- Le passage à « travaux acceptés » n'est possible que si **tous les propriétaires et locataires des unités concernées** ont explicitement validé.
  - **Garage = villa** : même process (tous les propriétaires et locataires du garage concerné doivent valider).
  - **Parties communes** : **au moins un membre du CS** doit valider (les parties communes sont rattachées au CS).
- Chaque validation peut s'accompagner d'un **commentaire et/ou d'une ou plusieurs photos** (facultatifs).

## Travaux acceptés : archivage automatique et réouverture

- Le ticket reste en « travaux acceptés » pendant le délai réglé (défaut **31 jours**), puis est **archivé automatiquement** — uniquement si au moins une facture est jointe (voir Factures).
- **Notifications à J-3 et à J-1** avant l'archivage automatique aux **membres du CS et aux propriétaires/locataires concernés** (in-app + email si activé), chacune envoyée une seule fois.
- Pendant ces 31 jours, **réouverture** possible par n'importe quel **propriétaire ou locataire concerné** (pour les parties communes : au moins un membre du CS), moyennant un **commentaire obligatoire** et **au moins une photo**.
- À la réouverture, le ticket **repasse en « consultation »** :
  - les **consultations précédentes deviennent caduques** (conservées, en lecture seule) : il faut en créer de nouvelles pour avancer ;
  - les **validations précédentes deviennent caduques** (conservées, en lecture seule) : de nouvelles validations de tous les concernés sont requises pour repasser en « travaux acceptés » ;
  - le ticket **reprend son cycle normal**.

## Factures

- Les **membres du CS et l'admin** peuvent ajouter des **factures** (PDF + coût) **tant que le ticket n'est pas archivé** (« jusqu'à l'archivage »), dans une **section dédiée** du ticket.
- **Aucun archivage** (manuel ni automatique) n'est possible tant qu'**aucune facture** n'est jointe au ticket.

## Photos

- Des photos ne peuvent être ajoutées qu'aux **trois moments cadrés** :
  1. **création** du ticket ;
  2. **validation des travaux** (planifié → acceptés ; facultatif) ;
  3. **réouverture** (acceptés → consultation ; **au moins une photo obligatoire**).
- **Nulle part ailleurs** : plus d'ajout de photos en édition ou en cours de cycle.

## Section documents

- La **section documents disparaît purement et simplement**. Elle est remplacée par les **consultations** (devis, en état « consultation ») et la **section factures**.
- **Avenants** : plus de catégorie dédiée. Un avenant se gère en **supprimant un devis précédent et en ajoutant un nouveau devis dans une consultation** — uniquement en état « consultation » (ce qui est rendu possible par la réouverture acceptés → consultation).

## Édition du ticket

- Tant que le ticket n'est **pas archivé**, sa description (et ses unités, selon les règles existantes de `06`) reste modifiable par le créateur, les résidents concernés ou le gestionnaire ; **chaque modification est loguée avec son auteur** dans le fil de suivi. Une fois archivé, le ticket est figé.
