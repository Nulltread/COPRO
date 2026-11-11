# Prompt — Application de suivi de travaux et sinistres pour copropriété de pavillons

## Contexte

Tu dois développer une application web de suivi de travaux et sinistres pour une copropriété de 61 pavillons (villas) et 61 garages. Les utilisateurs sont des personnes non techniques : l'interface doit être SIMPLISSIME, mobile-first, et chaque action doit être atteignable en un minimum de clics. L'objectif est un outil simple, accessible et bon marché à héberger.

## Rôles et comptes

- **Résident** (copropriétaire ou locataire) : crée des tickets, suit leur avancement, modifie la description et ajoute des photos. **Compte requis pour déclarer un ticket.** Auto-inscription : **identifiant = adresse email**, nom et prénom obligatoires, numéro de téléphone. Pas de vérification d'email en v1. Chacun peut changer son mot de passe dans son espace compte.
- **Membre du conseil syndical** : ce n'est pas un compte à part, c'est un **statut supplémentaire** qui vient s'ajouter à un compte résident. Les membres du conseil syndical peuvent s'attribuer ou se retirer ce statut entre eux (gestion collégiale, eux-mêmes ou les autres). **Seul le conseil syndical peut tout faire sur un ticket** dans son cycle de vie.
- **Administrateur** : **un et un seul compte admin**, à part, qui peut tout faire dans l'application.

### Unités : villas, garages, parties communes

- L'unité d'œuvre est la **villa, le garage ou les parties communes** (61 villas et 61 garages, numérotés simplement de **1 à 61** ; les parties communes forment une unité à part, rattachée **par défaut uniquement au conseil syndical**).
- **Référentiel en dur pour l'instant** (liste des unités non administrable en v1).
- Un **ticket est rattaché à une ou plusieurs unités** (les pavillons sont imbriqués), jamais à une personne.
- Un résident peut être rattaché à **plusieurs villas/garages**.

### Rattachement d'un résident à une unité

- À la création du compte, le résident **réclame** son rattachement à une villa ou un garage. L'attribution est **acceptée uniquement par un autre résident de cette même villa/garage ou par un membre du conseil syndical** (notification dans l'app).
- Tant que le rattachement n'est pas accepté, le résident reste sans unité et **ne peut pas créer de ticket**.
- Un résident peut se retirer lui-même d'une unité, ou supprimer son compte : **aucun impact sur les tickets** (ils restent attachés à l'unité).

## Visibilité des données

- **Lecture ouverte à tous** : tout utilisateur connecté voit tous les tickets, même ceux des unités dont il n'est pas résident. Les filtres d'affichage sont par défaut positionnés sur les unités du résident, mais sans aucune restriction.
- **Devis et factures** : lisibles par tous, mais **ajout et modification réservés au conseil syndical**.
- **Compte-rendu d'intervention** : champ du ticket (voir cycle de vie), lisible par tous.

## Cycle de vie d'un ticket

États : **créé → validé par le conseil syndical → en consultation → intervention planifiée → travaux acceptés → archivé**.

- **Création** : un résident crée un ticket en choisissant librement les unités concernées — au moins une de ses propres villas/garages, mais il peut en ajouter d'autres. La liste des unités reste **modifiable après création** (ex. sinistre qui se propage). Les tickets sur les **parties communes sont créables uniquement par le conseil syndical**. Un résident sans unité validée ne peut pas créer de ticket.
- En v1, le **conseil syndical peut passer le ticket à n'importe quel statut, à tout moment** (tous droits sur le cycle de vie).
- **Résolution (travaux acceptés)** : acceptée par **tous les résidents concernés** (résidents des unités du ticket) ; **un membre du conseil syndical peut accepter seul**. L'acceptation de la résolution fait passer le ticket à **archivé** (archivage sans limite de durée, les tickets archivés restent consultables).
- **Réouverture** : possible pour le conseil syndical ou un résident ; le ticket revient au statut d'avant la consultation.
- **Édition** : le résident peut modifier la description et ajouter/supprimer des photos **à tout moment, même une fois archivé**. **Toute modification est loguée avec son auteur**, et ce log est visible par tous.
- **Suppression** : seul le créateur peut supprimer son ticket, et uniquement s'il n'a **jamais évolué** dans son cycle de vie. Le conseil syndical ou l'admin peut supprimer un ticket non évolué créé par un compte qui s'est retiré ou a été supprimé. Le conseil syndical peut **archiver n'importe quel ticket**.

Chaque changement d'étape est horodaté et visible dans un fil de suivi lisible par tous (historique simple, type fil de discussion avec événements).

## Fonctionnalités détaillées

- **Déclaration de ticket** : formulaire minimal (titre, description, catégorie, unités concernées, photos, indicateur « urgent » qui notifie le conseil syndical en priorité). Accessible au résident connecté en quelques clics. Plusieurs villas/garages peuvent être rattachés à un même ticket.
- **Photos à chaque étape** : n'importe quel acteur peut ajouter des photos à n'importe quelle étape. **Compression obligatoire côté client** avant envoi (redimensionnement + compression JPEG/WebP, qualité cible ~80 %, dimension max raisonnable, ex. 1600 px) pour limiter le stockage et la bande passante.
- **Devis et factures** : fichiers (PDF/images) stockés sur le ticket, catégorisés (devis / avenant / facture), avec montant associé. **Ajoutés et gérés uniquement par le conseil syndical**, lisibles par tous. Le ticket porte un **coût** : total des devis et avenants retenus, total facturé, écart éventuel.
- **Compte-rendu d'intervention** : ce n'est pas un document, c'est un **champ du ticket rédigé dans l'app** : une instance de compte-rendu par unité concernée, plus une instance pour le conseil syndical. Rempli par tout résident concerné.
- **Mise en concurrence** : vue comparaison des devis (montant, entreprise, délai, avis/commentaires), décision explicite enregistrée.
- **Suivi simplifié** : vue « métro » du cycle de vie (étapes visibles en une ligne), fil d'actualité du ticket, aucune notion technique exposée à l'utilisateur.
- **Notifications** : à chaque événement du ticket (création, changement d'étape, nouveau devis, décision, acceptation de la résolution, réclamation de rattachement), notifier dans l'app le **conseil syndical** et les **résidents concernés** (rattachés aux unités du ticket). **Canal unique pour l'instant : notification in-app** (pas de SMTP, aucun canal externe). Un ticket marqué **urgent** notifie le conseil syndical en priorité.
- **Multi-occupants** : une unité peut avoir un propriétaire et un locataire rattachés ; les deux sont notifiés et peuvent agir (commenter, ajouter des photos).
- **Recherche et filtres** : par unité (villa/garage), par état, par catégorie, par coût — par défaut filtré sur les unités dont on est résident, sans restriction.
- **Tableau de bord léger** pour le conseil syndical et l'admin : tickets ouverts, en attente de décision, coûts cumulés.

## Stockage des fichiers (photos, devis, factures)

- **Volumes attendus** : ~122 unités, tickets réguliers sur plusieurs années ; chaque ticket peut cumuler photos, devis, factures et décisions. Prévoir quelques dizaines de Go à terme — la compression des images limite fortement la croissance.
- **Stockage des fichiers — priorité au gratuit ou très bon marché** : privilégier par ordre de préférence : (1) le disque du VPS d'hébergement lui-même (coût nul, répertoire hors racine web avec sauvegarde) ; (2) un stockage objet S3-compatible à tarif très bas, de préférence avec **tarif d'égress gratuit** — ex. Cloudflare R2 (10 Go gratuits, pas de frais de sortie) ou Scaleway/OVH Object Storage ; (3) MinIO auto-hébergé sur le même serveur (gratuit). Éviter les stockages à frais de sortie élevés (ex. AWS S3). Les métadonnées (nom, type, taille, ticket, étape, auteur, montant pour devis/factures) sont en base de données.
- **Accès sécurisé** : fichiers servis uniquement via l'application après authentification (pas d'URL publiques directes) ; tous les fichiers, y compris les factures, sont lisibles par tout utilisateur connecté (lecture ouverte).
- **Sauvegarde** : les fichiers sont inclus dans la stratégie de sauvegarde (sauvegarde automatique du répertoire de stockage avec la base de données, rétention suffisante).
- **Limites** : taille max par fichier (ex. 10 Mo pour PDF, images compressées avant envoi), types MIME autorisés (JPEG, PNG, WebP, PDF).

## Contraintes techniques

- **Coût d'hébergement minimal et simplicité** : privilégier une stack légère (par exemple une application web monolithique, base de données PostgreSQL ou SQLite, stockage de fichiers local ou object storage S3-compatible, conteneur unique déployable sur un petit VPS ou une PaaS gratuite/bas coût). Pas de dépendance à des services payants.
- Responsive / mobile-first, utilisable sur téléphone.
- Interface en **français**, vocabulaire courant, aucune notion technique exposée.
- Sécurité de base : authentification (sessions ou JWT), rôles, mots de passe hachés.
- Compression des images côté client avant upload.
- Données supprimables/exportables (conformité RGPD simple : export et suppression d'un compte).

## Livrables attendus

1. Application fonctionnelle couvrant tous les cas ci-dessus.
2. Schéma de données (unités, comptes, tickets, transitions, fichiers, notifications).
3. Jeu de données de démonstration : 61 villas, 61 garages, quelques comptes de chaque rôle, tickets à différents stades.
4. Instructions de déploiement simples (un fichier README pas à pas).
