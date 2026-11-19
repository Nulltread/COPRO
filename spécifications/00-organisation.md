# Organisation des spécifications

Ce dossier est l'emplacement canonique des spécifications du projet. À chaque nouvelle session, relire ce fichier d'index en premier, puis **l'ensemble des fichiers du dossier**.

## Principes

- Les spécifications sont **regroupées par thématique fonctionnelle**, pas par chronologie : chaque fichier est autosuffisant sur son sujet.
- Les spécifications sont **stateless** : il n'y a plus de règle de priorité entre fichiers (plus de « le préfixe le plus élevé fait foi »). Aucun doublon ni contradiction ne doit subsister entre fichiers. En cas de contradiction résiduelle constatée entre deux fichiers, c'est un défaut à corriger dans le fichier concerné et à signaler — aucun fichier ne prime automatiquement sur un autre.
- Toute **nouvelle spécification** (décision du demandeur) est consignée dans un **nouveau fichier .md** dédié, ou modifie le fichier thématique concerné si elle porte sur un point déjà spécifié dans ce fichier.

## Sources historiques (sans valeur normative)

- `PROMPT.md` : brief initial, réorganisé dans ce dossier.
- `SPEC.md` (branche `vibe/prompt-roles-cycle-2e0696`) : décisions validées à l'origine. Leur contenu est intégré — et pour plusieurs points révisé depuis — dans les fichiers thématiques ci-dessous, qui font **seuls foi**.

## Découpage thématique

| Fichier | Contenu |
|---|---|
| `vision-et-principes.md` | Contexte, objectifs, principes généraux, livrables attendus |
| `comptes-et-roles.md` | Rôles, auto-inscription, vérification d'email, gestion du statut CS, page de gestion des comptes, suppression de compte |
| `unites.md` | Villas, garages, parties communes |
| `rattachements.md` | Rattachement d'un compte à une unité, péremption, page des rattachements, cas du compte sans unité |
| `visibilite.md` | Règles générales de visibilité des données |
| `cycle-de-vie-des-tickets.md` | États, transitions contraintes et droits, archivage, réouverture/refus, édition, urgence, fil de suivi |
| `fiche-ticket-et-ergonomie.md` | Organisation des sections de la fiche ticket, formulaire de création, photos, composants d'interface |
| `consultations-entreprises-factures.md` | Consultations et devis, référentiel des entreprises, factures, avenants |
| `sollicitations-relances.md` | Sollicitations/relances par email des prestataires, espace prestataire à lien 7 jours, dépôt de devis et dates proposées, notifications des échanges |
| `bilans-de-intervention.md` | Bilan par personne concernée, boutons Accepter/Refuser, cycles et figeage |
| `liste-tickets-recherche-tableau-de-bord.md` | Liste des tickets, recherche, filtres, tri, tableau de bord |
| `notifications.md` | Canaux, événements notifiés, destinataires, affichage |
| `profil-compte-utilisateur.md` | Page Mon profil, export RGPD, raccourci écran d'accueil (PWA minimale) |
| `administration.md` | Panneau d'administration (délais de péremption et d'archivage automatique) |
| `mail-et-domaine.md` | Serveur mail auto-hébergé, domaine `copro-pinede-gardanne.fr`, liste de diffusion du CS, envoi des emails |
| `stockage-securite-deploiement.md` | Stockage des fichiers, stack, sécurité, RGPD, sauvegarde, déploiement |
| `socle-reglementaire.md` | Socle réglementaire minimal (nécessaire et suffisant) : les 7 blocs, hors-app, v2+ |
| `ag-et-pv.md` | Assemblées générales : convocation, ODJ, feuille de présence, votes, PV, registre des délibérations |
| `tantiemes.md` | Page dédiée des tantièmes par unité (référentiel pur, non liée à la facturation) |
