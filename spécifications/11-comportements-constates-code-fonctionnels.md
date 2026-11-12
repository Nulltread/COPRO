# Inventaire — comportements fonctionnels constatés dans le code

Ce fichier décrit des comportements **présents dans le code** (`src/`) et **absents des spécifications 01–10**. C'est un constat, pas une prescription. Fait le même jour que la réorganisation des specs.

## Comptes et profil

- **Mot de passe : 8 caractères minimum**, imposé à l'inscription et au changement de mot de passe.
- **Email insensible à la casse**, normalisé en minuscules à l'inscription et à la connexion.
- Après connexion, redirection vers la page initialement demandée (paramètre `suite`, accepté uniquement s'il commence par `/`).
- Profil modifiable : nom, prénom, téléphone, mot de passe (laisser vide = inchangé).
- **Réclamation de rattachement depuis le profil** (en plus de l'inscription) : une seule demande par couple (unité, compte) — une nouvelle réclamation sur une unité déjà demandée est ignorée, même si la précédente a été refusée.
- **Auto-retrait d'une unité** : supprime l'unité validée et marque le rattachement correspondant « refusé » ; aucun impact sur les tickets ; aucune notification envoyée.
- **Suppression de compte** : anonymisation (email remplacé, nom affiché « Compte supprimé », mot de passe aléatoire), suppression des sessions, notifications et rattachements actifs ; les tickets restent attachés à l'unité et leur auteur apparaît comme « Compte supprimé ».
- **Export RGPD** : téléchargement d'un fichier JSON (`mes-donnees-copro.json`) contenant le compte, les unités, les tickets créés et les notifications.

## Rattachements

- Un résident voit les demandes en attente **de ses propres unités** ; le CS/admin voit **toutes** les demandes en attente.
- L'acceptation comme le refus notifient **le demandeur** et **le conseil syndical**.
- La qualité déclarée est limitée à **propriétaire** ou **locataire**.

## Gestion du statut CS (page comptes, réservée au gestionnaire)

- Un membre du CS peut **retirer le statut CS à un autre membre CS ou à lui-même**, mais **ne peut pas l'attribuer à un non-membre** ; l'admin peut tout faire (ajouter/retirer n'importe quel compte non-admin).

## Tickets

- **Catégories en dur** (liste fixe) : Plomberie, Électricité, Chauffage, Toiture, Menuiserie, Serrurerie, Extérieurs / Jardin, Humidité / Infiltration, Autre. Le titre est limité à 120 caractères (champ du formulaire).
- **Tri de la liste** : tickets urgents d'abord, puis par date de dernière modification décroissante.
- **Filtre « coût min »** calculé sur la somme des devis/avenants **retenus** du ticket.
- **Commentaires** : tout utilisateur connecté peut commenter tout ticket (pas de restriction aux seuls concernés) ; la notification reprend les 80 premiers caractères du commentaire.
- **Transition** : le gestionnaire peut viser n'importe quel état (hors état courant), avec un **motif facultatif** enregistré dans le fil ; l'entrée en « consultation » mémorise l'état précédent (`etape_avant_consultation`) utilisé pour la réouverture.
- **Réouverture par un résident** : réservée au créateur ou aux résidents concernés, et uniquement d'un ticket archivé vers l'état d'avant consultation.
- **Décision** : retenir un devis/avenant **démarque tous les autres de la même catégorie** comme non retenus (un seul retenu par catégorie) ; la justification est enregistrée avec la décision.
- **Résolution** : possible uniquement au stade « Travaux acceptés » ; chaque résident concerné actif doit avoir accepté pour l'archivage (un gestionnaire accepte seul) ; la liste des acceptations (accepté / en attente par résident) est visible sur le ticket.
- **Modification des unités d'un ticket** : possible après création par le créateur, les résidents concernés ou le gestionnaire, avec la même règle qu'à la création (au moins une unité personnelle, parties communes réservées au gestionnaire).
- **Suppression d'un ticket** : réservée au créateur si le ticket est encore à l'état « créé », ou au gestionnaire si l'auteur du ticket a un compte supprimé (et état « créé ») ; la suppression entraîne la disparition en cascade des unités, événements, fichiers, comptes-rendus, résolutions et notifications liés.
- **Suppression de photo** : seul l'auteur de la photo ou un gestionnaire peut supprimer une photo (les autres catégories de documents ne sont pas supprimables via l'interface) ; la suppression est loguée dans le fil.

## Documents uploadés

- **Limite de 10 fichiers par envoi**.
- Les résidents non-gestionnaires ne peuvent déposer que des **photos** ou des documents de catégorie **compte-rendu** ; les champs montant/entreprise/délai ne leur sont proposés que pour les catégories gérées par le CS.
- Les documents sont servis en ligne (`inline`) avec l'en-tête `nosniff`, après vérification que l'utilisateur peut voir le ticket.

## Notifications (constats complémentaires)

- L'auteur d'un événement n'est jamais notifié de son propre événement.
- Seuls les comptes **actifs** reçoivent des notifications.
- La page des notifications liste les **100 dernières** ; bouton « tout marquer comme lu » ; badge de non-lues dans la barre de navigation (interrogé aussi via une API JSON interne).

## Tableau de bord (constats complémentaires)

- Compteurs affichés : tickets ouverts (non archivés), en consultation, urgents (non archivés), coût retenu (somme des devis/avenants retenus de toute la copropriété), total facturé ; activité récente = 10 derniers tickets modifiés.
