# Première mise en production (version de test pour le conseil syndical)

## Objectif

Déployer l'application sur le serveur réel (Dedibox Scaleway) à l'adresse publique
**`https://copro-pinede-gardanne.fr`** (HTTPS automatique via Caddy), avec les
**comptes des membres du conseil syndical déjà créés** et quelques **données de
test**, afin que le CS teste une première version avant l'ouverture à tous les
résidents.

## Environnement

- Même déploiement que la production (`docker-compose.prod.yml` + Caddy), domaine
  `copro-pinede-gardanne.fr` (racine du domaine, voir `Caddyfile`).
- `.env` : `BASE_URL=https://copro-pinede-gardanne.fr` ; `MAIL_ENABLED=false` tant
  que le serveur mail (Mailcow) et les enregistrements DNS mail ne sont pas en
  place (voir `mail-et-domaine.md`) — les notifications restent 100 % in-app.
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
  un second admin distinct est refusé).
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

## Après la période de test

- Suppression des données de démo (`npm run demo:supprimer`), ouverture de
  l'auto-inscription à tous les résidents, activation de l'envoi d'emails une fois
  le serveur mail en place.
