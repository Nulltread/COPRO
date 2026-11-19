# Fiche ticket et ergonomie de l'interface

Ces règles d'interface s'appliquent à **tous les rôles** (résident, conseil syndical, admin).

## Organisation de la fiche ticket (par sections, dans l'ordre)

1. **Description** : champ description (édition à la volée ou lecture seule), **unités concernées** et **photos** de la section (photos de création) regroupées dans cette même section ;
2. **Consultation** : affichée si le ticket est à l'état « consultation » **ou l'a déjà été** (états ultérieurs, archivé compris) — voir `consultations-entreprises-factures.md` ;
3. **Bilan de l'intervention** : affichée si le ticket est à l'état « travaux planifiés » **ou l'a déjà été**, visibilité restreinte aux personnes concernées — voir `bilans-de-intervention.md` ;
4. **Factures** : affichée à l'état « travaux acceptés », ou en « archivé » si le ticket a déjà connu cet état — voir `consultations-entreprises-factures.md`.

**Règle « en cours ou déjà été »** : une section est visible si l'état correspondant est en cours **ou a déjà été atteint** (historique du fil de suivi), y compris en « archivé » (alors en lecture seule). Une section d'un état jamais atteint n'est pas affichée (ex. : un ticket archivé directement depuis « créé » n'affiche ni consultation, ni bilan, ni factures).

Autres blocs de la fiche : boutons **« Archiver »** et **« Supprimer »** directement **sous le titre** (à côté du badge URGENT) — grisés avec explication au survol quand l'action est inaccessible, **modale de confirmation** quand ils sont actifs ; section de transition (une seule à la fois, voir `cycle-de-vie-des-tickets.md`) ; fil de suivi en bas.

## Édition de la description et des unités

- **Description** : champ pré-rempli, **sauvegarde à la volée** (autosave ~600 ms après la saisie, indicateur « ✓ enregistré », aucun rechargement de page) — plus de bouton « Enregistrer » ni de titre « Modifier le ticket ». La description n'est affichée en lecture seule (texte brut sous le chronogramme) que quand le ticket n'est plus éditable (archivé).
- **Libellés** : pas de titre « Description » au niveau du champ (seul le titre de section reste, le champ garde un `aria-label="Description"`) ; pas de titre « Unités concernées » (le placeholder du multiselect suffit).
- **Unités concernées** : composant **multiselect « search »** (champ texte ; à la saisie, une dropdown affiche les **5 premiers résultats** et s'affine ; au clic sur une valeur, une **puce** s'affiche à gauche du texte ; multiselect, chaque puce retirable). **Persistance immédiate** à chaque ajout/retrait (envoi en arrière-plan, indicateur « ✓ enregistré », resynchronisation depuis le serveur si l'envoi est refusé, ex. plus aucune de vos unités sélectionnée). La phrase d'aide « un clic sélectionne et enregistre » n'est pas affichée.
- Quand l'utilisateur n'a **pas le droit de modifier les unités** (occupant une fois le ticket passé en consultation, ou ticket archivé), il voit une **simple liste** des unités, sans composant.

## Photos

- Les photos sont **attachées à la section où elles sont saisies** et affichées dans cette section : création du ticket (section Description), acceptation des travaux, refus/réouverture, bilan de l'intervention. Il n'y a **plus de section « Photos » globale**.
- **Moments cadrés d'ajout** (nulle part ailleurs) :
  1. états **« créé » et « en consultation »** — jusqu'au début des travaux, c'est-à-dire jusqu'au passage en « travaux planifiés » : toute **personne concernée** (occupant d'une unité du ticket, membre du CS, admin) peut **ajouter et supprimer** les photos de la section Description (**non obligatoires**) ; à partir de « travaux planifiés », ces photos sont **figées** ;
  2. **acceptation des travaux** (planifiés → acceptés) : photos facultatives ;
  3. **refus** (planifiés → consultation) : commentaire ou au moins une photo obligatoire ;
  4. **réouverture** (acceptés → consultation) : commentaire obligatoire et au moins une photo obligatoire ;
  5. **bilan de l'intervention** : photos jointes possibles.
- **Compression obligatoire côté client** avant envoi : redimensionnement (max **1600 px**) + recompression (qualité ~0,8), conversion en JPEG (sauf PNG de moins de 500 Ko conservé tel quel), aperçu des photos avant envoi.
- **Affichage** (partout où on ajoute des photos) : **mosaïque de tuiles carrées** ; le clic sur une photo l'ouvre en grand (nouvel onglet) ; **poubelle en overlay sur la tuile** quand la suppression est possible (avec modale de confirmation), sinon pas de bouton ; la **tuile d'ajout est plus petite et carrée** ; l'enregistrement se fait **dès la sélection du fichier** (auto-submit, plus de bouton « Ajouter » — le champ `file` standard propose galerie et appareil photo en mobile) ; pendant l'envoi, **overlay gris avec spinner** (serpent tournant CSS) — idem pour les formulaires non autosave.
- **Comportement de la mosaïque** (partout où l'on ajoute des photos ou des fichiers, y compris les devis) : lors de l'ajout, **chaque miniature vient s'ajouter au début de la ligne et le carré « + » se déplace à droite** jusqu'à ce que la ligne soit remplie ; les carrés sont **dimensionnés pour être répartis équitablement sur toute la largeur**, quel que soit l'écran (grille `auto-fit`, min 84 px, carrés `aspect-ratio 1/1`).
- **Zone d'ajout de photos** (formulaire de création et formulaires d'ajout sur la fiche) : zone **encadrée** (bord arrondi, fond gris, bordure en pointillés) avec un **« + »** et un **logo photo**, située juste sous la description — comme sur les sites d'annonces ; le champ fichier lui-même est masqué ; le texte « compressées automatiquement avant l'envoi » est en petit sous le texte d'invitation (formulaire de création uniquement — sur la fiche, section Description, la zone ne montre **que le « + » et le logo photo**, accompagnés de cette même note de compression en petit, sans texte d'invitation) ; une fois les photos ajoutées, une **miniature par photo**, chacune avec une petite **poubelle** pour la retirer de la sélection avant envoi.

## Formulaire de création d'un ticket

Ordre des champs, de haut en bas :

1. **Titre court** (max 120 caractères) ;
2. **Urgence** (toggle « C'est urgent » 🚨) directement sous le titre ;
3. **Description** ;
4. **Zone d'ajout de photos** ;
5. **Sélection des villas / garages** (multiselect « search », en dernier, unités personnelles présélectionnées) ;
6. Bouton **« Déclarer le ticket »**.

## Barre de navigation

- Bouton de création de ticket : **bouton encadré à bords arrondis, flat** (bordure, pas de fond plein), avec le texte visible **« + Nouveau ticket »**.
- Lien **« Entreprises »** visible uniquement pour le gestionnaire (CS/admin) — voir `consultations-entreprises-factures.md`.
- **Plus de lien « Rattachements »** dans la barre de navigation (voir `rattachements.md`).

## Cartes de la liste des tickets (et tableau de bord)

- Chaque carte affiche un **mini flowchart** : petits cercles reliés par des lignes (comme la timeline de la fiche), étapes passées en gris, **étape en cours en couleur** avec le **nom du statut en pastille colorée** ; les **unités concernées en bas à droite** de la carte.

## Principes généraux d'interface

- Responsive / **mobile-first**, utilisable sur téléphone.
- Interface en **français**, vocabulaire courant, aucune notion technique exposée.
- **Moins de texte explicatif** dans les pages : on ne ré-explique pas le fonctionnement des boutons (ex. : le paragraphe d'explication des boutons Accepter/Refuser est supprimé).
- Tout **champ obligatoire** est marqué d'une petite **étoile rouge `*`** juste après le titre du champ, dans **toute l'application** (classe `.req`, posée par `app.js` sur chaque `label` contenant un contrôle `required`, y compris les champs de montant créés à la volée) ; le texte « (obligatoire) » n'est plus écrit dans les libellés.
- Boutons **« Accepter » / « Refuser » côte à côte** (flex row), retour à la ligne en mobile si le responsive l'exige (`flex-wrap`).
