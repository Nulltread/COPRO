# Première mise en production (version de test pour le conseil syndical)

## Objectif

Déployer l'application sur le serveur réel (Dedibox Scaleway) à l'adresse publique
**`https://copro-pinede-gardanne.fr`** (HTTPS automatique via Caddy), avec les
**comptes des membres du conseil syndical déjà créés**, les **123 lots peuplés
depuis la clé de répartition CCG** et quelques **données de test**, afin que le CS
teste une première version avant l'ouverture à tous les résidents.

## Environnement

- Même déploiement que la production (`docker-compose.prod.yml` + Caddy), à la
  **racine du domaine** `https://copro-pinede-gardanne.fr` (décision : pas de
  sous-domaine dédié — le serveur mail utilise `mail.copro-pinede-gardanne.fr`,
  aucun conflit ; voir `Caddyfile` et `mail-et-domaine.md`).
- **Déploiement automatique déjà actif** (constaté) : GitHub Actions déploie à
  chaque push sur `main` (secrets `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`,
  `scripts/deploy.sh`) ; l'application tourne déjà en ligne à
  `https://copro-pinede-gardanne.fr`.
- `.env` : `BASE_URL=https://copro-pinede-gardanne.fr`, **`MAIL_ENABLED=true` dès
  la v0** (décision : envoi de mail direct actif) : `SMTP_HOST=127.0.0.1`,
  `SMTP_PORT=25` (envoi direct, sans authentification, port 25 non bloqué sur la
  Dedibox), `MAIL_FROM=noreply@copro-pinede-gardanne.fr`.
- Prérequis de délivrabilité (sinon les mails partent en spam) : enregistrements
  DNS du domaine — MX vers `mail.copro-pinede-gardanne.fr`, SPF, DKIM, DMARC, et
  PTR IPv4 réglé sur `mail.copro-pinede-gardanne.fr.` (voir `mail-et-domaine.md`).
  La liste de diffusion `conseil-syndical@` nécessite en plus le serveur mail
  Mailcow installé sur la Dedibox.
- Sauvegarde : cron quotidien installé par `scripts/setup-server.sh` (voir
  `stockage-securite-deploiement.md`).

## Séquence de mise en production (ordre impératif)

1. **`npm run provisionner -- <fichier.json|->`** : compte admin + membres du CS.
2. **`npm run peupler`** : peuple les 123 lots depuis la clé CCG et fait le
   **nettoyage pre-prod intégré** (supprime les comptes de test `@copro.local`
   et **tous les tickets** — à faire **avant** de charger les données de test).
3. **Données de test** : `npm run seed` (jeu de démo complet) ou
   `npm run demo:creer` (5 tickets « [Démo] » ciblés).
4. **Mails de réinitialisation du mot de passe** pour les membres du CS : depuis
   la page Comptes (CS/admin), « renvoyer le mail de réinitialisation » — chaque
   membre choisit lui-même son mot de passe (spec 36 ; l'application ne transmet
   jamais de mot de passe en clair).
5. Envoi du mail de proposition (kit de com) et période de test du CS.
6. **Avant l'ouverture aux vrais résidents** : `npm run nettoyer-demo -- --tout`.

## Comptes pré-créés par l'administrateur (`npm run provisionner`)

- Script `src/db/provisionner-comptes.js` : crée le référentiel des unités si la
  base est vide (61 villas, 61 garages, parties communes), puis crée/met à jour
  les comptes listés dans le JSON. **Idempotent**. Entrée possible **sans email**
  (`sans_email: true`, compte retrouvé par nom+prénom à la ré-exécution).
- Le fichier JSON **n'est jamais versionné** (`.gitignore` : `comptes*.json`) et
  contient éventuellement des mots de passe : en production, il est passé **par
  stdin** dans le conteneur, jamais déposé sur le disque :
  `cat comptes-prod.json | docker compose -f docker-compose.prod.yml exec -T copro node src/db/provisionner-comptes.js -`
- Champs par compte : `email` (facultatif, normalisé en minuscules ; unicité parmi
  les comptes actifs uniquement), `nom`, `prenom` (obligatoires), `telephone`,
  `mot_de_passe` (facultatif : généré aléatoirement et affiché une seule fois en
  console si absent ; fourni = (ré)initialisé), `conseil_syndical` (booléen),
  `unites` : liste de `{ type: villa|garage|communes, numero, qualite }`.
- **`unites` = rattachements directs locataires uniquement, plus les parties
  communes** (qualité `proprietaire` autorisée uniquement sur `communes`) : un
  rattachement **propriétaire direct sur villa/garage est refusé** — les
  propriétaires sont liés à leurs unités **via leur lot** (voir `35-lots.md` et
  `rattachements.md`).
- Champ `admin` (objet unique) : déclare **le** compte admin (un seul autorisé ;
  un second admin distinct est refusé). **L'admin n'est jamais rattaché à une
  unité** (il voit tous les tickets sans condition d'unité, voir
  `comptes-et-roles.md`) : le script ignore les unités déclarées pour l'admin,
  refuse le statut CS sur l'admin, et refuse de lister l'admin dans `comptes`.
- **Le compte admin est un compte technique distinct du compte résident** :
  un membre du CS qui administre l'application a **deux comptes** — son compte
  principal, résident classique avec statut CS (ex. : le président du CS :
  `sebastien.paletti@gmail.com`, locataire du garage 43, lot 35 rattaché par le
  peuplement), et le compte admin technique (`admin@copro-pinede-gardanne.fr`,
  sans aucune unité).
- Les comptes créés ont leur **email considéré comme vérifié** (`email_verifie=1`)
  et leurs **rattachements acceptés d'office** (`rattachements` + `unit_residents`),
  validés par l'admin — ils sont immédiatement utilisables.
- **Les identifiants ne sont jamais envoyés dans un mail de groupe** : pour les
  comptes avec email, le **mail de réinitialisation du mot de passe** est envoyé
  depuis la page Comptes (spec 36) — transmission individuelle d'un lien, jamais
  d'un mot de passe en clair.

## Peuplement des lots et comptes depuis la clé de répartition CCG (`npm run peupler`)

- Script `src/db/peupler-cle-repartition.js` avec les données CCG embarquées
  (`src/db/cle-repartition-ccg.json`, spec 35) : crée les **123 lots** (n°,
  désignation, type, tantièmes) et **un compte par propriétaire** (sans email,
  donc inaccessible tant qu'aucun email n'est renseigné — sauf les membres du CS,
  dont le compte existant est retrouvé par nom et réutilisé).
- **Correspondances explicites** dans le JSON CCG (ex. représentant ERILIA
  `julien.debastiani@erilia.fr`, couples BLAUVAC & HYPOLITE et GOMEZ) : le lot
  est rattaché au compte portant cet email, prioritaire sur le matching par nom.
- **Nettoyage pre-prod intégré** (désactivable avec `--sans-nettoyage`) : si des
  comptes de test existent (`*@copro.local`, hors compte admin), ils sont
  supprimés, ainsi que **tous les tickets** avec leurs fichiers joints, les
  documents déposés, et leurs lots sont détachés. **Unités, compte admin et
  comptes réels inchangés.** Idempotent.
- Aucun lien lot → unité n'est créé (mapping inconnu à date) : les propriétaires
  ajoutent leurs unités depuis leur profil (« Mes lots »), validées par le CS/admin.
- Ensuite, depuis la page Comptes (CS/admin), renseigner l'email de chaque
  propriétaire : le **mail de réinitialisation du mot de passe est envoyé
  automatiquement** (spec 36).

## Données de test (après `npm run peupler`, qui vide les tickets)

- **Jeu de démo existant** : `npm run seed` (`src/db/seed.js`) — comptes de démo
  (mot de passe commun `demo1234` : `admin@copro.local`, `conseil1/2@copro.local`,
  `resident1…61@copro.local`, `locataire1…10@copro.local`, `attente@copro.local`)
  et 7 tickets à différents stades du cycle.
- Alternative plus légère : **`npm run demo:creer`** (`src/db/donnees-demo.js`) :
  5 tickets de démonstration à tous les stades (créé, consultation avec devis,
  travaux planifiés, travaux acceptés avec bilan, archivé), un ticket marqué
  **urgent**, 2 entreprises et des devis (PDF factices), répartis sur les unités
  des membres du CS. **Idempotent**. Préfixe **« [Démo] »**, supprimables avec
  **`npm run demo:supprimer`** (`--reset`, fichiers inclus).

## Kit de communication v0 et annonce au conseil syndical

- **Kit de communication** dans **`mise-en-prod/kit-com/`** (les `{{URL}}` sont à
  personnaliser avant envoi) :
  - `doc-presentation.md` : document compréhensif de présentation de l'outil
    (fonctionnalités, parcours d'un ticket, lots, documents, visibilité, données),
    destiné à être diffusé à tous les résidents après la période de test ;
  - `aide-inscription.md` : fiche d'aide en 5 étapes (locataires : auto-inscription
    ; mot de passe oublié : réinitialisation par mail) ;
  - `mail-proposition.md` : mail de proposition au conseil syndical (comptes déjà
    créés, lots peuplés, données de démo chargées, documents en pièce jointe,
    période de test et collecte des retours, ouverture à tous les résidents
    ensuite).
- **Checklist complète** de la mise en production (DNS, déploiement, secrets
  GitHub Actions, comptes, peuplement, données de test, vérifications, envoi du
  mail) dans **`mise-en-prod/checklist.md`**.

## Nettoyage avant la mise en production réelle

- Le référentiel des unités est **fixe** (61 villas, 61 garages, parties communes,
  en dur) et le référentiel des lots est **fixe** (123 lots CCG) : jamais modifiés
  par le nettoyage.
- Le **nettoyage pre-prod principal est intégré à `npm run peupler`** (étape 2
  ci-dessus) : comptes de test + tous les tickets supprimés avant la v0.
- Script **`npm run nettoyer-demo`** (`src/db/nettoyer-demo.js`, option `--tout`)
  pour le nettoyage final **avant l'ouverture aux vrais résidents** : supprime
  les comptes fictifs restants (`*@copro.local`), les tickets de démo « [Démo] »,
  les entreprises orphelines, et avec `--tout` **tous les tickets restants** ;
  détache aussi lots/lot_units/lot_events/documents des comptes supprimés
  (schéma v6). **Conserve** les unités, les lots, le compte admin et les comptes
  réels (CS).

## Après la période de test

- Nettoyage (`npm run nettoyer-demo -- --tout`), puis ouverture de
  l'auto-inscription (locataires) à tous les résidents et diffusion du kit de
  communication.
