# Gestion du bilan, acceptation et refus des travaux

En cas de contradiction, ce fichier (préfixe 28) prime sur `20-cycle-de-vie-des-tickets-v2.md`, `23-corrections-affichage-ticket.md`, `24-factures-reception-travaux.md`, `25-bilan-et-quorum-validation.md`, `26-acceptation-dans-bilan-et-autosave.md` et les fichiers antérieurs pour tous les points ci-dessous.

## Principe général : consultation et bilan ont le même comportement de phase

- La partie **Consultation** et la partie **Bilan** ont un comportement **identique** : chaque phase est **modifiable jusqu'à la transition** qui la quitte, puis passe en **lecture seule** une fois la transition effectuée.
- Tout **repassage en « consultation »** (réouverture depuis « Travaux acceptés », ou refus depuis « Travaux planifiés ») ouvre une **nouvelle instance** de la phase « consultation », tout en **conservant l'historique** des instances précédentes en lecture seule (caduques). Idem pour les bilans : figeage définitif, puis tout nouveau bilan au cycle suivant.

## Factures : la réception des travaux est « en sommeil » en v1

- Le point des specs 24/25 « la validation de la réception des travaux par un membre du CS exige au moins une facture jointe » est **mis en sommeil** : en v1 aucune facture ne sera disponible (syndic pro), ce qui bloquerait tout passage en « Travaux acceptés ».
- En v1, **aucune facture n'est exigée** pour accepter ou refuser les travaux. La règle reste documentée mais **non appliquée** tant que la fonctionnalité « factures » n'est pas active.
- L'archivage (manuel ou automatique) reste **sans aucune condition de facture** (point de la spec 24 inchangé).

## Boutons « Accepter » / « Refuser » dans la section « Bilans de l'intervention »

- La section « Bilans de l'intervention » (visible dès l'état « Travaux planifiés », spec 26) contient, pour **chaque personne concernée**, son **propre bloc** avec deux boutons :
  - **« Accepter » (bouton bleu)** ;
  - **« Refuser » (bouton rouge)**.
- Chaque clic ouvre une **modale de confirmation** avant l'action.
- Les boutons ne sont visibles **que** si les deux conditions sont réunies : le ticket est en « **Travaux planifiés** » **et** l'utilisateur courant est une **personne concernée** (occupant d'une unité du ticket — propriétaire ou locataire — ou membre du CS ; l'admin exclu). Chacun ne voit et n'utilise **que son propre bloc**.
- Dès que le ticket passe en « **Travaux acceptés** », toute la section bilan passe en **lecture seule** et les boutons disparaissent.

## Sémantique des actions

- **Acceptation** : le ticket passe en « **Travaux acceptés** » dès qu'**au moins un** occupant d'une unité concernée (locataire ou propriétaire) **ou un membre du CS** a cliqué sur « Accepter » — **un seul acceptant au total suffit**. Cela remplace le quorum « un représentant par unité + réception par un membre du CS » des specs 24/25. Le commentaire et les photos restent **facultatifs** sur l'acceptation.
- **Refus** : tout occupant d'une unité du ticket ou tout membre du CS peut refuser. Le ticket **repasse en « consultation »** avec **commentaire obligatoire et au moins une photo obligatoire** (mêmes obligations que la réouverture de la spec 20). Comme à la réouverture depuis « Travaux acceptés », les **consultations précédentes deviennent caduques** (conservées en lecture seule) et une **nouvelle instance** de consultations s'ouvre ; les éventuelles acceptations précédentes deviennent caduques.
- Le refus (planifiés → consultation) constitue un **quatrième moment cadré d'ajout de photos** (complète la spec 20) : au moins une photo obligatoire.

## Bilans de l'intervention

- La **zone d'édition est celle de l'utilisateur courant** sur la page ticket ; les photos jointes au bilan sont les siennes. Un bilan par personne concernée (clé `ticket_id + user_id`, spec 23), l'admin exclu. L'autosave de la spec 26 s'applique à cette zone.
- **Masquer la phrase** « Un bilan par personne concernée (résidents des unités, membres du CS — l'admin n'en a pas). » partout où elle apparaît.
- Pour les **autres** personnes concernées, on affiche leur **nom et prénom** ; leurs **commentaires et photos sont consultables en lecture seule** par les autres personnes concernées.
- **Visibilité de la section bilans** : elle n'est visible **qu'aux personnes concernées** — occupants des unités du ticket + membres du CS (admin exclu). Les autres utilisateurs connectés ne voient pas cette section.

## Bilans et repassage en consultation : figeage définitif

- Dès qu'un ticket **repasse en « consultation »** (réouverture depuis « Travaux acceptés » de la spec 20, **ou** refus depuis « Travaux planifiés »), **tous les bilans précédents sont enregistrés et figés en lecture seule de façon définitive** : jamais modifiables, jamais supprimables, toujours consultables par les personnes concernées.
- Lorsque les travaux correctifs sont effectués à nouveau, il s'agit d'un **tout nouveau bilan** (nouveau cycle) : les anciens bilans restent dans l'historique en lecture seule.
