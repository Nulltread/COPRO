# Copro La Pinède de Notre Dame — suivi de travaux et sinistres

Application web mobile-first pour suivre les travaux et sinistres d'une copropriété de pavillons (61 villas, 61 garages). Interface en français, pensée pour des utilisateurs non techniques.

## Fonctionnalités

- **Comptes** : auto-inscription (email + nom + prénom + téléphone, sans vérification d'email), **un seul compte administrateur**. Le **conseil syndical (CS)** est un statut additionnel géré collégialement par ses membres. Un résident **réclame son rattachement** à une villa/garage, accepté par un résident de la même unité ou le CS ; sans unité validée, pas de création de ticket.
- **Unités** : 61 villas, 61 garages (numérotés de 1 à 61) + **parties communes** (réservées au CS). Référentiel en dur en v1. Un ticket est rattaché à une ou plusieurs unités ; un résident peut être rattaché à plusieurs unités.
- **Tickets** : déclaration (titre, description, catégorie, unités choisies librement dont au moins une des siennes, photos, indicateur « urgent »), puis cycle de vie : **Créé → Validé par le CS → En consultation → Intervention planifiée → Travaux acceptés → Archivé**. En v1 le CS passe librement à n'importe quel état. Résolution acceptée par tous les résidents concernés (un membre CS peut accepter seul) → archivé ; réouverture possible vers l'état d'avant consultation. Description/photos modifiables à tout moment (même archivé), chaque modification loguée avec son auteur. Suppression par le créateur uniquement si le ticket n'a jamais évolué. Fil de suivi horodaté, archivage illimité.
- **Visibilité** : **lecture ouverte à tous** (filtres d'affichage par défaut sur ses unités, sans restriction).
- **Documents** : photos à chaque étape (compression automatique côté navigateur : max 1600 px, ~80 %). **Devis, avenants, factures gérés uniquement par le CS**, lisibles par tous, avec montant/entreprise/délai et décision enregistrée. **Compte-rendu d'intervention = champ du ticket dans l'app** (une instance par unité + une pour le CS), plus document uploadé possible. Coût du ticket : total retenu, total facturé, écart. Fichiers servis uniquement après authentification.
- **Notifications** : **in-app uniquement** (pas d'email, pas de web push) pour chaque événement (création, changement d'état, nouveau devis, décision, acceptation de la résolution, réclamation de rattachement) : notifie le CS et les résidents concernés.
- **Multi-occupants** : propriétaire + locataire d'une même unité sont tous deux notifiés et peuvent agir.
- **Recherche/filtres** : par état, catégorie, unité (défaut : ses unités), coût min, urgence. **Tableau de bord** CS/admin : tickets ouverts, en consultation, urgents, coûts cumulés.

## Stack

Node.js 22 + Express + SQLite (better-sqlite3), vues EJS rendues côté serveur. Un seul conteneur Docker. Stockage des fichiers sur le disque local du serveur (hors racine web), base SQLite dans `data/`, uploads dans `uploads/`.

## Voir l'interface sans rien installer (mock-up)

Le dossier [`mockups/`](mockups/) contient des pages statiques rendées avec le jeu de données de démo (connexion, inscription, liste des tickets vue syndic et vue résident, détail d'un ticket, formulaire, tableau de bord, notifications). Ouvrez les fichiers `01-…` à `08-…` directement sur GitHub. Régénérer avec `node scripts/render-mockups.js`.

## Lancer en local

```bash
npm install
npm run seed     # jeu de données de démo (61 villas, 61 garages, comptes, tickets)
npm start        # http://localhost:3000
npm test         # tests API (18 tests)
node scripts/smoke.js   # vérifications de bout en bout (23 contrôles)
```

Comptes de démo (mot de passe `demo1234`) : `admin@copro.local` (unique admin), `conseil1@copro.local` et `conseil2@copro.local` (membres du conseil syndical), `resident1@copro.local` … `resident61@copro.local`, `locataire1@copro.local` … `locataire10@copro.local`, `attente@copro.local` (rattachement en attente).

Comptes de test (création/suppression à la demande, mot de passe `demo1234`) :

```bash
npm run comptes-test            # crée test-cs@copro.local (conseil syndical) et test-resident@copro.local (villa 1)
npm run comptes-test:supprimer # supprime ces comptes et leurs tickets de test
```

## Déploiement avec Docker (VPS ou PaaS conteneurisé)

```bash
docker compose up -d --build
# l'application écoute sur http://localhost:3000
```

Les données persistent dans `./data` et `./uploads` (à sauvegarder régulièrement, ex. cron + `sqlite3 .backup` ou copie du dossier).

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
   cd /srv/copro && git checkout main
   ```
5. **Configurer** : copier `.env.example` en `.env`, renseigner `PORT=3000` et les chemins par défaut. Remplacer le domaine dans `Caddyfile`.
6. **Lancer** (HTTPS automatique via Caddy / Let's Encrypt) :
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
7. **Mettre à jour** : `./scripts/deploy.sh` (git pull + rebuild).
8. **Sauvegarder** : cron quotidien, ex. `0 3 * * * APP_DIR=/srv/copro BACKUP_DIR=/srv/backups /srv/copro/scripts/backup.sh` — sauvegarde la base SQLite (via l'API `backup` de better-sqlite3, sûre à chaud) et archive `uploads/`, rétention 14 jours. Compléter par les snapshots hebdomadaires de l'Instance Scaleway.

Les données persistent dans `./data` et `./uploads` sur le disque de l'instance.

### Déploiement automatique (GitHub Actions)

Après le **premier déploiement manuel** (étapes ci-dessus, dont `setup-server.sh` une seule fois), chaque `push` sur la branche `main` déploie automatiquement via `.github/workflows/deploy.yml`.

Configuration :
1. Générer une paire de clés dédiée au déploiement : `ssh-keygen -t ed25519 -f ~/.ssh/copro_deploy`
2. Sur le serveur, autoriser la clé publique : `cat ~/.ssh/copro_deploy.pub >> /root/.ssh/authorized_keys`
3. Dans GitHub (repo → Settings → Secrets and variables → Actions), créer 3 secrets :
   - `DEPLOY_HOST` = IP du serveur (ex. `51.159.64.71`)
   - `DEPLOY_USER` = `root`
   - `DEPLOY_SSH_KEY` = contenu de la clé **privée** `~/.ssh/copro_deploy`

Le workflow exécute `scripts/deploy.sh` sur le serveur (git pull + `docker compose -f docker-compose.prod.yml up -d --build`).

## Schéma de données

Tables : `units` (villas/garages 1–61 + parties communes), `users` (rôles resident/admin + statut `conseil_syndical`), `rattachements` (réclamé par le résident, accepté par un résident de l'unité ou le CS), `unit_residents` (unités validées), `tickets`, `ticket_units`, `ticket_events` (fil de suivi + décisions + éditions), `resolutions` (acceptations des travaux), `comptes_rendus` (une instance par unité + une pour le CS), `fichiers` (métadonnées des documents), `notifications` (in-app), `sessions`. Voir `src/db/schema.sql`.

## Limites de sécurité

- Mots de passe hachés (scrypt), sessions en cookie HttpOnly, contrôle d'accès par rôle/statut sur chaque route (lecture ouverte des tickets, écriture réservée selon les règles du CS), types MIME et taille max (10 Mo) vérifiés à l'upload, en-têtes `nosniff` sur les fichiers servis.
