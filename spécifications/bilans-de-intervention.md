# Bilans de l'intervention

Anciennement « compte-rendu d'intervention ». Ce n'est **pas un document uploadé** : c'est un **champ du ticket rédigé dans l'app**.

## Qui rédige un bilan

- **Un bilan par personne concernée** : les résidents (propriétaires et locataires) des unités du ticket **et les membres du conseil syndical** — clé `ticket_id + user_id`. Un membre du CS également occupant d'une unité du ticket n'a **qu'un seul** bilan.
- L'**admin est exclu** : jamais de bilan pour lui, et plus généralement **jamais inclus dans un quorum** d'action sur un ticket (validation, réception, réouverture) — son rôle se limite à administrer le site.

## Visibilité et affichage de la section

- La section « Bilans de l'intervention » est visible **uniquement aux personnes concernées** (occupants des unités du ticket + membres du CS, admin exclu) ; les autres utilisateurs connectés ne la voient pas.
- Elle est affichée à partir de l'état **« travaux planifiés »** (ou si le ticket l'a déjà été, y compris archivé — alors en lecture seule).
- Le **cycle courant** est affiché en premier, directement (pas de titre « Bilan du cycle N »). Chaque bilan (par personne concernée) est une **sous-section séparée par un trait gris discret**.
- Les **cycles précédents** sont dans une **sous-section repliable, repliée par défaut** (`<details>` fermé), dont le titre porte la **date du changement d'état** (dernier retour en consultation enregistré dans le fil de suivi). Chaque cycle précédent garde sa date de fin (« figé le … ») en lecture seule.
- Pour les **autres** personnes concernées, on affiche leur **nom et prénom** ; leurs commentaires et photos sont consultables en lecture seule par les personnes concernées. La phrase explicative « un bilan par personne concernée… » est masquée partout où elle apparaît.

## Zone d'édition et autosave

- La zone d'édition est **celle de l'utilisateur courant** sur la page ticket ; les photos jointes au bilan sont les siennes.
- **Une seule zone éditable** : le texte du bilan + une zone photos. **Sauvegarde à la volée** (autosave ~600 ms après la saisie, indicateur « ✓ enregistré », envoi en arrière-plan ; les photos sélectionnées sont envoyées immédiatement avec le texte courant) — plus de bouton « Enregistrer ». Aucun rechargement de page.

## Boutons « Accepter » / « Refuser »

- Sous la zone unique, **deux boutons côte à côte** : **« Accepter » (bleu)** et **« Refuser » (rouge)**, qui soumettent **le même contenu** (le texte de la zone sert de commentaire à l'action, les photos jointes partent avec). Chaque clic passe par une **modale de confirmation** (le bouton cliqué détermine l'action).
- Les boutons ne sont visibles **que** si le ticket est à l'état **« travaux planifiés »** et si l'utilisateur courant est une **personne concernée** (occupant d'une unité du ticket ou membre du CS ; admin exclu). Chacun ne voit et n'utilise **que son propre bloc**.
- Dès que le ticket passe en **« travaux acceptés »**, toute la section bilan passe en **lecture seule** et les boutons disparaissent.

## Sémantique des actions

- **Acceptation** : le ticket passe en « travaux acceptés » dès qu'**au moins un** occupant d'une unité concernée (locataire ou propriétaire) **ou un membre du CS** a cliqué sur « Accepter » — **un seul acceptant au total suffit**. Le commentaire et les photos restent **facultatifs** sur l'acceptation.
- **Refus** : tout occupant d'une unité du ticket ou tout membre du CS peut refuser. Le ticket **repasse en « consultation »** avec **commentaire ou au moins une photo obligatoire** (l'un des deux suffit). Les consultations précédentes et les éventuelles acceptations précédentes deviennent **caduques** (conservées en lecture seule) et une **nouvelle instance** de consultations s'ouvre.

## Acceptations matérialisées et autres blocs de la section

- La section « Acceptations des travaux » (à l'état « travaux acceptés ») **n'existe plus** : les acceptations sont matérialisées dans la section « Bilans » sous forme de **pastilles** : « ✅ <nom> a accepté » (avec le commentaire éventuel), « 📄 caduque (lecture seule) » pour les acceptations des cycles précédents.
- Restent également dans la section « Bilans » : le bloc Accepter/Refuser (état « travaux planifiés »), les photos d'acceptation, la **date d'archivage automatique**, le formulaire de **réouverture** (état « travaux acceptés » : commentaire obligatoire + au moins une photo obligatoire) et les photos de réouverture.

## Figeage des bilans au repassage en consultation

- Dès qu'un ticket **repasse en « consultation »** (réouverture depuis « travaux acceptés », ou refus depuis « travaux planifiés »), **tous les bilans précédents sont enregistrés et figés en lecture seule de façon définitive** : jamais modifiables, jamais supprimables, toujours consultables par les personnes concernées.
- Lorsque les travaux correctifs sont effectués à nouveau, il s'agit d'un **tout nouveau bilan** (nouveau cycle) : les anciens bilans restent dans l'historique en lecture seule.
