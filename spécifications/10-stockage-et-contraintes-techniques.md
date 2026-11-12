# Stockage des fichiers et contraintes techniques

## Stockage des fichiers (photos, devis, factures)

- **Volumes attendus** : ~122 unités, tickets réguliers sur plusieurs années ; chaque ticket peut cumuler photos, devis, factures et décisions. Quelques dizaines de Go à terme — la compression des images limite fortement la croissance.
- **Priorité au gratuit ou très bon marché**, par ordre de préférence :
  1. le **disque du serveur d'hébergement** lui-même (coût nul, répertoire hors racine web, avec sauvegarde) — c'est le choix retenu en v1 ;
  2. un stockage objet S3-compatible à tarif très bas, de préférence avec **egress gratuit** (ex. Cloudflare R2, Scaleway/OVH Object Storage) ;
  3. MinIO auto-hébergé sur le même serveur.
  Éviter les stockages à frais de sortie élevés (ex. AWS S3).
- Les **métadonnées** (nom, type, taille, ticket, catégorie, auteur, montant/entreprise/délai) sont en base de données ; les fichiers eux-mêmes sur le disque.
- **Accès sécurisé** : fichiers servis uniquement via l'application, après authentification et vérification des droits — **pas d'URL publiques directes**.
- **Sauvegarde** : les fichiers sont inclus dans la stratégie de sauvegarde (sauvegarde automatique du répertoire de stockage avec la base de données, rétention suffisante).
- **Limites** : taille max par fichier (10 Mo), types MIME autorisés : **JPEG, PNG, WebP, PDF**.

## Contraintes techniques

- **Coût d'hébergement minimal et simplicité** : stack légère, application web monolithique (Node.js + Express + SQLite), un seul conteneur déployable sur un petit VPS ou une PaaS bas coût. Pas de dépendance à des services payants.
- Responsive / mobile-first, utilisable sur téléphone.
- Interface en français, vocabulaire courant, aucune notion technique exposée.

## Sécurité de base

- Authentification par **sessions** (cookie HttpOnly), rôles, mots de passe **hachés**.
- Contrôle d'accès sur chaque route selon les règles de ce dossier.

## RGPD (simple)

- Données **exportables** (export de ses données par l'utilisateur) et **supprimables** (suppression de son compte).
