# Copro La Pinède de Notre Dame — suivi de travaux et sinistres

Application web mobile-first pour suivre les travaux et sinistres d'une copropriété de pavillons (61 villas, 61 garages). Interface en français, pensée pour des utilisateurs non techniques.

## Fonctionnalités

- **Comptes** : résident (propriétaire/locataire), syndic, conseil syndical, administrateur. Inscription réservée aux résidents référencés sur une unité, **validée par le syndic, le conseil syndical ou l'admin**.
- **Tickets** : déclaration (titre, description, catégorie, une ou plusieurs unités, photos, indicateur « urgent »), puis cycle de vie en 6 étapes validées par le syndic/conseil : Déclaration → Consultation → Attribution → Planification → Réception → Clôture (retour possible de Réception vers Planification avec motif). Fil de suivi horodaté, archivage illimité des tickets clôturés.
- **Visibilité** : chaque résident ne voit que les tickets de ses propres unités ; syndic/conseil/admin voient tout.
- **Documents** : photos à chaque étape (compression automatique côté navigateur : max 1600 px, ~80 %), devis, avenants, factures, décisions, comptes-rendus, avec montant/entreprise/délai. Mise en concurrence des devis et décision enregistrée. Coût du ticket : total retenu, total facturé, écart. Fichiers servis uniquement après authentification et vérification des droits.
- **Notifications** : in-app + **web push (PWA)** pour chaque événement du ticket (création, étape, devis, décision, commentaire, retour en planification). Tickets urgents notifiés en priorité. **Pas d'envoi d'emails** (choix retenu : notifications par l'application).
- **Multi-occupants** : propriétaire + locataire d'une même unité sont tous deux notifiés et peuvent agir.
- **Recherche/filtres** : par état, catégorie, urgence. **Tableau de bord** syndic/conseil : tickets ouverts, en attente de décision, urgents, coûts cumulés.

## Stack

Node.js 22 + Express + SQLite (better-sqlite3), vues EJS rendues côté serveur, PWA (manifest + service worker + web push). Un seul conteneur Docker. Stockage des fichiers sur le disque local du serveur (hors racine web), base SQLite dans `data/`, uploads dans `uploads/`.

## Voir l'interface sans rien installer (mock-up)

Le dossier [`mockups/`](mockups/) contient des pages statiques rendées avec le jeu de données de démo (connexion, inscription, liste des tickets vue syndic et vue résident, détail d'un ticket, formulaire, tableau de bord, notifications). Ouvrez les fichiers `01-…` à `08-…` directement sur GitHub. Régénérer avec `node scripts/render-mockups.js`.

## Lancer en local

```bash
npm install
npm run seed     # jeu de données de démo (61 villas, 61 garages, comptes, tickets)
npm start        # http://localhost:3000
npm test         # tests API (13 tests)
node scripts/smoke.js   # vérifications de bout en bout (15 contrôles)
```

Comptes de démo (mot de passe `demo1234`) : `syndic@copro.local`, `conseil@copro.local`, `admin@copro.local`, `resident1@copro.local` … `resident61@copro.local`, `locataire1@copro.local` …

## Déploiement avec Docker (VPS ou PaaS conteneurisé)

```bash
docker compose up -d --build
# l'application écoute sur http://localhost:3000
```

Les données persistent dans `./data` et `./uploads` (à sauvegarder régulièrement, ex. cron + `sqlite3 .backup` ou copie du dossier).

Pour activer les notifications push, générer des clés VAPID puis les renseigner :

```bash
npx web-push generate-vapid-keys
# renseigner VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY dans .env ou docker-compose.yml
```

## Déploiement en production (Scaleway Instance)

L'application tient dans un seul conteneur : un petit VPS suffit (ex. Scaleway Instance DEV1-S, ~4 €/mois, datacenter Paris).

1. **Créer l'Instance** (Ubuntu 24.04 LTS) dans la console Scaleway et noter son IP publique.
2. **Nom de domaine** : faire pointer un enregistrement A (ex. `copro.mondomaine.fr`) vers cette IP.
3. **Installer Docker** sur l'instance :
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # puis se reconnecter
   ```
4. **Cloner le projet** :
   ```bash
   git clone https://github.com/Nulltread/COPRO.git /srv/copro
   cd /srv/copro && git checkout vibe/copro-app-010909
   ```
5. **Configurer** : copier `.env.example` en `.env`, renseigner `PORT=3000`, les chemins par défaut, et générer les clés VAPID (`npx web-push generate-vapid-keys`). Remplacer le domaine dans `Caddyfile`.
6. **Lancer** (HTTPS automatique via Caddy / Let's Encrypt) :
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
7. **Mettre à jour** : `./scripts/deploy.sh` (git pull + rebuild).
8. **Sauvegarder** : cron quotidien, ex. `0 3 * * * APP_DIR=/srv/copro BACKUP_DIR=/srv/backups /srv/copro/scripts/backup.sh` — sauvegarde la base SQLite (via l'API `backup` de better-sqlite3, sûre à chaud) et archive `uploads/`, rétention 14 jours. Compléter par les snapshots hebdomadaires de l'Instance Scaleway.

Les données persistent dans `./data` et `./uploads` sur le disque de l'instance.

### Déploiement automatique (GitHub Actions)

Après le **premier déploiement manuel** (étapes ci-dessus, dont `setup-server.sh` une seule fois), chaque `push` sur la branche `vibe/copro-app-010909` déploie automatiquement via `.github/workflows/deploy.yml`.

Configuration :
1. Générer une paire de clés dédiée au déploiement : `ssh-keygen -t ed25519 -f ~/.ssh/copro_deploy`
2. Sur le serveur, autoriser la clé publique : `cat ~/.ssh/copro_deploy.pub >> /root/.ssh/authorized_keys`
3. Dans GitHub (repo → Settings → Secrets and variables → Actions), créer 3 secrets :
   - `DEPLOY_HOST` = IP du serveur (ex. `51.159.64.71`)
   - `DEPLOY_USER` = `root`
   - `DEPLOY_SSH_KEY` = contenu de la clé **privée** `~/.ssh/copro_deploy`

Le workflow exécute `scripts/deploy.sh` sur le serveur (git pull + `docker compose -f docker-compose.prod.yml up -d --build`).

## Schéma de données

Tables : `units` (villas/garages 1–61), `users` (rôles + statut de validation), `unit_residents` (rattachements multi-occupants), `tickets`, `ticket_units`, `ticket_events` (fil de suivi + décisions), `fichiers` (métadonnées des documents), `notifications`, `push_subscriptions`, `sessions`. Voir `src/db/schema.sql`.

## Limites de sécurité

- Mots de passe hachés (scrypt), sessions en cookie HttpOnly, contrôle d'accès par rôle et par unité sur chaque route de ticket/fichier, types MIME et taille max (10 Mo) vérifiés à l'upload, en-têtes `nosniff` sur les fichiers servis.
