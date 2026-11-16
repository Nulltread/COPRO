# Organisation des pages : fiche ticket, filtre unités, consultations, profil

En cas de contradiction, ce fichier (préfixe 29) prime sur `20-cycle-de-vie-des-tickets-v2.md`, `23-corrections-affichage-ticket.md`, `26-acceptation-dans-bilan-et-autosave.md`, `27-unites-par-clic.md`, `28-bilan-acceptation-refus.md` et les fichiers antérieurs pour tous les points ci-dessous.

## Fiche ticket : ordre des sections

La fiche ticket affiche les sections dans l'ordre suivant :

1. **Description** : champ description (édition à la volée ou lecture seule), **unités concernées** et **photos** de la section (photos de création) regroupées dans cette même section ;
2. **Consultation** : affichée UNIQUEMENT si le ticket est à l'état « En consultation » ou s'il l'a déjà été (états ultérieurs, archivé compris) ;
3. **Bilan de l'intervention** : affichée UNIQUEMENT si le ticket est à l'état « Travaux planifiés » ou s'il l'a déjà été (idem, visibilité restreinte aux personnes concernées selon `28`) ;
4. **Factures** : affichée UNIQUEMENT à l'état « Travaux acceptés », ou en « Archivé » si le ticket a déjà connu l'état « Travaux acceptés ».

**Règle générale pour l'état « Archivé »** : en mode archivé, toutes les sections correspondant à des états que le ticket a déjà connus restent affichées, en **lecture seule** (historique consultable). Une section d'un état jamais atteint par le ticket n'est pas affichée (ex. : un ticket archivé directement depuis « Créé » n'affiche ni consultation, ni bilan, ni factures).

Les autres blocs existants (boutons Archiver/Supprimer sous le titre, section de transition, acceptations/réouverture, fil de suivi) restent en place.

## Fiche ticket : unités par clic

Le comportement « un clic sur une unité la sélectionne et l'enregistre directement » (`27`) est conservé, mais **la phrase d'aide « Un clic sur une unité la sélectionne et l'enregistre directement. » est supprimée** de l'affichage.

## Page des tickets : filtre par unités en multiselect « search »

- Le filtre « unité » de la liste des tickets n'est plus un dropdown simple : c'est un **champ multiselect de type search**.
- C'est un **champ texte** : au fur et à mesure de la saisie, une **dropdown affiche les 5 premiers résultats** correspondants, et cette liste **s'affine** avec la saisie.
- Quand l'utilisateur clique sur une valeur de la dropdown, un **composant (puce) s'affiche à gauche du texte** ; la valeur est ajoutée à la sélection (multiselect : plusieurs puces possibles, chacune retirable).
- Le filtre s'applique dès la sélection (soumission du formulaire, comme les autres filtres de `23`).
- Côté serveur, le paramètre `unite` accepte **plusieurs valeurs** (`unite=1&unite=2`) ; la valeur spéciale `toutes` = toutes les unités ; aucune sélection = comportement par défaut habituel (mes unités pour un résident, toutes les unités sinon).

## Section consultation de la fiche ticket

- Le choix **« Créer une nouvelle entreprise »** ouvre une **modale** contenant les champs de la fiche entreprise « à la volée » (raison sociale, SIREN/SIRET, nom du contact, téléphone, mail — voir `21-entreprises.md`) ; les champs ne sont **pas affichés directement dans la page**. À la validation de la modale, la nouvelle entreprise est utilisée pour la consultation en cours de saisie (création effective à l'enregistrement de la consultation, comme `20`/`21`).
- La section est une **liste de tuples {Entreprise, devis, prix, date d'intervention, bouton de choix}**, plus un **bouton « ajouter »** qui ajoute une ligne (formulaire de saisie) à la liste.
- Ordre de la liste : d'abord les consultations **actives** (cycle en cours), puis, le cas échéant, les consultations **passées en lecture seule** (caduques).
- Le **bouton de choix** d'une consultation active valide celle-ci et fait passer le ticket en « Travaux planifiés » (règles de `20` inchangées).

## Page de compte (Mon profil)

- Il est possible d'**annuler la demande de rattachement** (statut « en attente ») depuis la page de compte, avec une **modale de confirmation**.
- Il est possible d'**annuler le rattachement à une unité** (se retirer d'une unité acceptée) depuis la page de compte, avec une **modale de confirmation** (le retrait existant gagne la modale).
- Le **titre de la section « Ajouter à l'écran d'accueil » est supprimé** dans la page de compte (le contenu de la section, `15`, reste).
