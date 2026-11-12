# Inventaire — comportements techniques et sécurité constatés dans le code

Ce fichier décrit des comportements **techniques** présents dans le code (`src/`, `Dockerfile`, `docker-compose*.yml`) et **absents des spécifications 01–10**. C'est un constat, pas une prescription.

## Stack et persistance

- Node.js + Express, vues EJS rendues côté serveur, base **SQLite** (better-sqlite3) en mode WAL avec clés étrangères activées ; le schéma est appliqué automatiquement au démarrage, suivi d'une **migration** depuis l'ancien schéma (avant les décisions SPEC) si besoin.
- Base dans `data/copro.db`, uploads dans `uploads/` (chemins surchargeables par variables d'environnement `DB_PATH` / `UPLOAD_DIR`) ; stockage des fichiers **sur le disque local du serveur, hors racine web**.
- Corps de requête limité à **2 Mo** (formulaires et JSON).
- Nom affiché de l'application : « Copro La Pinède de Notre Dame ».

## Authentification et sessions

- Mots de passe hachés avec **scrypt** + sel aléatoire (64 octets), comparaison en temps constant.
- Sessions en base, identifiant aléatoire de 32 octets, cookie `sid` **HttpOnly, SameSite=Lax**, validité **30 jours**.
- Un compte supprimé ne peut plus se connecter : sa session est détruite et l'accès est refusé (403).
- Les requêtes non authentifiées en GET HTML sont redirigées vers la page de connexion (avec retour après connexion) ; les autres reçoivent un 401 JSON. Page 404 dédiée (« Page introuvable »).

## Upload de fichiers

- Multer en stockage disque, nom de fichier de stockage **aléatoire** (16 octets hexadécimaux + extension d'origine en minuscules).
- **Taille max 10 Mo par fichier, 10 fichiers max par envoi** ; types MIME autorisés vérifiés : JPEG, PNG, WebP, PDF (refus explicite sinon).
- En cas d'erreur (upload refusé, catégorie invalide, droits insuffisants), les fichiers déjà déposés sont supprimés du disque.

## Compression d'images côté client

- À la sélection de fichiers image : redimensionnement à **1600 px max** et recompression à **qualité 0,8** ; conversion en JPEG (sauf PNG de moins de 500 Ko conservé tel quel) ; aperçu des photos avant envoi.

## Déploiement

- Un seul conteneur Docker ; déploiement local (`docker-compose.yml`) et production (`docker-compose.prod.yml` avec Caddy pour le HTTPS automatique) ; déploiement automatique par GitHub Actions sur push de la branche de l'application ; script de sauvegarde quotidien (base SQLite à chaud + archive des uploads, rétention 14 jours).
- Jeu de données de démo (`npm run seed`) : 61 villas, 61 garages, parties communes, 1 admin, 2 membres CS rattachés aux parties communes, 61 propriétaires + 10 locataires, 1 rattachement en attente, 7 tickets à différents stades (mot de passe commun `demo1234`).
