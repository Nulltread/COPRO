# Notifications — transitions seules

En cas de contradiction, ce fichier (préfixe 18) prime sur `08-notifications.md` pour les points ci-dessous. Le canal email (option utilisateur, défaut désactivé, emails vérifiés uniquement, lien direct vers la page concernée) reste défini par `16-serveur-mail-et-domaine.md`.

## Événements notifiés

- **Seules les transitions (changements d'état) des tickets déclenchent des notifications.** Tous les autres événements du ticket (commentaires, ajouts de fichiers ou photos, éditions, décisions) ne notifient plus personne : le **fil de suivi** (log horodaté avec auteur) suffit à les tracer.
- Les événements de **rattachement** continuent de notifier : acceptation/refus au **demandeur** et au **conseil syndical** ; alertes de péremption à J-3 et J-1 aux **admin et membres du CS** (voir `19`) ; alertes d'archivage automatique à J-3 et J-1 (voir `20`).

## Destinataires d'une transition de ticket

- Les **résidents (propriétaires et locataires) des unités concernées** par le ticket, les **membres du conseil syndical** et l'**admin**.
- Le **créateur du ticket n'est pas notifié en tant que tel** : il ne reçoit la notification que s'il est résident d'une unité concernée. L'**auteur de la transition** n'est jamais notifié.
- Seuls les comptes **actifs** reçoivent des notifications.

## Canaux

- **In-app** (toujours) + **email** si l'utilisateur l'a activé dans son profil (voir `16`). Un ticket marqué **urgent** garde la mention « URGENT » dans la notification.

## Affichage (inchangé)

- Badge de non-lues dans la barre de navigation, page dédiée listant les notifications liées au ticket concerné, « tout marquer comme lu ».
