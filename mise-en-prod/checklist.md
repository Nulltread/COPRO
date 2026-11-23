# Checklist — première mise en production (version de test pour le conseil syndical)

## 1. Serveur et domaine

- [ ] Record DNS `A` de `copro-pinede-gardanne.fr` → IP publique de la Dedibox (vérifier la propagation).
- [ ] `Caddyfile` : le domaine est déjà `copro-pinede-gardanne.fr` (HTTPS automatique Let's Encrypt).
- [ ] `.env` sur le serveur : `PORT=3000`, `BASE_URL=https://copro-pinede-gardanne.fr`, `MAIL_ENABLED=false` pour la version de test (notifications 100 % in-app) — activer plus tard quand le serveur mail (Mailcow) et les enregistrements DNS mail seront en place (voir `spécifications/mail-et-domaine.md`).

## 2. Déploiement

- [ ] Premier déploiement manuel : `sudo scripts/setup-server.sh copro-pinede-gardanne.fr` sur la Dedibox (compte `copro` avec sudo), ou vérifier que le déploiement automatique GitHub Actions est actif (secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` renseignés — chaque push sur `main` déploie).
- [ ] Vérifier : `https://copro-pinede-gardanne.fr` répond (page de connexion), certificat HTTPS valide.
- [ ] Cron de sauvegarde installé par `setup-server.sh` (vérifier `crontab -l`) ; complément : snapshots hebdomadaires de la Dedibox.

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

## 7. Après la période de test

- [ ] Retirer les données de démo si besoin (`npm run comptes-test:supprimer`, `npm run demo:supprimer`, ou base vidée), révoquer éventuellement les mots de passe de test.
- [ ] Ouvrir l'inscription à tous les résidents : diffuser `doc-presentation.md` + `aide-inscription.md` (affichage, mail à la liste de la copro).
- [ ] Activer l'envoi d'emails (`MAIL_ENABLED=true` + Mailcow + DNS) quand le serveur mail est prêt.
