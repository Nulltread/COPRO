# Checklist — première mise en production (version de test pour le conseil syndical)

## 1. Serveur et domaine

- [ ] Record DNS `A` de `copro-pinede-gardanne.fr` → IP publique de la Dedibox (vérifier la propagation). L'app est servie à la **racine** du domaine (le serveur mail utilise `mail.copro-pinede-gardanne.fr`, aucun conflit).
- [ ] `Caddyfile` : le domaine est déjà `copro-pinede-gardanne.fr` (HTTPS automatique Let's Encrypt).
- [ ] `.env` sur le serveur : `PORT=3000`, `BASE_URL=https://copro-pinede-gardanne.fr`, **`MAIL_ENABLED=true`** (envoi de mail direct actif dès la v0) : `SMTP_HOST=127.0.0.1`, `SMTP_PORT=25`, `MAIL_FROM=noreply@copro-pinede-gardanne.fr`.
- [ ] DNS mail pour la délivrabilité (sinon spam) : `MX @ → mail.copro-pinede-gardanne.fr`, `A mail → IP`, TXT SPF (`v=spf1 mx -all`), DKIM (`dkim._domainkey`), DMARC (`_dmarc`), et **PTR** de l'IP → `mail.copro-pinede-gardanne.fr.` (voir `spécifications/mail-et-domaine.md`). Port 25 sortant non bloqué sur la Dedibox (vérifié).
- [ ] (Pour la liste de diffusion `conseil-syndical@`) Installer Mailcow en conteneur dédié sur la Dedibox — voir `spécifications/mail-et-domaine.md`.

## 2. Déploiement (déjà en place)

- [x] Déploiement automatique GitHub Actions actif : secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` renseignés — **chaque push sur `main` déploie** (`scripts/deploy.sh` : git pull + rebuild). Vérifié : les derniers runs Deploy/CI sont en `success`.
- [x] L'application tourne déjà à `https://copro-pinede-gardanne.fr` (page de connexion, HTTPS Let's Encrypt via Caddy).
- [ ] Sauvegarde quotidienne installée par `setup-server.sh` (vérifier la planification sur la Dedibox) ; complément : snapshots hebdomadaires de la Dedibox.

## 3. Comptes du conseil syndical (pré-créés par l'admin)

- [ ] Remplir `comptes-prod.json` (format ci-dessous) — **ce fichier n'est jamais versionné** (`.gitignore` : `comptes*.json`).
- [ ] Sur le serveur, passer le fichier par stdin dans le conteneur (aucun secret ne traîne sur le disque) :

  ```bash
  cat comptes-prod.json | docker compose -f docker-compose.prod.yml exec -T copro node src/db/provisionner-comptes.js -
  ```

  Le script crée le référentiel (61 villas, 61 garages, parties communes) si la base est vide, crée/met à jour les comptes (emails considérés comme vérifiés, rattachements acceptés d'office) et affiche une fois les mots de passe générés.

- [ ] Format du JSON :

  ```json
  {
    "admin": { "email": "vous@exemple.fr", "nom": "Votre Nom", "prenom": "Prénom", "telephone": "06…", "mot_de_passe": "…" },
    "comptes": [
      {
        "email": "prenom.nom@exemple.fr", "nom": "Nom", "prenom": "Prénom", "telephone": "06…",
        "mot_de_passe": "laissé vide = généré automatiquement",
        "conseil_syndical": true,
        "unites": [
          { "type": "villa", "numero": 12, "qualite": "proprietaire" },
          { "type": "garage", "numero": 12, "qualite": "proprietaire" },
          { "type": "communes", "qualite": "proprietaire" }
        ]
      }
    ]
  }
  ```

  `type` : `villa` | `garage` | `communes` ; `qualite` : `proprietaire` | `locataire` (défaut `proprietaire`).
  **Règle absolue** : le compte `admin` n'est **jamais** rattaché à une unité — ne mets aucune `unites` dans le bloc `admin`, et ne le liste pas dans `comptes` (le script le refuse de toute façon).

- [ ] Transmettre à chaque membre son mot de passe par un canal individuel (jamais dans le mail de groupe).

## 4. Données de test

- [ ] **Jeu de démo existant (recommandé pour la v0)** : `docker compose -f docker-compose.prod.yml exec copro npm run seed` — 61 villas, 61 garages, parties communes, comptes de démo (mot de passe commun `demo1234` : `admin@copro.local`, `conseil1@copro.local`, `conseil2@copro.local`, `resident1…61@copro.local`, `locataire1…10@copro.local`) et 7 tickets à différents stades.
- [ ] Alternative plus légère (tickets ciblés sur les unités des membres du CS) : `docker compose -f docker-compose.prod.yml exec copro npm run demo:creer` — 5 tickets marqués « [Démo] », supprimables ensuite avec `npm run demo:supprimer`.

## 5. Vérifications avant annonce

- [ ] `npm test` et `node scripts/smoke.js` passent en CI (GitHub Actions, branche `main`).
- [ ] Connexion de chaque compte CS de test sur `https://copro-pinede-gardanne.fr` (page de connexion → liste des tickets).
- [ ] Un ticket créé depuis un compte CS apparaît bien pour tout le monde.

## 6. Kit de communication et envoi du mail

- [ ] Kit v0 dans `mise-en-prod/kit-com/` : `doc-presentation.md` (présentation de l'outil, à diffuser à tous les résidents ensuite), `aide-inscription.md` (fiche « créer son compte » en 5 étapes), `mail-proposition.md` (mail de proposition au CS).
- [ ] Personnaliser `{{URL}}` et la signature dans les 3 documents ; exporter les 2 docs en PDF (ou les copier dans un traitement de texte) pour les joindre au mail.
- [ ] Envoyer le mail de proposition au conseil syndical, avec `doc-presentation.md` et `aide-inscription.md` en pièce jointe.
- [ ] Transmettre les identifiants (mot de passe) individuellement — jamais dans le mail de groupe.

## 7. Avant l'ouverture aux vrais résidents (mise en prod réelle)

- [ ] Nettoyage sur le serveur : `docker compose -f docker-compose.prod.yml exec copro npm run nettoyer-demo -- --tout` — supprime les comptes fictifs (`@copro.local`), leurs tickets et fichiers, les tickets « [Démo] » et les entreprises orphelines ; **conserve** les unités (fixes : 61 villas, 61 garages, parties communes), ton compte, le compte admin et les comptes réels du CS.
- [ ] Vérifier : seuls les comptes réels restent, aucun ticket de test.
- [ ] Ouvrir l'inscription à tous les résidents : diffuser `doc-presentation.md` + `aide-inscription.md` du kit (`mise-en-prod/kit-com/`) — affichage, mail à la liste de la copro.
