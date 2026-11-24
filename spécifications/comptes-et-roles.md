# Comptes et rôles

Trois niveaux de droits : **résident**, **membre du conseil syndical** (statut additionnel), **administrateur**.

Dans ce dossier, le terme **gestionnaire** désigne indifféremment un **membre du conseil syndical** ou l'**admin**.

## Résident (propriétaire ou locataire)

- Compte de base. **Auto-inscription** : identifiant = **adresse email** (insensible à la casse, normalisée en minuscules à l'inscription et à la connexion), **nom**, **prénom** et **numéro de téléphone** obligatoires. **Mot de passe : 8 caractères minimum** (à l'inscription et au changement).
- **L'auto-inscription ne crée que des comptes locataires** (voir `36-comptes-sans-email.md`) : un compte propriétaire ne peut être créé que par le CS/admin (voir ci-dessous) et se rattache aux unités via son lot (voir `35-lots.md`).
- **Vérification par email** : à l'inscription, un email contenant un **lien de validation unique et expirable** est envoyé (voir `mail-et-domaine.md`). Tant que l'email n'est pas vérifié, le compte **reste utilisable**, mais : il ne reçoit **pas** les notifications par email (option réservée aux emails vérifiés, voir `notifications.md`) et il ne figure **pas** dans la liste de diffusion du conseil syndical (voir `mail-et-domaine.md`). Un bouton **« renvoyer l'email de confirmation »** est disponible dans l'espace compte.
- **Compte requis pour déclarer un ticket**.
- Un résident crée des tickets, suit leur avancement, rédige son bilan et ajoute des photos selon les règles de `cycle-de-vie-des-tickets.md` et `bilans-de-intervention.md`.
- Chacun peut **changer son mot de passe** dans son espace compte (profil modifiable : nom, prénom, téléphone, mot de passe — laisser vide = inchangé), voir `profil-compte-utilisateur.md`.
- Après connexion, redirection vers la page initialement demandée (paramètre `suite`, accepté uniquement s'il commence par `/`).

## Création de comptes par le gestionnaire (CS ou admin)

- Depuis la page de gestion des comptes, le **CS et l'admin créent tout compte** (propriétaire ou locataire) : **nom et prénom obligatoires** (obligatoires pour tous les comptes, voir `36-comptes-sans-email.md`), téléphone facultatif, **email facultatif**.
- **Email facultatif** : l'unicité de l'email ne s'applique **qu'aux comptes actifs** (`statut = 'actif'`) ; un compte désactivé ou supprimé ne bloque pas la réutilisation de son adresse (voir `36-comptes-sans-email.md`).
- Le compte créé reçoit un **mot de passe aléatoire** ; **dès que son email est renseigné** (à la création ou lors d'une modification), un **mail de réinitialisation du mot de passe** est envoyé automatiquement à cette adresse (lien unique et expirable — voir `mail-et-domaine.md`). Un compte **sans email reste inaccessible** (connexion par email uniquement).
- Un compte créé par le gestionnaire peut être rattaché à un **lot** (qualité propriétaire — voir `35-lots.md`) et/ou à des unités en qualité locataire.

## Membre du conseil syndical (CS)

- Pas un compte à part : c'est un **statut supplémentaire** ajouté à un compte résident.
- Gestion **collégiale** : l'**administrateur ET tout membre du CS** peuvent **ajouter** le statut CS à tout compte non-admin (y compris eux-mêmes ou tout autre compte non-admin) et **retirer** le statut CS (d'un autre membre ou d'eux-mêmes). Chaque ajout/retrait passe par une **modale de confirmation** explicite (« Confirmer l'ajout de « Prénom Nom » au conseil syndical ? » / « Confirmer le retrait du conseil syndical de « Prénom Nom » ? », boutons **Confirmer** / **Annuler**) : aucun changement sans confirmation.
- Le CS (avec l'admin) gère le cycle de vie des tickets, les consultations, les devis, les factures et valide les rattachements (voir `cycle-de-vie-des-tickets.md`, `consultations-entreprises-factures.md`, `rattachements.md`).
- Il n'existe **plus de rôle « syndic professionnel »**.

## Administrateur

- **Un et un seul compte admin**, à part, qui peut tout faire dans l'application.
- Règle particulière : l'admin **n'est jamais inclus dans un quorum** d'action sur un ticket (validation, bilan, réouverture) — son rôle se limite à administrer le site (voir `bilans-de-intervention.md`). Il voit tous les tickets sans condition d'unité (voir `rattachements.md`).

## Page de gestion des comptes

- Page **réservée au gestionnaire** (CS ou admin), présentant la liste des comptes.
- **Création de compte** par le gestionnaire (voir ci-dessus), avec modale de confirmation.
- Pour chaque compte : affichage du **statut** (actif / désactivé / supprimé), de ses **lots** (propriétaire) et de ses **unités** (via un lot ou en locataire) ; si le compte a un email, bouton **« renvoyer le mail de réinitialisation du mot de passe »**.
- **Champ de recherche plaintext** filtrant **à la volée** (côté client, sans rechargement) sur : **nom**, **prénom**, **numéro de l'unité rattachée** (ex. « 12 » trouve les comptes rattachés à la villa 12 ou au garage 12), **type de l'unité rattachée** (villa / garage / parties communes), **n° de lot** et **statut**.

## Suppression de compte

- Un résident peut **supprimer son compte** : **anonymisation** (email remplacé, nom affiché « Compte supprimé », mot de passe aléatoire), suppression des sessions, notifications et rattachements actifs. **Aucun impact sur les tickets**, qui restent attachés à l'unité et dont l'auteur apparaît comme « Compte supprimé ».
- Un compte supprimé ne peut plus se connecter (accès refusé, 403).

## Désactivation de compte (rachat)

- Statut **`desactive`**, définitif et distinct de `supprime` : déclenché par un **rachat de lot** (voir `35-lots.md`) lorsque l'ancien compte n'a plus aucun rattachement (ni lot, ni locataire) — voir `36-comptes-sans-email.md`.
- Un compte désactivé ne peut plus se connecter (403, message distinct de « supprimé »), ne reçoit plus de notifications, est exclu de la liste de diffusion du CS et de l'unicité d'email, mais **conserve son identité, ses tickets (auteur visible) et tout son historique d'activité**. **Aucune réactivation possible.**
