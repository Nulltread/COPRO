# Notifications

## Canaux

- **In-app (toujours)** + **email** si l'utilisateur a activé l'option « recevoir aussi les notifications par email » dans son profil (voir `profil-compte-utilisateur.md`) — **désactivée par défaut**, et réservée aux **emails vérifiés** (voir `comptes-et-roles.md` et `mail-et-domaine.md`).
- L'email contient un **lien direct** vers la page concernée (`/tickets/:id` si la notification porte sur un ticket, sinon `/notifications`) ; les envois sont faits **en arrière-plan** (un échec ne bloque pas l'action et est journalisé). Mention **« URGENT »** conservée dans l'objet pour les tickets urgents.
- **Aucun web push** (le push natif iOS/Android reste hors périmètre).

## Événements notifiés

- **Seules les transitions (changements d'état) des tickets déclenchent des notifications** aux destinataires du ticket (ci-dessous). Tous les autres événements du ticket (ajouts de fichiers ou photos, éditions, décisions, bilans) ne notifient plus personne : le **fil de suivi** (log horodaté avec auteur) suffit à les tracer.
- **Exception — les échanges avec les prestataires** (voir `sollicitations-relances.md`) notifient les **membres du CS** (in-app + email selon préférences, auteur exclu) et les **prestataires par email** (adresse de la fiche entreprise, sans compte) : sollicitation/relance envoyée, devis déposé par le prestataire (**avec un lien direct vers le fichier** dans la notification in-app et dans l'email), dates proposées, date validée, sélection avec envoi des mails de planification.
- Les événements de **rattachement** continuent de notifier : acceptation/refus au **demandeur** et au **conseil syndical** ; alertes de **péremption à J-3 et J-1** aux **admin et membres du CS** (voir `rattachements.md`) ; alertes d'**archivage automatique à J-3 et J-1** aux **membres du CS et aux occupants concernés** (voir `cycle-de-vie-des-tickets.md`). Chaque alerte est envoyée **une seule fois**.
- Les événements de **lots** notifient (voir `35-lots.md`) : **rachat d'un lot** → ancien et nouveau propriétaires + CS ; **demande d'ajout d'une unité à un lot** → CS/admin ; **acceptation/refus** de cette demande → propriétaire demandeur + CS.

## Destinataires d'une transition de ticket

- Les **résidents (propriétaires et locataires) des unités concernées** par le ticket, les **membres du conseil syndical** et l'**admin**.
- L'**auteur de la transition n'est jamais notifié**. Le **créateur du ticket** n'est notifié que s'il est résident d'une unité concernée.
- Seuls les **comptes actifs** reçoivent des notifications.
- Un ticket marqué **urgent** est signalé comme prioritaire dans la notification (mention « URGENT »), sans canal séparé.

## Affichage

- **Badge de notifications non lues** dans la barre de navigation (interrogé aussi via une API JSON interne).
- Page dédiée listant les **100 dernières notifications**, liées au ticket concerné, avec bouton **« tout marquer comme lu »**.
