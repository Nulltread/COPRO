# Documents de la copropriété (dépôt documentaire)

Nouvelle page **« Documents »** : un dépôt de fichiers de la copropriété, conforme au socle réglementaire (art. 18 loi 1965, décret n° 2019-502) — voir `socle-reglementaire.md` et `ag-et-pv.md` (les PV d'AG y sont archivés, catégorie « Instances et décisions »).

## Page et navigation

- Lien **« Documents »** dans la barre de navigation, visible par **tout utilisateur connecté**.
- Page soumise à la même règle que les tickets (`visibilite.md`) : **compte ayant au moins une unité validée, ou admin** ; un compte sans unité validée voit la page avec un avis et une liste vide.
- Un seul écran liste **les documents déposés** et **les devis/factures issus des tickets** (voir ci-dessous), triés par date décroissante.

## Dépôt (ajout de documents)

- **Réservé aux membres du CS et à l'admin** (gestionnaire). Bouton « + Ajouter des documents » visible uniquement pour eux.
- **Ajout multiple** : plusieurs fichiers par envoi (max 10), ils partagent la même catégorie, le même niveau d'accès et les mêmes tags.
- **Catégorisation obligatoire** à l'ajout (champ requis), parmi les **4 catégories thématiques** définies par la loi :
  - `juridique` — Documents juridiques et administratifs (RCP, EDD et actes modificatifs, contrat du syndic, polices d'assurance, fiche synthétique, liste des copropriétaires) ;
  - `instances` — Instances et décisions (AG) : convocations, feuilles de présence, PV des AG, devis et marchés annexes validés ;
  - `technique` — Documents techniques et d'entretien (carnet d'entretien, diagnostics obligatoires, DTG, PPT, contrats de maintenance) ;
  - `comptable` — Documents comptables et financiers (appels de fonds, décomptes de charges, relevés du fonds de travaux, balances, relevés bancaires, factures des prestataires).
- **Niveau d'accès obligatoire** à l'ajout (champ requis), parmi les **3 niveaux de la loi** :
  - `commun` — **tous les copropriétaires** : tout compte avec au moins une unité validée, plus l'admin ;
  - `controle` — **conseil syndical uniquement** : membres du CS + admin ;
  - `prive` — **espace privé individuel** : l'ajout exige une **unité destinataire** choisie ; visible uniquement par les **résidents de cette unité** + l'admin (un membre du CS non résident de l'unité ne la voit pas).
- **Formats acceptés** : PDF et scans/photos (JPEG, PNG, WebP) uniquement — refus explicite sinon.
- **Limite 2 Mo par fichier** : une **image dépassant 2 Mo est compressée automatiquement** pour repasser sous 2 Mo (compression côté client d'abord, puis garantie côté serveur) ; un **PDF dépassant 2 Mo est refusé** (non compressible). En cas d'erreur (upload refusé, catégorie invalide, droits insuffisants), les fichiers déjà déposés sont supprimés du disque.

## Devis et factures des tickets dans le dépôt

- Les **devis et factures ajoutés via les tickets** (table `fichiers`, catégories `devis`/`facture`) **figurent dans la liste** des Documents, en **lecture seule** : badge « Devis »/« Facture » + lien vers le ticket, montant affiché ; l'ouverture du fichier passe par la route sécurisée existante (`/fichiers/:id`). **Les photos des tickets n'y figurent pas.**
- Visibilité = celle du ticket (`visibilite.md`) : tout compte avec unité validée, plus l'admin.
- Ils ne sont **ni supprimables ni re-catégorisables** depuis cette page (gérés depuis le ticket).

## Tags personnalisés

- **Tags custom** sur les documents du dépôt : composant **multiselect « search »** (puces retirables) à **l'ajout** et sur la **fiche du document** ; **création d'un tag à la volée** en tapant son nom.
- **Modification des tags réservée à l'admin et au CS** ; les autres membres voient les tags en lecture seule.
- **Filtre par tags** (multiselect) sur la liste, appliqué dès la sélection.

## Recherche et filtres

- **Champ de recherche plaintext pleine largeur** au-dessus des filtres, portant sur le **titre** du document (nom du fichier), **à la volée côté client** (sans rechargement, comme la liste des tickets et la page Comptes).
- **Filtres appliqués dès la sélection** (GET, sans bouton « Filtrer ») : par **catégorie** (les 4 thématiques + « Devis (tickets) » + « Factures (tickets) ») et par **tags**.

## Fiche d'un document et suppression

- Fiche `/documents/:id` : titre (= nom du fichier d'origine), catégorie, niveau d'accès (+ unité destinataire si « privé »), taille, auteur, date, bouton « Ouvrir le document » (servi en ligne, `inline` + `nosniff`), tags (éditables si gestionnaire, sinon lecture seule).
- **Suppression** d'un document du dépôt : **CS/admin uniquement**, avec **modale de confirmation** ; supprime le fichier du disque, les métadonnées et ses tags.

## Stockage et sécurité

- Fichiers sur le **disque du serveur** (`uploads/`, nom de stockage aléatoire 16 octets hexadécimaux + extension), métadonnées en base (`documents`, `tags`, `document_tags`) — voir `stockage-securite-deploiement.md` ; inclus dans la sauvegarde existante.
- Fichiers servis **uniquement via l'application**, après authentification et vérification du niveau d'accès, en ligne (`inline`) avec l'en-tête `nosniff` — **pas d'URL publiques directes**.
- Non-voyance = 404 « Document introuvable » (on ne divulgue pas l'existence d'un document à qui n'y a pas droit).
