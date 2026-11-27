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

## 3. Comptes admin + conseil syndical (`npm run provisionner`)

- [ ] Remplir `comptes-prod.json` (format ci-dessous) — **ce fichier n'est jamais versionné** (`.gitignore` : `comptes*.json`).
- [ ] Sur le serveur, passer le fichier par stdin dans le conteneur (aucun secret ne traîne sur le disque) :

  ```bash
  cat comptes-prod.json | docker compose -f docker-compose.prod.yml exec -T copro node src/db/provisionner-comptes.js -
  ```

  Le script crée le référentiel (61 villas, 61 garages, parties communes) si la base est vide, crée/met à jour les comptes (emails considérés comme vérifiés, rattachements acceptés d'office).

- [ ] Format du JSON :

  ```json
  {
    "admin": { "email": "admin@copro-pinede-gardanne.fr", "nom": "Admin", "prenom": "Admin", "telephone": "" },
    "comptes": [
      {
        "email": "prenom.nom@exemple.fr", "nom": "Nom", "prenom": "Prénom", "telephone": "06…",
        "mot_de_passe": "laissé vide = généré automatiquement",
        "conseil_syndical": true,
        "unites": [
          { "type": "garage", "numero": 43, "qualite": "locataire" },
          { "type": "communes", "qualite": "proprietaire" }
        ]
      }
    ]
  }
  ```

  `unites` = **rattachements directs locataires uniquement + parties communes** : un rattachement propriétaire sur villa/garage est **refusé** (les propriétaires sont liés à leurs unités via leur lot — voir spec 35).
  **Règle absolue** : le compte `admin` n'est **jamais** rattaché à une unité — aucune `unites` dans le bloc `admin`, et il n'est pas listé dans `comptes` (le script le refuse de toute façon).

- [ ] Depuis la page **Comptes** (CS/admin), cliquer « renvoyer le mail de réinitialisation du mot de passe » pour chaque membre du CS : chacun choisit son mot de passe via le lien reçu par mail (jamais de mot de passe en clair transmis).

## 4. Peuplement des lots depuis la clé CCG (`npm run peupler`) — AVANT les données de test

- [ ] `docker compose -f docker-compose.prod.yml exec copro npm run peupler`
  → crée les **123 lots** (tantièmes inclus) + un compte par propriétaire (sans email), rattache les lots des membres du CS à leurs comptes (matching par nom + correspondances explicites ERILIA / couples), et fait le **nettoyage pre-prod intégré** (comptes de test `@copro.local` + **tous les tickets** supprimés ; unités, admin et comptes réels inchangés). Idempotent ; `--sans-nettoyage` pour désactiver le nettoyage.
- [ ] Vérifier le rapport affiché (lots créés, comptes créés/réutilisés, nettoyage).

## 5. Données de test (APRÈS `peupler`, qui vide les tickets)

- [ ] **Jeu de démo complet** : `docker compose -f docker-compose.prod.yml exec copro npm run seed` — comptes de démo (`demo1234` : `admin@copro.local`, `conseil1/2@copro.local`, `resident1…61@copro.local`, …) et 7 tickets à différents stades.
- [ ] Alternative plus légère : `docker compose -f docker-compose.prod.yml exec copro npm run demo:creer` — 5 tickets « [Démo] » ciblés (supprimables : `npm run demo:supprimer`).

## 6. Vérifications avant annonce

- [ ] `npm test` et `node scripts/smoke.js` passent en CI (GitHub Actions, branche `main`).
- [ ] Connexion de chaque compte CS de test sur `https://copro-pinede-gardanne.fr` (via le mail de réinitialisation reçu).
- [ ] Chaque membre du CS voit bien **ses lots** (onglet Lots) et peut créer un ticket.

## 7. Kit de communication et envoi du mail

- [ ] Kit v0 dans `mise-en-prod/kit-com/` : `doc-presentation.md`, `aide-inscription.md`, `mail-proposition.md`.
- [ ] Personnaliser `{{URL}}` et la signature dans les 3 documents ; exporter les 2 docs en PDF (ou copier dans un traitement de texte) pour les joindre au mail.
- [ ] Envoyer le mail de proposition au conseil syndical, avec `doc-presentation.md` et `aide-inscription.md` en pièce jointe.

## 8. Avant l'ouverture aux vrais résidents (mise en prod réelle)

- [ ] Nettoyage final sur le serveur : `docker compose -f docker-compose.prod.yml exec copro npm run nettoyer-demo -- --tout` — supprime les comptes fictifs restants (`@copro.local`), tous les tickets de test et leurs fichiers, les tickets « [Démo] », les entreprises orphelines ; **conserve** les unités (fixes), les 123 lots, ton compte, le compte admin et les comptes réels du CS.
- [ ] Vérifier : seuls les comptes réels restent, aucun ticket de test.
- [ ] Ouvrir l'auto-inscription (locataires) : diffuser `doc-presentation.md` + `aide-inscription.md` du kit — affichage, mail à la liste de la copro. Les propriétaires ont déjà leur compte (email renseigné depuis la page Comptes → mail de réinitialisation automatique).

---

## 9. Lancement v0 — période de test CS (27/11/2026) : runbook exact

Le déploiement auto (GitHub Actions → `scripts/deploy.sh`) a déjà livré le code sur le serveur.
Sur le serveur, **dans le dossier de l'app** (là où tourne `docker compose -f docker-compose.prod.yml`) :

```bash
# 0. (optionnel) s'assurer d'avoir le dernier code déployé
cd /chemin/de/lapp && git pull --ff-only origin main

# 1. Peupler la base avec les tickets de test RÉALISTES (issus des vrais mails copro / CG IMMO)
#    Idempotent : relancer ne duplique rien. Ne touche ni aux comptes ni aux lots.
docker compose -f docker-compose.prod.yml exec copro npm run seed:realiste
#   attendu : « Seed réaliste : 11 ticket(s) créé(s), 0 déjà présent(s), 9 entreprise(s) enregistrée(s) »

# 2. Vérifier le peuplement
docker compose -f docker-compose.prod.yml exec copro node -e 'const {getDb}=require("./src/db");const db=getDb();console.log("tickets:",db.prepare("SELECT COUNT(*) c FROM tickets").get().c,"entreprises:",db.prepare("SELECT COUNT(*) c FROM entreprises").get().c,"lots:",db.prepare("SELECT COUNT(*) c FROM lots").get().c,"comptes CS:",db.prepare("SELECT COUNT(*) c FROM users WHERE conseil_syndical=1").get().c)'

# 3. Renvoyer le mail individuel de réinitialisation du mot de passe à chaque compte CS
#    (le mail de lancement annonce ces mails séparés). Nécessite MAIL_ENABLED=true dans .env.
#    (limite anti-spam : 1 mail/min/compte — les comptes datent d'avant, donc OK)
docker compose -f docker-compose.prod.yml exec copro node -e 'const {getDb}=require("./src/db");const {envoyerMailResetAvecLimite}=require("./src/mail");const db=getDb();for(const u of db.prepare("SELECT * FROM users WHERE conseil_syndical=1 AND email IS NOT NULL").all()){if(u.statut!="actif"||u.role=="admin")continue;console.log(u.email,envoyerMailResetAvecLimite(u)?"mail reset envoyé":"déjà envoyé il y a <1 min")}'
#    Alternative sans CLI : connecté en admin sur https://copro-pinede-gardanne.fr → /admin/comptes
#    → bouton « renvoyer le mail de réinitialisation » sur chaque compte CS.
```

Puis : envoi du mail de lancement au CS = **brouillon Gmail v3** (`r1092702707680646022`, 9 destinataires),
envoyé via le connecteur Gmail **uniquement sur GO explicite de Sébastien**.

- [ ] `seed:realiste` exécuté sur le serveur (11 tickets, 9 entreprises)
- [ ] Vérification des compteurs (étape 2 ci-dessus)
- [ ] Mails de réinitialisation envoyés aux 9 comptes CS
- [ ] Mail de lancement v3 envoyé (brouillon `r1092702707680646022`)
- [ ] Test de connexion d'au moins 2 comptes CS sur https://copro-pinede-gardanne.fr
