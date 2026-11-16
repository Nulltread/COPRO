# Serveur mail et domaine `copro-pinede-gardanne.fr`

## Objectifs

1. **Notifications par email** de l'avancée des tickets (en complément des notifications in-app, qui restent le canal principal — voir `notifications.md`).
2. **Confirmation de compte par email** à l'inscription (vérification de l'adresse email — voir `comptes-et-roles.md`).
3. **Liste de diffusion du conseil syndical** : une adresse unique (`conseil-syndical@copro-pinede-gardanne.fr`) qui redirige vers les adresses email personnelles **vérifiées** des membres du CS.

**Hors périmètre v1** (noté pour plus tard, non traité) : envois automatiques depuis le serveur pour des sujets futurs (convocations aux AG, appels de fonds, etc.).

## Domaine

- Nom de domaine dédié : **`copro-pinede-gardanne.fr`**, acheté chez un registrar (ex. Scaleway Domains, OVH, Gandi).
- Le site web de l'application reste sur son domaine existant ; le sous-domaine **`mail.copro-pinede-gardanne.fr`** pointe vers l'IP du serveur hébergeant le serveur mail.

## Serveur mail

- **Auto-hébergé sur le serveur existant** (Dedibox Scaleway, même serveur que l'application), déployé en **conteneur Docker dédié (Mailcow dockerisé)**, séparé du conteneur de l'application.
- Ports web de Mailcow déplacés en **8080/8443** (80/443 sont pris par Caddy) : l'interface d'admin est sur `https://mail.copro-pinede-gardanne.fr:8443/admin` (l'URL racine `/` est l'interface utilisateur, qui n'accepte pas le compte `admin`).
- Le réseau interne Docker de Mailcow utilise une plage dédiée (ex. `172.30.1.0/24`) pour éviter le chevauchement avec le réseau de l'application.
- **Mode « redirect seul »** : **aucune boîte mail créée sur le domaine**, le webmail SOGo est **désactivé** — aucune interface mail utilisateur. Le serveur ne fait que recevoir les mails des adresses déclarées (alias) et les rediriger, et envoyer les mails de l'application.
- **Envoi des emails de l'application** via le serveur mail local en SMTP **sans authentification** (même hôte : soumission via `127.0.0.1` / réseau Docker local) : aucune dépendance à un service payant. Adresse d'expédition fixe : **`noreply@copro-pinede-gardanne.fr`** (envoi uniquement ; toute réponse tombe dans le vide, comme souhaité). Configuration par variables d'environnement : `SMTP_HOST` (défaut `127.0.0.1`), `SMTP_PORT` (défaut `25`), `MAIL_FROM`, `BASE_URL` (pour les liens dans les emails), `MAIL_ENABLED=false` pour désactiver l'envoi ; `MAILCOW_API_URL`, `MAILCOW_API_KEY`, `MAIL_DOMAIN` pour la synchronisation de l'alias CS.

## Enregistrements DNS du domaine

| Type | Nom | Valeur |
|---|---|---|
| A | `mail` | IP publique du serveur Dedibox |
| MX | `@` | `mail.copro-pinede-gardanne.fr` (priorité 10) |
| TXT (SPF) | `@` | `v=spf1 mx -all` |
| TXT (DKIM) | `dkim._domainkey` | clé publique générée par le serveur mail |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:admin@copro-pinede-gardanne.fr` |

- Le **PTR IPv4** est réglé sur `mail.copro-pinede-gardanne.fr.` (avec le point final, exigé par la console) — Gmail rejette sinon. Un enregistrement **AAAA** `mail` vers l'IPv6 du serveur est ajouté pour la cohérence DNS. Le **port 25 sortant n'est pas bloqué** sur cette Dedibox (envoi direct OK).

## Fonctionnalités applicatives

### Notifications par email des tickets

- **Option utilisateur, désactivée par défaut** (« recevoir aussi les notifications par email », voir `profil-compte-utilisateur.md`). Seuls les destinataires ayant activé l'option **et** un email vérifié reçoivent le mail.
- Les **mêmes événements** que le canal in-app (transitions de tickets, rattachements, alertes — voir `notifications.md`) déclenchent un **email**, auteur de l'événement exclu, avec un **lien direct** vers la page concernée et la mention « URGENT » conservée pour les tickets urgents. Envoi en arrière-plan ; un échec d'envoi ne bloque pas l'action et est journalisé.

### Confirmation de compte par email (vérification)

- À l'inscription, envoi d'un **email contenant un lien de validation unique et expirable** (`/verifier-email?token=...`). Le clic sur le lien marque l'email comme vérifié. Le compte **reste utilisable** tant que l'email n'est pas vérifié, mais il ne reçoit pas les notifications par email et ne figure pas dans la liste de diffusion du CS ; relance possible depuis l'espace compte (« renvoyer l'email de confirmation »).

### Liste de diffusion du conseil syndical

- Alias **`conseil-syndical@copro-pinede-gardanne.fr`** géré **côté serveur mail** (alias virtuel à plusieurs destinataires), redirigeant vers les adresses email personnelles **vérifiées** des comptes actifs ayant le statut conseil syndical.
- **Aucune boîte mail sur le domaine** : le seul alias est `conseil-syndical@` ; tout autre destinataire du domaine (y compris `noreply@`) est rejeté.
- La liste des destinataires **évolue automatiquement** et est **strictement égale** aux emails vérifiés des comptes actifs membres du CS : l'application resynchronise l'alias via l'API Mailcow à chaque changement (ajout/retrait du statut CS, vérification d'un email, suppression de compte) — par suppression + recréation de l'alias (`goto` en chaîne). Si la liste est vide, l'alias pointe vers une adresse bidon jamais délivrée (l'API refuse un `goto` vide).

## Sécurité et délivrabilité

- **TLS (Let's Encrypt)** sur le serveur mail, ports 25/465/587 ; **pas de relais ouvert** (envoi réservé au réseau local de l'hôte).
- **SPF + DKIM + DMARC obligatoires** (voir tableau DNS) pour éviter les spams.
- Sauvegardes des données mail incluses dans la stratégie de sauvegarde du serveur.
