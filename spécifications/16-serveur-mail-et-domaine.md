# Serveur mail et domaine `copro-pinede-gardanne.fr`

Ce fichier réintroduit le **canal email** (retiré en v1 dans `08-notifications.md` et `02-roles-et-comptes.md`) et définit l'infrastructure mail du projet. En cas de contradiction, ce fichier (préfixe 16) prime sur les fichiers précédents.

## Objectifs

1. **Notifications par email** de l'avancée des tickets (en complément des notifications in-app, qui restent le canal principal).
2. **Confirmation de compte par email** à l'inscription (vérification de l'adresse email des utilisateurs).
3. **Liste de diffusion du conseil syndical** : une adresse unique (`conseil-syndical@copro-pinede-gardanne.fr`) qui redirige vers les adresses email personnelles (vérifiées) des membres du CS.

**Hors périmètre v1 (noté pour plus tard, non traité)** : envois automatiques depuis le serveur pour des sujets futurs (convocations aux AG, appels de fonds, etc.).

## Domaine

- Nom de domaine dédié : **`copro-pinede-gardanne.fr`**, acheté chez un registrar (ex. Scaleway Domains, OVH, Gandi).
- Le site web de l'application reste sur son domaine existant ; le sous-domaine **`mail.copro-pinede-gardanne.fr`** pointe vers l'IP de l'instance Scaleway hébergeant le serveur mail.

## Serveur mail

- **Auto-hébergé sur le serveur Scaleway existant** (Dedibox Start-2-S-SSD, Ubuntu 20.04, IP publique `51.159.64.71`), même serveur que l'application, déployé en conteneur Docker dédié (**Mailcow dockerisé**, installé dans `/opt/mailcow-dockerized` par l'utilisateur `copro`), séparé du conteneur de l'application. Ports web de Mailcow déplacés en **8080/8443** (`HTTP_PORT`/`HTTPS_PORT` dans `mailcow.conf`) car 80/443 sont pris par Caddy : l'interface d'admin est donc sur **https://mail.copro-pinede-gardanne.fr:8443/admin** (l'URL racine `/` est l'interface *utilisateur*, qui n'accepte pas le compte `admin`). Mot de passe admin : défini en base avec le préfixe `{BLF-CRYPT}` + hash bcrypt (un hash bcrypt nu, sans préfixe `{...}`, est rejeté par `verify_hash`). Le réseau interne Docker de Mailcow utilise la plage `172.30.1.0/24` (`IPV4_NETWORK=172.30.1`) pour éviter le chevauchement avec le réseau de l'application.
- **Mode « redirect seul »** : **aucune boîte mail créée sur le domaine**, le webmail SOGo est **désactivé** (`SKIP_SOGO=y` dans `mailcow.conf`) — aucune interface mail utilisateur. Le serveur ne fait que recevoir les mails des adresses déclarées (alias) et les rediriger, et envoyer les mails de l'application.
- **Envoi des emails de l'application** via le serveur mail local en SMTP **sans authentification** (l'application tourne sur le même hôte : soumission via `127.0.0.1`/réseau Docker local, `permit_mynetworks`) : aucune dépendance à un service payant. Adresse d'expédition fixe : **`noreply@copro-pinede-gardanne.fr`** (adresse d'envoi uniquement ; aucune réception — voir ci-dessous). Configuration par variables d'environnement (`SMTP_HOST` défaut `127.0.0.1`, `SMTP_PORT` défaut `25`, `MAIL_FROM`, `BASE_URL` pour les liens dans les emails, `MAIL_ENABLED=false` pour désactiver l'envoi ; `MAILCOW_API_URL`, `MAILCOW_API_KEY`, `MAIL_DOMAIN` pour la synchro de l'alias CS).
- **Contraintes Scaleway Dedibox** : le **PTR IPv4 est réglé** (`mail.copro-pinede-gardanne.fr.` — **avec le point final**, exigé par la console — via « Modifier » à côté de « Reverse »). Gmail rejette sinon (550-5.7.25). Le **PTR IPv6 n'a pas pu être réglé** (la console exige un AAAA correspondant ; même après ajout de l'AAAA `mail`, refus « No match found ») — sans conséquence constatée : le test d'envoi vers Gmail a abouti (`status=sent`). Le port 25 sortant **n'est pas bloqué** sur cette Dedibox (envoi direct OK, aucun ticket support nécessaire). Un enregistrement **AAAA** `mail` → IPv6 du serveur a été ajouté pour la cohérence DNS.

## Enregistrements DNS du domaine

| Type | Nom | Valeur |
|---|---|---|
| A | `mail` | IP publique du serveur Dedibox `51.159.64.71` (enregistrement créé dans la section **Domains and DNS** de la console Scaleway, avant l'installation du serveur mail, pour permettre le certificat HTTPS) |
| MX | `@` | `mail.copro-pinede-gardanne.fr` (priorité 10) |
| TXT (SPF) | `@` | `v=spf1 mx -all` |
| TXT (DKIM) | `dkim._domainkey` | clé publique générée par le serveur mail |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:admin@copro-pinede-gardanne.fr` |

## Fonctionnalités applicatives

### Notifications par email des tickets
- **Option utilisateur, désactivée par défaut** : chaque compte peut activer « recevoir aussi les notifications par email » dans son espace profil (`users.notif_email`, défaut 0). Seuls les destinataires ayant activé l'option **et** un email vérifié reçoivent le mail.
- Les mêmes événements que le canal in-app (`08-notifications.md`) déclenchent un **email**, auteur de l'événement exclu. L'email contient un **lien direct** vers la page concernée dans l'application (`/tickets/:id` si la notification porte sur un ticket, sinon `/notifications`).
- Mention « URGENT » conservée dans l'objet pour les tickets urgents.
- Les emails sont envoyés en arrière-plan pour ne pas ralentir l'interface ; un échec d'envoi ne bloque pas l'action et est journalisé.

### Confirmation de compte par email (vérification)
- À l'inscription, envoi d'un **email contenant un lien de validation unique et expirable** (`/verifier-email?token=...`). Le clic sur le lien marque l'email comme vérifié (`users.email_verifie = 1`, table `email_verifications`).
- Le compte reste utilisable mais son email est « non vérifié » tant que le lien n'est pas ouvert ; relance possible depuis l'espace compte (« renvoyer l'email de confirmation »). Un email non vérifié **ne reçoit pas** la liste de diffusion CS. (Modifie « pas de vérification d'email en v1 » de `02-roles-et-comptes.md`.)

### Liste de diffusion du conseil syndical
- Alias **`conseil-syndical@copro-pinede-gardanne.fr`** géré **côté serveur mail** (alias virtuel à plusieurs destinataires), redirigeant vers les adresses email personnelles **vérifiées** des comptes ayant le statut conseil syndical.
- **Aucune boîte mail sur le domaine** : le seul alias est `conseil-syndical@` ; tout autre destinataire du domaine (y compris `noreply@`) est rejeté — les réponses à `noreply@` tombent donc dans le vide (bounce), comme souhaité.
- **Test d'envoi validé** (14/11/2026) : mail `noreply@` → `conseil-syndical@` → redirect vers Gmail avec `dkim=pass`, `spf=pass`, `dmarc=pass` (250 OK). Classé « spam » par Gmail à cause de la réputation du domaine neuf uniquement — à désamorcer via « Non spam ».
- **Limitation connue (14/11/2026)** : un mail externe (ex. Gmail d'un résident) envoyé à `conseil-syndical@` est bien reçu et renvoyé (`250 OK`, signé ARC/DKIM), mais Gmail peut le jeter silencieusement côté destinataire (forward depuis un domaine neuf, faible réputation) — la copie n'apparaît ni en réception ni en spam. Les mails émis par l'application (`noreply@`) ne sont pas concernés (DMARC aligné). SRS volontairement non retenu (masquerait l'expéditeur original) ; ARC activé côté rspamd (`sign_local = true`).
- La liste des destinataires de `conseil-syndical@` **évolue automatiquement** et est **strictement égale** aux emails vérifiés des comptes actifs estampillés membres du CS : l'application resynchronise l'alias via l'API Mailcow à chaque changement (ajout/retrait du statut CS, vérification d'un email, suppression de compte). Détails d'implémentation vérifiés : `MAILCOW_API_URL=https://172.18.0.1:8443` (passerelle Docker, car le hairpin NAT vers le nom de domaine échoue), certificat auto-signé accepté (80/443 pris par Caddy, pas de Let's Encrypt) avec `skip_ip_check=1` sur la clé API, et **suppression + recréation** de l'alias (`delete/alias` puis `add/alias` avec `goto` en chaîne virgulée) car `edit/alias` répondait succès sans appliquer le `goto` dans cette version. Si la liste est vide, l'alias pointe vers `liste-vide@copro-pinede-gardanne.fr` (bidon, jamais délivré) car l'API refuse un `goto` vide. Testé et validé en production (14/11/2026).

## Sécurité et délivrabilité

- TLS (Let's Encrypt) sur le serveur mail, ports 25/465/587 ; **pas de relais ouvert** (envoi réservé au réseau local de l'hôte).
- SPF + DKIM + DMARC obligatoires (voir tableau DNS) pour éviter les spams.
- Sauvegardes des données mail incluses dans la stratégie de sauvegarde du serveur.
