# Sollicitations, relances et échanges avec les prestataires

Gestion des **relances et sollicitations** autour des consultations (état « consultation »). Les prestataires (entreprises) n'ont **pas de compte** : ils passent par un **lien personnel à durée de vie limitée** envoyé par email. Par abus de langage, le « syndic » désigne ici le conseil syndical (CS) + admin — aucune distinction de rôle n'est faite dans l'application (voir `comptes-et-roles.md`).

## Sollicitation par email (un clic)

- À l'étape « consultation », seuls les **membres du CS et l'admin** peuvent solliciter par email les **prestataires qui n'ont pas encore de devis** dans la consultation :
  - **globalement** (par défaut) : un seul clic envoie un mail à **toutes** les consultations actives sans devis dont la fiche entreprise comporte un email (bouton « ✉️ Solliciter par email » dans la section Consultations) ;
  - **individuellement** : un bouton ✉️ sur chaque consultation concernée.
- Le mail **condensé et rédigé proprement** reprend : le **titre** du ticket, les **unités concernées**, la **description**, et **inclut les photos de la description en pièces jointes** (plafonné : 10 photos et 20 Mo au total ; au-delà, les photos restent visibles via le lien du mail).
- Le mail contient un **lien personnel vers la version réduite du ticket**, valable **7 jours maximum**.
- Le système **se souvient des sollicitations** (une ligne par envoi, par consultation) : si le prestataire a **déjà été sollicité**, le mail suivant est une **relance** (mention de la date de la première sollicitation, ton adapté). L'historique (sollicitation/relance + dates) est affiché sur la consultation et journalisé dans le **fil de suivi**.
- Une entreprise **sans email** sur sa fiche ne peut pas être sollicitée (le bouton est absent ; message d'erreur explicite sinon).

## Espace prestataire (lien à 7 jours)

- Le prestataire ouvre le lien **sans compte** et voit une **version réduite du ticket** : **titre, description, photos** uniquement — ni fil de suivi, ni bilans, ni factures, ni autres fichiers du ticket (le jeton ne donne accès qu'aux photos de la description et au devis de cette consultation).
- Le lien (**jeton**, 32 octets aléatoires) est **scoping à la consultation** et **expire après 7 jours** ; un lien expiré ou inconnu renvoie une page d'erreur 404.
- Depuis cette page, le prestataire peut :
  - **déposer son devis** : pièce jointe (PDF ou image) + **montant (€)** + possibilité de **modifier son entreprise** (raison sociale, **facultatif**) — le dépôt **remplace** un éventuel devis existant (1 seul devis par consultation) ;
  - une fois la consultation **sélectionnée** : **proposer ses dates d'intervention** (plusieurs dates, **heure facultative** par date).

## Notifications des échanges

- **Devis déposé par le prestataire** : les **membres du CS sont notifiés** (in-app toujours ; + email selon leurs préférences) **avec un lien direct vers le fichier** du devis (dans la notification in-app et dans l'email). Le prestataire reçoit un **accusé de réception par email**.
- **Sélection d'une consultation** : un **mail est envoyé à l'entreprise sélectionnée** pour qu'elle vienne compléter les dates (lien à 7 jours) ; les membres du CS sont notifiés (auteur exclu).
- **Dates proposées par le prestataire** : notification aux membres du CS + accusé email au prestataire.
- **Date validée** : notification aux membres du CS (auteur exclu) + email au prestataire (date retenue).
- **Sollicitation/relance envoyée** : notification aux membres du CS (auteur exclu).
- Tous ces échanges sont **journalisés dans le fil de suivi** du ticket (auteur « prestataire » quand il s'agit d'un dépôt externe).

## Dates d'intervention et passage en « Travaux planifiés »

- La **date n'est plus obligatoire à la sélection** d'une consultation : la sélection marque les consultations « VALIDÉE » et envoie les mails de planification ; le ticket **reste en « consultation »**.
- Le passage en **« Travaux planifiés »** est une **action dédiée** du CS/admin (bouton « Passer en « Travaux planifiés » ») ; il est **impossible tant que les consultations sélectionnées n'ont pas de date acceptée** (400 avec le nom des entreprises concernées sinon).
- **Deux façons de compléter la date** :
  1. un **membre du CS renseigne la date d'intervention à la main** sur la consultation sélectionnée (l'échange a eu lieu hors outil) — cette date est considérée comme **acceptée** ;
  2. le **prestataire propose ses dates** (heures facultatives) via son lien, et un **membre du CS ou un occupant** des unités concernées **valide une des dates** → elle devient la date d'intervention de la consultation (badge « DATE ACCEPTÉE »).
- Une fois toutes les consultations sélectionnées **complètes** (fiche entreprise strictement complète, exactement 1 devis pièce jointe + montant > 0, **date acceptée**), le CS valide le passage en « Travaux planifiés » (voir `cycle-de-vie-des-tickets.md`).
