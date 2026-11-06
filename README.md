# Copro des Pavillons — suivi de travaux et sinistres

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

## Lancer en local

```bash
npm install
npm run seed     # jeu de données de démo (61 villas, 61 garages, comptes, tickets)
npm start        # http://localhost:3000
npm test         # tests API
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

## Schéma de données

Tables : `units` (villas/garages 1–61), `users` (rôles + statut de validation), `unit_residents` (rattachements multi-occupants), `tickets`, `ticket_units`, `ticket_events` (fil de suivi + décisions), `fichiers` (métadonnées des documents), `notifications`, `push_subscriptions`, `sessions`. Voir `src/db/schema.sql`.

## Limites de sécurité

- Mots de passe hachés (scrypt), sessions en cookie HttpOnly, contrôle d'accès par rôle et par unité sur chaque route de ticket/fichier, types MIME et taille max (10 Mo) vérifiés à l'upload, en-têtes `nosniff` sur les fichiers servis.
