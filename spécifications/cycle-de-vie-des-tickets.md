# Cycle de vie d'un ticket

## États

**créé → consultation → travaux planifiés → travaux acceptés → archivé**

Il n'y a pas d'autre état (l'ancien état « validé » a été supprimé : un ticket créé passe directement en consultation). Il n'y a **plus de changement d'état libre** : selon l'état du ticket et les droits de l'utilisateur, **une seule section de transition** est affichée à la fois.

## Transitions et droits

| Transition | Qui | Conditions |
|---|---|---|
| créé → consultation | membre du CS ou admin | — |
| consultation → travaux planifiés | membre du CS ou admin | en **validant au moins une consultation complète** (voir `consultations-entreprises-factures.md`) |
| travaux planifiés → travaux acceptés | **un seul acceptant suffit** : un occupant (propriétaire ou locataire) d'une unité concernée, ou un membre du CS (admin exclu) | via le bouton « Accepter » de son bilan ; commentaire et/ou photos facultatifs (voir `bilans-de-intervention.md`) |
| travaux planifiés → consultation (**refus**) | tout occupant d'une unité du ticket ou membre du CS (admin exclu) | via le bouton « Refuser » ; **commentaire ou au moins une photo obligatoire** (l'un des deux suffit) |
| → archivé (manuel) | membre du CS ou admin | **à tout moment**, quel que soit l'état courant ; **aucune condition de facture** |
| travaux acceptés → archivé (automatique) | automatique | après le délai réglable (défaut **31 jours**, voir `administration.md`) ; aucune condition de facture ; notifications à J-3 et J-1 aux membres du CS et aux occupants concernés |
| travaux acceptés → consultation (**réouverture**) | tout propriétaire ou locataire concerné (pour les parties communes : au moins un membre du CS) | **commentaire obligatoire ET au moins une photo obligatoire** |
| suppression du ticket | **créateur**, membre du CS ou admin | uniquement si le ticket est encore à l'état **« créé »** (jamais entré en consultation), avec **modale de confirmation** ; suppression en cascade (unités, événements, fichiers, bilans, acceptations, notifications) |

## Archivé

- Le ticket archivé reste **consultable sans limite de durée** (historique de la copropriété) mais est **plus jamais éditable** : aucune modification, commentaire, photo, consultation, facture ni transition. Le conseil syndical peut archiver n'importe quel ticket.

## Retours en « consultation » (réouverture ou refus)

- Les **consultations précédentes deviennent caduques** (conservées en lecture seule) : il faut en créer de nouvelles pour avancer.
- Les **acceptations/validations précédentes deviennent caduques** (conservées en lecture seule).
- Les **bilans précédents sont figés définitivement** en lecture seule (voir `bilans-de-intervention.md`).
- Une **nouvelle instance** de la phase « consultation » s'ouvre ; le ticket reprend son cycle normal.

## Création (état « créé »)

- **Compte requis** ; un résident **sans unité validée ne peut pas créer de ticket** (voir `rattachements.md`).
- Le résident choisit librement les unités concernées : **au moins une de ses propres villas/garages** (ses unités sont présélectionnées), mais il peut en ajouter d'autres. Les **parties communes** sont réservées au CS/admin.
- Formulaire minimal (ordre des champs, voir `fiche-ticket-et-ergonomie.md`) : titre court (max **120 caractères**, pas de catégorie de travaux), toggle « urgent », description, photos, sélection multiple des unités.
- La liste des unités reste **modifiable après création** selon les règles d'édition ci-dessous.

## Édition

- Tant que le ticket n'est **pas archivé**, sa **description** et ses **unités** restent modifiables par le **créateur, les résidents concernés ou le gestionnaire** ; chaque modification est **loguée avec son auteur** dans le fil de suivi.
- **Unités** : à l'état « créé », mêmes droits qu'à la création (au moins une unité personnelle, parties communes réservées au gestionnaire) ; **une fois passé en consultation, modifiables uniquement par les membres du CS et l'admin** — les occupants voient alors une simple liste des unités (sans formulaire).
- Une fois **archivé**, le ticket est figé.

## Indicateur « urgent »

- Toggle **« 🚨 Urgent »** à la création (sous le titre) et sur la fiche ticket (à côté du titre).
- **Modifiable uniquement tant que le ticket est à l'état « créé »**, par les **acteurs du ticket** : membres du CS, occupants (propriétaires/locataires) des unités concernées, et admin. Ensuite figé.
- Un ticket urgent porte la mention **« URGENT »** dans les notifications (voir `notifications.md`), sans modifier son parcours.

## Fil de suivi

- Chaque événement (création, changement d'état avec motif facultatif, éditions, fichiers, bilans, acceptations/refus) est **horodaté et porte son auteur**, dans un fil visible par tous les utilisateurs connectés.
- Le fil est **purement consultatif** : il n'y a plus de zone de commentaire sous le fil.
