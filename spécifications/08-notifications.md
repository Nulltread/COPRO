# Notifications

**Canaux : notification in-app (toujours) + email (option utilisateur).** Le canal email, retiré en v1, est réintroduit en complément de l'in-app (voir `16-serveur-mail-et-domaine.md`) : chaque utilisateur peut activer « notifications par email » dans son profil (désactivé par défaut, réservé aux emails vérifiés) ; le mail contient un lien direct vers la page concernée. Aucun web push (le push natif iOS/Android reste hors périmètre).

## Événements notifiés

À chaque événement du ticket : **création, changement d'état, nouveau document (devis, etc.), décision, commentaire, acceptation de la résolution**, ainsi que les **réclamations et validations de rattachement**.

## Destinataires

- Pour un événement sur un ticket : le **conseil syndical** et les **résidents concernés** (rattachés aux unités du ticket) ayant un compte actif. L'auteur de l'événement n'est pas notifié.
- Pour un rattachement : le demandeur (acceptation/refus) et le conseil syndical.
- Un ticket marqué **urgent** est signalé comme prioritaire dans la notification (mention « URGENT »), sans canal séparé.

## Affichage

- Badge de notifications non lues dans la barre de navigation, page dédiée listant les notifications (liées au ticket concerné), possibilité de tout marquer comme lu.
