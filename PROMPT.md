# Prompt — Application de suivi de travaux et sinistres pour copropriété de pavillons

## Contexte

Tu dois développer une application web de suivi de travaux et sinistres pour une copropriété de 61 pavillons (villas) et 61 garages. Les utilisateurs sont des personnes non techniques : l'interface doit être SIMPLISSIME, mobile-first, et chaque action doit être atteignable en un minimum de clics. L'objectif est un outil simple, accessible et bon marché à héberger.

## Rôles et comptes

- **Résident** (copropriétaire ou locataire) : crée des tickets, suit leur avancement, commente, ajoute des photos. Compte à vérification obligatoire : seuls les copropriétaires/locataires référencés sur une villa peuvent créer un compte, validé par le syndic ou un membre du conseil syndical.
- **Syndic professionnel** : gère le cycle de vie des tickets, valide chaque étape, gère devis et factures.
- **Conseil syndical** : mêmes droits de validation et de gestion que le syndic.
- **Administrateur** : gère le référentiel des unités (villas/garages), les rattachements des comptes et les rôles.

L'unité d'œuvre est la **villa ou le garage** (61 villas, 61 garages). Un ticket est attribué à **une ou plusieurs unités**. Le référentiel des unités est administrable (création, modification, rattachement des résidents). Les unités sont numérotées simplement de **1 à 61** (villas 1 à 61, garages 1 à 61).

## Cycle de vie d'un ticket (simplifié)

États successifs, avec transition validée à chaque étape par le **syndic ou un membre du conseil syndical** :

1. **Déclaration** — un résident (ou le syndic) déclare l'incident : titre court, description simple, catégorie, unités concernées (une ou plusieurs), photos.
2. **Consultation** — recherche d'entreprises et collecte de devis. Mise en concurrence : plusieurs devis peuvent être attachés au ticket, avec comparaison côte à côte (montant, entreprise, délai). Les copropriétaires concernés peuvent commenter et donner un avis ; le conseil syndical aussi.
3. **Attribution** — décision formalisée : choix d'un devis, décision enregistrée et stockée sur le ticket (montant retenu, entreprise, justification). Les devis non retenus restent archivés sur le ticket.
4. **Planification des travaux** — date(s) d'intervention, entreprise, informations visibles par tous les concernés.
5. **Réception des travaux** — contrôle du résultat ; ajout de photos de fin de travaux. **Si les travaux ne sont pas satisfaisants, retour possible à l'étape Planification** (avec motif et photos).
6. **Fin du ticket (clôture)** — récapitulatif : coût total, facture(s) stockée(s), décision, historique.

Chaque changement d'étape est horodaté et visible dans un fil de suivi lisible par tous les concernés (historique simple, type fil de discussion avec événements).

## Fonctionnalités détaillées

- **Déclaration de ticket** : formulaire minimal (titre, description, catégorie, unités concernées, photos). Accessible au résident connecté en quelques clics. Possibilité de rattacher plusieurs villas/garages à un même ticket.
- **Photos à chaque étape** : n'importe quel acteur peut ajouter des photos à n'importe quelle étape. **Compression obligatoire côté client** avant envoi (redimensionnement + compression JPEG/WebP, qualité cible ~80 %, dimension max raisonnable, ex. 1600 px) pour limiter le stockage et la bande passante.
- **Devis, factures et décision** : stockage des fichiers (PDF/images) sur le ticket, catégorisés (devis / facture / décision / compte-rendu d'intervention), avec montant associé. Le ticket porte un **coût** : total des devis retenus, total facturé, écart éventuel.
- **Mise en concurrence** : vue comparaison des devis (montant, entreprise, délai, avis/commentaires), décision explicite enregistrée.
- **Suivi simplifié** : vue « métro » du cycle de vie (étapes visibles en une ligne), fil d'actualité du ticket, aucune notion technique exposée à l'utilisateur.
- **Notifications** : à chaque événement du ticket (création, changement d'étape, nouveau devis, décision, commentaire, refus en réception), notifier systématiquement : le **syndic**, le **conseil syndical**, et les **résidents concernés** (rattachés aux unités du ticket) **s'ils ont un compte**. Canaux : **email, notification in-app, et push** (chaque utilisateur choisit ses canaux dans son profil ; l'email est le canal de repli par défaut).
- **Recherche et filtres** : par unité (villa/garage), par état, par catégorie, par coût.
- **Tableau de bord léger** pour le syndic/conseil : tickets ouverts, en attente de décision, coûts cumulés.

## Contraintes techniques

- **Coût d'hébergement minimal et simplicité** : privilégier une stack légère (par exemple une application web monolithique, base de données PostgreSQL ou SQLite, stockage de fichiers local ou object storage S3-compatible, conteneur unique déployable sur un petit VPS ou une PaaS gratuite/bas coût). Pas de dépendance à des services payants.
- Responsive / mobile-first, utilisable sur téléphone.
- Interface en **français**, vocabulaire courant, aucune notion technique exposée.
- Sécurité de base : authentification (sessions ou JWT), rôles, vérification des comptes, mots de passe hachés.
- Compression des images côté client avant upload.
- Données supprimables/exportables (conformité RGPD simple : export et suppression d'un compte).

## Livrables attendus

1. Application fonctionnelle couvrant tous les cas ci-dessus.
2. Schéma de données (unités, comptes, tickets, transitions, fichiers, notifications).
3. Jeu de données de démonstration : 61 villas, 61 garages, quelques comptes de chaque rôle, tickets à différents stades.
4. Instructions de déploiement simples (un fichier README pas à pas).
