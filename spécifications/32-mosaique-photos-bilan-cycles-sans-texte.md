# Mosaïque de photos, chargement, bilan : cycles en sous-sections repliables, moins de texte explicatif

En cas de contradiction, ce fichier (préfixe 32) prime sur `23`, `26`, `28`, `29`, `30`, `31` et les fichiers antérieurs pour tous les points ci-dessous.

## Moins de texte explicatif dans la page

- Le paragraphe d'explication des boutons Accepter/Refuser (« Dès qu'une seule personne concernée… bilans figés en lecture seule ») est **supprimé** de la section Bilans. De manière générale, on ne ré-explique pas le fonctionnement des boutons par du texte dans la page.

## Boutons Accepter / Refuser côte à côte

- Les deux boutons sont **côte à côte** (flex row), sauf si le responsive ne le permet pas : retour à la ligne en mobile (`flex-wrap`).

## Bilan : sous-sections par cycle, séparées par un trait gris discret

- Le titre « Bilan du cycle N » du **cycle courant disparaît** : le cycle courant est affiché en premier, directement.
- Chaque bilan (par personne concernée) est une **sous-section séparée par un trait gris discret**.
- Les **cycles précédents** sont dans une **sous-section repliable, repliée par défaut** (`<details>` fermé), dont le titre porte la **date du changement d'état** (dernier retour en consultation / transition enregistrée dans le fil de suivi). Chaque cycle précédent garde sa date de fin (figé le …) en lecture seule.

## Photos : mosaïque + enregistrement automatique + overlay de chargement (partout où on ajoute des photos)

- **Tuile d'ajout plus petite et carrée** (contre une grande zone horizontale).
- **Chaque photo ajoutée a une miniature** : affichage en **mosaïque** de tuiles carrées (et non plus une liste de liens). Le clic sur une photo l'ouvre en grand (nouvel onglet).
- **Bouton poubelle en overlay sur la tuile** quand la suppression est possible (avec modale de confirmation) ; sinon pas de bouton, le clic ouvre la photo.
- **Plus de bouton « Ajouter »** sur le formulaire d'ajout de photos de la description : l'enregistrement se fait **dès que l'utilisateur a sélectionné la photo** dans son appareil (le champ `file` standard propose galerie et appareil photo directement en mobile).
- **Chargement** : overlay grisé avec un **serpent tournant** (spinner CSS) affiché pendant l'envoi (sélection de photos en auto-submit, et soumission des formulaires non autosave).

## Visibilité « déjà été » (précision spec 29)

- Une section est visible si l'état correspondant est **en cours OU a déjà été atteint** (historique `ticket_events`), y compris en « Archivé » (alors lecture seule) : s'applique à Consultation, Bilan et Factures. (Un ticket archivé directement depuis « Créé » n'affiche aucune de ces sections.)
