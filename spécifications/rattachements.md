# Rattachement d'un résident à une unité

## Réclamation et validation

- **Locataire** : à la création du compte (auto-inscription = locataires uniquement, voir `36-comptes-sans-email.md`) et depuis son profil, le résident **réclame** son rattachement à une villa ou un garage, **toujours en qualité locataire**.
- **Propriétaire** : le rattachement aux unités se fait **exclusivement via son lot** (voir `35-lots.md`) ; il n'existe pas de rattachement direct unité → propriétaire.
- **Un compte ne peut être rattaché qu'une seule fois à une unité** : propriétaire (via un lot contenant l'unité) **ou** locataire (via une demande acceptée) — jamais les deux sur la même unité. Un propriétaire peut en revanche être locataire d'une **autre** unité.
- **Une seule demande par couple (unité, compte)** tant que la demande existe ; une nouvelle réclamation sur une unité déjà demandée est ignorée, même si la précédente a été refusée. Après péremption (ci-dessous), le résident peut à nouveau réclamer la même unité.
- L'attribution est **acceptée (ou refusée) uniquement par un autre résident de cette même unité ou par un membre du conseil syndical** ; l'acceptation comme le refus notifient **le demandeur et le conseil syndical** (voir `notifications.md`).

## Page des rattachements (gestion des demandes en attente)

- Un résident voit les demandes en attente **de ses propres unités** ; le gestionnaire (CS/admin) voit **toutes** les demandes en attente.
- La page **n'apparaît plus dans la barre de navigation** et il n'y a **plus de bouton** dans le profil : elle reste accessible via **les liens des notifications** qui y mènent et par son **URL directe**.

## Section « Mes rattachements » dans Mon profil

- Contrôle custom listant chaque unité demandée ou validée avec, juxtaposés : le **type** (villa / garage / parties communes), le **numéro**, et le **statut** — **sablier** pour « en attente », **check verte** pour « validé » (et l'indication « refusé » le cas échéant).
- Depuis la page de compte, avec une **modale de confirmation** : **annuler une demande en attente** et **annuler un rattachement accepté** (auto-retrait d'une unité).

## Péremption des demandes en attente

- Une demande de rattachement **en attente périt au bout de N jours** (défaut **14**, réglable dans le panneau d'administration, voir `administration.md`) : à l'expiration, la demande est **supprimée**.
- **Notifications à J-3 et à J-1** avant la péremption aux **admin et membres du CS** (in-app + email si activé), chacune envoyée une seule fois.

## Cas du compte sans unité validée

- Pour un **propriétaire**, ses unités validées sont les unités de ses lots dont le lien lot → unité est accepté (voir `35-lots.md`).
- Tant qu'un résident n'est rattaché à **aucune unité validée**, il **ne voit aucun ticket** : ni dans la liste (même avec le filtre « toutes les unités »), ni en détail, ni dans les fichiers joints. Il ne peut pas non plus en créer. Le message affiché sur la liste des tickets invite à suivre l'état de ses rattachements depuis l'écran de compte.
- Dès qu'un rattachement est accepté, la **lecture ouverte** s'applique (voir `visibilite.md`).
- **Exception** : le compte **admin** (compte à part, non résident) voit tous les tickets sans condition d'unité.

## Retrait et suppression de compte

- Un résident peut **se retirer lui-même** d'une unité (voir ci-dessus).
- La **suppression de compte** n'a **aucun impact sur les tickets**, qui restent attachés à l'unité (voir `comptes-et-roles.md`).
