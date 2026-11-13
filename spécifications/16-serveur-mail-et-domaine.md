# Serveur mail et domaine `copro-pinede-gardanne.fr`

Ce fichier réintroduit le **canal email** (retiré en v1 dans `08-notifications.md` et `02-roles-et-comptes.md`) et définit l'infrastructure mail du projet. En cas de contradiction, ce fichier (préfixe 16) prime sur les fichiers précédents.

## Objectifs

1. **Notifications par email** de l'avancée des tickets (en complément des notifications in-app, qui restent le canal principal).
2. **Confirmation de compte par email** à l'inscription.
3. **Liste de diffusion du conseil syndical** : une adresse unique (ex. `conseil@copro-pinede-gardanne.fr`) qui redirige vers les adresses email des comptes des membres du CS.

## Domaine

- Nom de domaine dédié : **`copro-pinede-gardanne.fr`**, acheté chez un registrar (ex. Scaleway Domains, OVH, Gandi).
- Le site web de l'application reste sur son domaine existant ; le sous-domaine **`mail.copro-pinede-gardanne.fr`** pointe vers l'IP de l'instance Scaleway hébergeant le serveur mail.

## Serveur mail

- **Auto-hébergé sur le serveur Scaleway existant** (Dedibox Start-2-S-SSD, Ubuntu 20.04, IP publique `51.159.64.71`), même serveur que l'application, déployé en conteneur Docker dédié, séparé du conteneur de l'application. Solution retenue : **Mailcow dockerisé** (interface d'administration web, génération automatique des clés DKIM), ou alternative plus légère (Postfix + alias virtuels) si la RAM du serveur est insuffisante (prévoir ~1 Go de RAM dédiés).
- **Envoi des emails de l'application** via le serveur mail local en SMTP (relais interne authentifié) : aucune dépendance à un service payant, cohérent avec la contrainte de coût minimal de `10-stockage-et-contraintes-techniques.md`. Configuration par variables d'environnement (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`).
- **Contraintes Scaleway Dedibox** : le port 25 sortant est bloqué par défaut et il n'y a pas de bouton de déblocage dans la console → **ouvrir un ticket au support Scaleway** demandant le déblocage du port 25 sortant pour l'IP `51.159.64.71` (usage légitime, avec SPF/DKIM/DMARC). Le **PTR/rDNS** se règle dans la console Dedibox : Adresses IP publiques → « Modifier » à côté de « Reverse » → remplacer `51-159-64-71.rev.poneytelecom.eu` par `mail.copro-pinede-gardanne.fr` (obligatoire pour la délivrabilité).

## Enregistrements DNS du domaine

| Type | Nom | Valeur |
|---|---|---|
| A | `mail` | IP publique de l'instance Scaleway |
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
- Alias **`conseil@copro-pinede-gardanne.fr`** géré **côté serveur mail** (alias virtuel à plusieurs destinataires), redirigeant vers les adresses email des comptes ayant le statut conseil syndical.
- La liste des destinataires est maintenue manuellement dans l'interface d'admin du serveur mail (petit effectif, pas de gestion dans l'application en v1).
- Boîtes aux lettres individuelles : chaque membre du CS peut recevoir sur son adresse personnelle habituelle ; seules les adresses du domaine (ex. `conseil@`, `admin@`) passent par le serveur mail.

## Sécurité et délivrabilité

- TLS (Let's Encrypt) sur le serveur mail, ports 25/465/587/993/995, authentification SMTP requise pour l'envoi (jamais de relais ouvert).
- SPF + DKIM + DMARC obligatoires (voir tableau DNS) pour éviter les spams.
- Mots de passe des boîtes mail hachés/stockés par le serveur mail ; sauvegardes des données mail incluses dans la stratégie de sauvegarde du serveur.
