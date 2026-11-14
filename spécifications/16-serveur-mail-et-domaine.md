# Serveur mail et domaine `copro-pinede-gardanne.fr`

Ce fichier réintroduit le **canal email** (retiré en v1 dans `08-notifications.md` et `02-roles-et-comptes.md`) et définit l'infrastructure mail du projet. En cas de contradiction, ce fichier (préfixe 16) prime sur les fichiers précédents.

## Objectifs

1. **Notifications par email** de l'avancée des tickets (en complément des notifications in-app, qui restent le canal principal).
2. **Confirmation de compte par email** à l'inscription (vérification de l'adresse email des utilisateurs).
3. **Liste de diffusion du conseil syndical** : une adresse unique (`conseil_syndical@copro-pinede-gardanne.fr`) qui redirige vers les adresses email personnelles (vérifiées) des membres du CS.

**Hors périmètre v1 (noté pour plus tard, non traité)** : envois automatiques depuis le serveur pour des sujets futurs (convocations aux AG, appels de fonds, etc.).

## Domaine

- Nom de domaine dédié : **`copro-pinede-gardanne.fr`**, acheté chez un registrar (ex. Scaleway Domains, OVH, Gandi).
- Le site web de l'application reste sur son domaine existant ; le sous-domaine **`mail.copro-pinede-gardanne.fr`** pointe vers l'IP de l'instance Scaleway hébergeant le serveur mail.

## Serveur mail

- **Auto-hébergé sur le serveur Scaleway existant** (Dedibox Start-2-S-SSD, Ubuntu 20.04, IP publique `51.159.64.71`), même serveur que l'application, déployé en conteneur Docker dédié (**Mailcow dockerisé**, installé dans `/opt/mailcow-dockerized` par l'utilisateur `copro`), séparé du conteneur de l'application. Ports web de Mailcow déplacés en **8080/8443** (`HTTP_PORT`/`HTTPS_PORT` dans `mailcow.conf`) car 80/443 sont pris par Caddy : l'interface d'admin est donc sur **https://mail.copro-pinede-gardanne.fr:8443/admin** (l'URL racine `/` est l'interface *utilisateur*, qui n'accepte pas le compte `admin`). Mot de passe admin : défini en base avec le préfixe `{BLF-CRYPT}` + hash bcrypt (un hash bcrypt nu, sans préfixe `{...}`, est rejeté par `verify_hash`). Le réseau interne Docker de Mailcow utilise la plage `172.30.1.0/24` (`IPV4_NETWORK=172.30.1`) pour éviter le chevauchement avec le réseau de l'application.
- **Mode « redirect seul »** : **aucune boîte mail créée sur le domaine**, le webmail SOGo est **désactivé** (`SKIP_SOGO=y` dans `mailcow.conf`) — aucune interface mail utilisateur. Le serveur ne fait que recevoir les mails des adresses déclarées (alias) et les rediriger, et envoyer les mails de l'application.
- **Envoi des emails de l'application** via le serveur mail local en SMTP **sans authentification** (l'application tourne sur le même hôte : soumission via `127.0.0.1`/réseau Docker local, `permit_mynetworks`) : aucune dépendance à un service payant. Adresse d'expédition fixe : **`noreply@copro-pinede-gardanne.fr`** (adresse d'envoi uniquement ; aucune réception — voir ci-dessous). Configuration par variables d'environnement (`SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`).
- **Contraintes Scaleway Dedibox** : le **PTR/rDNS** (`mail.copro-pinede-gardanne.fr` à la place de `51-159-64-71.rev.poneytelecom.eu`, modifiable via « Modifier » à côté de « Reverse » dans la console) est **recommandé mais reporté** : sans lui, certains destinataires (Gmail notamment) classent les emails en spam. Il reste réversible et sera fait si des problèmes de délivrabilité apparaissent. Le port 25 sortant, bloqué par défaut sur Dedibox sans bouton de déblocage dans la console, sera testé à l'envoi réel : s'il est bloquant, **ouvrir un ticket au support Scaleway** demandant le déblocage du port 25 pour l'IP `51.159.64.71`.

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
- En complément du canal in-app (`08-notifications.md`) : les mêmes événements (création, changement d'état, nouveau document, décision, commentaire, acceptation de la résolution, réclamations/validations de rattachement) déclenchent un **email aux mêmes destinataires**, auteur de l'événement exclu.
- Mention « URGENT » conservée dans l'objet pour les tickets urgents.
- Les emails sont envoyés en arrière-plan (file d'envoi) pour ne pas ralentir l'interface ; un échec d'envoi ne bloque pas l'action et est journalisé.

### Confirmation de compte par email
- À l'inscription, envoi d'un **email de confirmation** contenant un lien unique et expirable.
- Le compte reste utilisable mais son email est marqué « non confirmé » tant que le lien n'est pas ouvert ; relance possible depuis l'espace compte. (Modifie « pas de vérification d'email en v1 » de `02-roles-et-comptes.md`.)

### Liste de diffusion du conseil syndical
- Alias **`conseil_syndical@copro-pinede-gardanne.fr`** géré **côté serveur mail** (alias virtuel à plusieurs destinataires), redirigeant vers les adresses email personnelles **vérifiées** des comptes ayant le statut conseil syndical (en test : uniquement `sebastien.paletti@gmail.com`, les autres membres seront ajoutés ensuite).
- **Aucune boîte mail sur le domaine** : le seul alias est `conseil_syndical@` ; tout autre destinataire du domaine (y compris `noreply@`) est rejeté — les réponses à `noreply@` tombent donc dans le vide (bounce), comme souhaité.
- La liste des destinataires de `conseil_syndical@` **évolue automatiquement** avec les comptes enregistrés comme membres du CS : l'application resynchronise l'alias via l'API Mailcow à chaque changement (ajout/retrait de membre CS, vérification d'un email) pour pointer vers les adresses personnelles **vérifiées** des membres courants. En attendant ce branchement, l'alias ne contient que l'adresse de test de l'administrateur.

## Sécurité et délivrabilité

- TLS (Let's Encrypt) sur le serveur mail, ports 25/465/587 ; **pas de relais ouvert** (envoi réservé au réseau local de l'hôte).
- SPF + DKIM + DMARC obligatoires (voir tableau DNS) pour éviter les spams.
- Sauvegardes des données mail incluses dans la stratégie de sauvegarde du serveur.
