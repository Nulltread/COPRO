# Lots (clé de répartition) et rachat

## Source et référentiel des lots

- La **clé de répartition CCG** est la seule source faisant foi : les fichiers BAT A, BAT B, GARAGE A, GARAGE B et HORS LOT 39 sont **ignorés**. La CCG décrit **123 lots** : n° de lot, désignation, type de lot, **valeur = tantièmes** du lot, et **copropriétaire** (un seul nom par lot — parfois un couple « X & Y », très souvent le bailleur social).
- Le **référentiel des lots est fixe** : les 123 lots de la CCG sont créés par le script de peuplement (ci-dessous) ; aucun lot ne peut être ajouté ou supprimé dans l'application.
- Le **mapping lot ↔ unités n'existe pas à date** : les lots sont créés **sans aucune unité**, le lien se construit au fil de l'eau (ci-dessous). La numérotation des lots de la CCG ne correspond **pas** à la numérotation des unités (ex. un lot contient un appartement ET un garage).

## Lot et unités

- Un **lot est composé de zéro, une ou plusieurs unités** (villa / garage). **Une unité appartient à au plus un lot.**
- Les **propriétaires sont toujours liés aux unités de leur lot** : ils ne se rattachent jamais directement à une unité. À l'inverse, les **locataires se rattachent directement aux unités**, par demande (voir `rattachements.md`).
- **Ajout d'une unité à un lot** : le propriétaire la propose depuis son profil (« Mes lots », voir `profil-compte-utilisateur.md`) en choisissant une unité **libre** (n'appartenant à aucun lot) ; la proposition est **acceptée ou refusée par un membre du CS ou l'admin** (mêmes règles de notification que les rattachements). Tant qu'elle n'est pas acceptée, l'unité n'est pas liée au lot.
- **Retrait d'une unité d'un lot** : réservé au **CS/admin** (le propriétaire ne peut que proposer un ajout) — protection de l'historique.
- **Un compte ne peut être rattaché qu'une seule fois à une unité** : soit propriétaire (via un lot contenant l'unité), soit locataire (via une demande acceptée) — jamais les deux sur la même unité.

## Propriétaire d'un lot

- **Un lot a exactement un compte propriétaire.** Un même compte peut être propriétaire de **plusieurs lots** (dédoublonné : un seul compte pour « ERILIA-LOGIREM » quel que soit son nombre de lots, et un seul compte par personne possédant plusieurs lots).
- Un propriétaire peut aussi être **locataire** d'une autre unité (voir `rattachements.md`).

## Onglet « Lots »

- Lien **« Lots »** dans la barre de navigation, à côté de « Comptes » ; visible au **gestionnaire (CS + admin)**.
- La page liste tous les lots avec : **n° de lot, désignation, type, tantièmes, compte propriétaire, unités liées** (et leur statut) et les **demandes d'ajout d'unités en attente**. **Champ de recherche plaintext à la volée** (n° de lot, désignation, type, nom du propriétaire, unités).
- **Modification des lots eux-mêmes** (tantièmes, désignation, ajout/retrait d'unité, changement de propriétaire hors rachat) : **admin seul**, avec **modale de confirmation** ; chaque modification est **loguée avec son auteur et horodatée** (fil de suivi de la page).
- **Rachat d'un lot** : **CS + admin**, depuis l'onglet Lots (voir ci-dessous).

## Rachat d'un lot

- Le **rachat se fait sur un lot**, jamais sur un compte entier : le CS/admin crée le **nouveau compte** de l'acheteur (mêmes règles que toute création de compte par le gestionnaire — voir `comptes-et-roles.md` et `36-comptes-sans-email.md`) et rattache le lot à ce nouveau compte.
- L'**ancien compte perd le lot** — uniquement ce lot : ses autres lots et ses rattachements locataires sont inchangés (un vendeur peut tout à fait rester locataire ailleurs).
- L'ancien compte est **désactivé définitivement** (statut `desactive`, voir `comptes-et-roles.md` et `36-comptes-sans-email.md`) **s'il n'a plus aucun rattachement** (ni lot, ni locataire) ; sinon il **reste actif**.
- Le rachat notifie **l'ancien et le nouveau propriétaire ainsi que le CS** (voir `notifications.md`).

## Tantièmes

- Les tantièmes sont un **attribut du lot** (valeur de la CCG), affichés dans l'onglet Lots. Ils n'ont **aucun autre impact** : aucun montant, aucun appel de fonds, aucune facture, aucun lien avec la facturation — voir `tantiemes.md`.
- Modification des valeurs : **admin seul** (modale de confirmation + log avec auteur, voir ci-dessus).

## Peuplement depuis la CCG

- **Script dédié** (ex. `src/db/peupler-cle-repartition.js`) avec les données de la CCG embarquées (JSON) : crée les **123 lots** (n°, désignation, type, tantièmes), les **comptes propriétaires** (un par nom de propriétaire distinct, dédupliqué, **sans email**, mot de passe aléatoire — voir `36-comptes-sans-email.md`) et le **lien lot → compte propriétaire**. **Aucun lien lot → unité** n'est créé (mapping inconnu à date).
- **Vieux comptes existants pris en compte** : avant de créer un compte, le script rapproche le propriétaire d'un **compte actif existant portant le même nom + prénom** (normalisé, accents/casse ignorés) — **hors compte admin et hors comptes inactifs** — et rattache le lot à ce compte plutôt que de créer un doublon. Un lot déjà présent mais sans propriétaire est lui aussi rattaché (ré-exécution). Les membres du CS pré-créés (vrai email, ex. `sebastien.paletti@gmail.com`) sont ainsi retrouvés et leurs lots leur sont rattachés.
- **Nettoyage pre-prod intégré** (désactivable avec `--sans-nettoyage`) : si des **comptes de test** existent (email en `@copro.local`, **hors compte admin**), ils sont supprimés, ainsi que **tous les tickets** (ce sont des tickets de test) **avec leurs fichiers joints** (lignes + disque), leurs rattachements/sessions/notifications, les documents qu'ils ont déposés, et leurs lots sont détachés. **Les unités, le compte admin et les comptes réels ne sont jamais touchés** par ce nettoyage.
- Le script est **idempotent** (ré-exécution = mise à jour sans doublon, sans nettoyage s'il ne reste plus de comptes de test) et produit un **rapport** (nettoyage, lots créés/existants/rattachés, comptes créés/réutilisés, erreurs).
- Nom / prénom : découpage au mieux de la chaîne du propriétaire (ex. « CLEMENT Francoise » → nom « CLEMENT », prénom « Françoise » ; un couple « CRABOL & GIULIANI Jonathan&Emilie » = **un seul compte** pour le lot). Nom et prénom restent obligatoires pour tous les comptes.
