# Stockage des fichiers, sécurité, RGPD et déploiement

## Stockage des fichiers (photos, devis, factures)

- **Volumes attendus** : ~122 unités, tickets réguliers sur plusieurs années ; chaque ticket peut cumuler photos, devis, factures. Quelques dizaines de Go à terme — la compression des images (voir `fiche-ticket-et-ergonomie.md`) limite fortement la croissance.
- **Choix retenu en v1** : le **disque du serveur d'hébergement lui-même** (coût nul, répertoire hors racine web, avec sauvegarde). Ordre de préférence général : 1) disque local du serveur (retenu) ; 2) stockage objet S3-compatible à tarif très bas, de préférence avec **egress gratuit** (ex. Cloudflare R2, Scaleway/OVH Object Storage) ; 3) MinIO auto-hébergé sur le même serveur. Éviter les stockages à frais de sortie élevés (ex. AWS S3).
- Les **métadonnées** (nom, type, taille, ticket, catégorie, auteur, montant/entreprise/date) sont en base de données ; les fichiers eux-mêmes sur le disque, sous un **nom de stockage aléatoire** (16 octets hexadécimaux + extension d'origine en minuscules).
- **Accès sécurisé** : fichiers servis uniquement via l'application, après authentification et vérification des droits, en ligne (`inline`) avec l'en-tête `nosniff` — **pas d'URL publiques directes**.
- **Limites** : taille max **10 Mo par fichier**, **10 fichiers max par envoi** ; types MIME autorisés vérifiés : **JPEG, PNG, WebP, PDF** (refus explicite sinon). En cas d'erreur (upload refusé, catégorie invalide, droits insuffisants), les fichiers déjà déposés sont supprimés du disque.
- **Sauvegarde** : les fichiers sont inclus dans la stratégie de sauvegarde (sauvegarde automatique du répertoire de stockage avec la base de données). Script de sauvegarde quotidien : base SQLite à chaud (API `backup` de better-sqlite3) + archive des uploads, **rétention 14 jours**, complété par les snapshots hebdomadaires du serveur.

## Stack et persistance

- **Node.js + Express**, vues **EJS** rendues côté serveur ; base **SQLite** (better-sqlite3) en mode WAL avec clés étrangères activées ; schéma appliqué automatiquement au démarrage (avec migration depuis les anciens schémas si besoin).
- Application web **monolithique**, un seul conteneur Docker déployable sur un petit VPS ou une PaaS bas coût. Pas de dépendance à des services payants.
- Base dans `data/copro.db`, uploads dans `uploads/` (chemins surchargeables par variables d'environnement `DB_PATH` / `UPLOAD_DIR`). Corps de requête limité à **2 Mo** (formulaires et JSON).
- Nom affiché de l'application : **« Copro La Pinède de Notre Dame »**.

## Authentification et sessions

- Mots de passe **hachés** (scrypt + sel aléatoire 64 octets), comparaison en temps constant. **8 caractères minimum** (voir `comptes-et-roles.md`).
- **Sessions** en base, identifiant aléatoire de 32 octets, cookie `sid` **HttpOnly, SameSite=Lax**, validité **30 jours**.
- Un compte supprimé ou **désactivé** ne peut plus se connecter (403). Les requêtes non authentifiées en GET HTML sont redirigées vers la page de connexion (avec retour après connexion, paramètre `suite`) ; les autres reçoivent un 401 JSON. Page 404 dédiée (« Page introuvable »).
- **Contrôle d'accès sur chaque route** selon les règles de droits de ce dossier (rôles/statuts).

## RGPD (simple)

- Données **exportables** (export JSON de ses données par l'utilisateur — voir `profil-compte-utilisateur.md`) et **supprimables** (suppression de son compte — voir `comptes-et-roles.md`).

## Déploiement

- Un seul conteneur Docker ; déploiement local (`docker-compose.yml`) et production (`docker-compose.prod.yml` avec Caddy pour le **HTTPS automatique** Let's Encrypt) ; déploiement **automatique par GitHub Actions** sur chaque push de la branche `main` (secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`) via `scripts/deploy.sh` (git pull + rebuild) ; sauvegarde via `scripts/backup.sh`.
- **Jeu de données de démonstration** (`npm run seed`) : 61 villas, 61 garages, parties communes, 1 admin, 2 membres du CS rattachés aux parties communes, 61 propriétaires + 10 locataires, 1 rattachement en attente, 7 tickets à différents stades (mot de passe commun `demo1234`).
