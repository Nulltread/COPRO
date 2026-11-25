# Première mise en production (version de test pour le conseil syndical)

## Objectif

Déployer l'application sur le serveur réel (Dedibox Scaleway) à l'adresse publique
**`https://copro-pinede-gardanne.fr`** (HTTPS automatique via Caddy), avec les
**comptes des membres du conseil syndical déjà créés** et quelques **données de
test**, afin que le CS teste une première version avant l'ouverture à tous les
résidents.

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

## Comptes pré-créés par l'administrateur

- Script **`npm run provisionner -- <fichier.json|->`**
  (`src/db/provisionner-comptes.js`) : crée le référentiel des unités si la base est
  vide (61 villas, 61 garages, parties communes), puis crée/met à jour les comptes
  listés dans le JSON. **Idempotent** (peut être rejoué sans doublon).
- Le fichier JSON **n'est jamais versionné** (`.gitignore` : `comptes*.json`) et
  contient éventuellement des mots de passe : en production, il est passé **par
  stdin** dans le conteneur, jamais déposé sur le disque :
  `cat comptes-prod.json | docker compose -f docker-compose.prod.yml exec -T copro node src/db/provisionner-comptes.js -`
- Champs par compte : `email` (normalisé en minuscules), `nom`, `prenom`,
  `telephone`, `mot_de_passe` (facultatif : **généré aléatoirement et affiché une
  seule fois** en console si absent ; fourni = (ré)initialisé), `conseil_syndical`
  (booléen), `unites` : liste de `{ type: villa|garage|communes, numero, qualite:
  proprietaire|locataire }`.
- Champ `admin` (objet unique) : déclare **le** compte admin (un seul autorisé ;
  un second admin distinct est refusé). **L'admin n'est jamais rattaché à une
  unité** (il voit tous les tickets sans condition d'unité, voir
  `comptes-et-roles.md`) : le script ignore les unités déclarées pour l'admin,
  refuse le statut CS sur l'admin, et refuse de lister l'admin dans `comptes`.
- **Le compte admin est un compte technique distinct du compte résident** :
  un membre du CS qui administre l'application a **deux comptes** — son compte
  principal, résident classique avec statut CS et rattaché à ses unités
  (ex. : le président du CS : `sebastien.paletti@gmail.com`, propriétaire
  villa 10, locataire garage 43), et le compte admin technique
  (`admin@copro-pinede-gardanne.fr`, sans aucune unité).
- Les comptes créés ont leur **email considéré comme vérifié** (`email_verifie=1`)
  et leurs **rattachements acceptés d'office** (`rattachements` + `unit_residents`),
  validés par l'admin — ils sont immédiatement utilisables, sans attendre de
  validation par email.
- Les mots de passe sont hachés (scrypt) comme à l'inscription ; les mots de passe
  générés ne sont affichés qu'une fois, en console, lors de l'exécution du script.
- **Les identifiants ne sont jamais envoyés dans un mail de groupe** : transmission
  individuelle (voir le mail d'annonce).

## Données de test

- **Jeu de démo existant, recommandé pour la v0** : `npm run seed`
  (`src/db/seed.js`) — 61 villas, 61 garages, parties communes, comptes de démo
  (mot de passe commun `demo1234` : `admin@copro.local`, `conseil1/2@copro.local`,
  `resident1…61@copro.local`, `locataire1…10@copro.local`, `attente@copro.local`)
  et 7 tickets à différents stades du cycle.
- Alternative plus légère : script **`npm run demo:creer`**
  (`src/db/donnees-demo.js`) : crée 5 tickets de démonstration à tous les stades
  (créé, consultation avec devis, travaux planifiés, travaux acceptés avec bilan,
  archivé), un ticket marqué **urgent**, 2 entreprises et des devis (PDF
  factices), répartis sur les unités des membres du CS. **Idempotent**. Tous les
  tickets de démo portent le préfixe **« [Démo] »** et sont supprimables en une
  commande après la période de test : **`npm run demo:supprimer`** (`--reset`,
  fichiers inclus).

## Kit de communication v0 et annonce au conseil syndical

- **Kit de communication** dans **`mise-en-prod/kit-com/`** (les `{{URL}}` sont à
  personnaliser avant envoi) :
  - `doc-presentation.md` : document compréhensif de présentation de l'outil
    (fonctionnalités, parcours d'un ticket, visibilité, données), destiné à être
    diffusé à tous les résidents après la période de test ;
  - `aide-inscription.md` : fiche d'aide à l'inscription en 5 étapes, la plus
    basique possible (créer son compte, valider son email, réclamer son
    rattachement villa/garage, déclarer son premier ticket) ;
  - `mail-proposition.md` : mail de proposition au conseil syndical (comptes
    déjà créés, données de démo chargées, documents en pièce jointe, période de
    test et collecte des retours, ouverture à tous les résidents ensuite).
    **Les identifiants ne partent jamais dans le mail de groupe** : transmission
    individuelle.
- **Checklist complète** de la mise en production (DNS, déploiement, secrets
  GitHub Actions, comptes, données de test, vérifications, envoi du mail) dans
  **`mise-en-prod/checklist.md`**.

## Nettoyage avant la mise en production réelle

- Le référentiel des unités est **fixe** (61 villas, 61 garages, parties communes,
  en dur) : il n'est jamais modifié par le nettoyage.
- Script **`npm run nettoyer-demo`** (`src/db/nettoyer-demo.js`, option `--tout`)
  à exécuter sur le serveur **avant l'ouverture aux vrais résidents** :
  - supprime les **comptes fictifs** du seed/comptes-test (`*@copro.local`) avec
    leurs tickets, fichiers (disque inclus), rattachements, sessions et
    notifications ;
  - supprime les tickets de démo marqués **« [Démo] »** (même créés par des
    comptes réels) et les **entreprises** plus référencées ;
  - **conserve** les unités, le compte admin et les comptes réels (CS) — ainsi
    que leurs tickets, sauf avec `--tout` qui vide **tous** les tickets restants
    pour repartir d'une base vierge.
- Ordre conseillé : période de test du CS avec les données de démo →
  `npm run nettoyer-demo -- --tout` (base prête pour la prod) → diffusion du kit
  de com (`mise-en-prod/kit-com/`) à tous les résidents → auto-inscription ouverte.

## Peuplement des lots et comptes depuis la clé de répartition CCG (spec 35)

- Après `npm run provisionner` (compte admin + membres du CS avec leurs vrais emails) :
  **`npm run peupler`** (`src/db/peupler-cle-repartition.js`) peuple les **123 lots de la
  clé CCG** (tantièmes inclus) et crée **un compte par propriétaire** (sans email, donc
  inaccessible tant qu'aucun email n'est renseigné — sauf les membres du CS, dont le
  compte existant est retrouvé par nom et réutilisé, ex. `sebastien.paletti@gmail.com`).
  Aucun lien lot → unité n'est créé (mapping lot/unités à renseigner au fil de l'eau par
  les propriétaires, validé par le CS/admin).
- Le script fait aussi le **nettoyage pre-prod** s'il détecte des comptes de test
  (`*@copro.local`, **hors compte admin**) : comptes de test supprimés, **tous les
  tickets supprimés avec leurs fichiers joints**, unités / admin / comptes réels
  **inchangés** (`--sans-nettoyage` pour désactiver). Idempotent : une ré-exécution ne
  crée rien de plus.
- Ensuite, depuis la page Comptes (CS/admin), renseigner l'email de chaque
  propriétaire : le **mail de réinitialisation du mot de passe est envoyé
  automatiquement** (spec 36).

## Après la période de test

- Nettoyage (`npm run nettoyer-demo -- --tout`), puis ouverture de
  l'auto-inscription à tous les résidents et diffusion du kit de communication.
