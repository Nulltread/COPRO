# Spec — Conclusions validées (rôles, comptes, tickets)

Ce fichier regroupe les décisions prises avec le demandeur sur les types d'utilisateur, la gestion des comptes et le cycle de vie des tickets. Il complète `PROMPT.md` ; en cas de contradiction, ce fichier fait foi pour les points listés. La dernière section récapitule les deltas par rapport à `PROMPT.md` pour cibler le dev.

## Rôles et comptes

- **Résident** (copropriétaire ou locataire) : compte de base. Auto-inscription : **identifiant = adresse email**, nom et prénom obligatoires, numéro de téléphone. **Pas de vérification d'email en v1.** Chacun peut changer son mot de passe dans son espace compte.
- **Membre du conseil syndical** : pas un compte à part, c'est un **statut supplémentaire** ajouté à un compte résident. Les membres du conseil syndical peuvent s'attribuer ou se retirer ce statut entre eux (gestion collégiale, eux-mêmes ou les autres). **Seul le conseil syndical peut tout faire sur un ticket** dans son cycle de vie. Plus de rôle « syndic professionnel ».
- **Administrateur** : **un et un seul compte admin**, à part, qui peut tout faire dans l'application.

## Unités : villas, garages, parties communes

- L'unité d'œuvre est la **villa, le garage ou les parties communes** (61 villas et 61 garages numérotés de 1 à 61 ; les parties communes forment une unité à part, rattachée **par défaut uniquement au conseil syndical**).
- **Référentiel en dur pour l'instant** (liste des unités non administrable en v1).
- Un **ticket est rattaché à une ou plusieurs unités** (pavillons imbriqués), jamais à une personne.
- Un résident peut être rattaché à **plusieurs villas/garages**.

## Rattachement d'un résident à une unité

- À la création du compte, le résident **réclame** son rattachement à une villa ou un garage. L'attribution est **acceptée uniquement par un autre résident de cette même villa/garage ou par un membre du conseil syndical** (notification dans l'app).
- Tant que le rattachement n'est pas accepté, le résident reste sans unité et **ne peut pas créer de ticket**.
- Un résident peut se retirer lui-même d'une unité, ou supprimer son compte : **aucun impact sur les tickets** (ils restent attachés à l'unité).

## Visibilité des données

- **Lecture ouverte à tous** : tout utilisateur connecté voit tous les tickets, même ceux des unités dont il n'est pas résident. Les filtres d'affichage sont par défaut positionnés sur les unités du résident, mais sans aucune restriction.
- **Devis et factures** : lisibles par tous, mais **ajout et modification réservés au conseil syndical**.
- **Compte-rendu d'intervention** : champ du ticket (voir cycle de vie), lisible par tous.

## Cycle de vie d'un ticket

États : **créé → validé par le conseil syndical → en consultation → intervention planifiée → travaux acceptés → archivé**.

- **Création** : le résident choisit librement les unités concernées — au moins une de ses propres villas/garages, mais il peut en ajouter d'autres. La liste des unités reste **modifiable après création** (ex. sinistre qui se propage). Les tickets sur les **parties communes sont créables uniquement par le conseil syndical**. Un résident sans unité validée ne peut pas créer de ticket.
- En v1, le **conseil syndical peut passer le ticket à n'importe quel statut, à tout moment**.
- **Résolution (travaux acceptés)** : acceptée par **tous les résidents concernés** (résidents des unités du ticket) ; **un membre du conseil syndical peut accepter seul**. L'acceptation de la résolution fait passer le ticket à **archivé** (archivage sans limite de durée, tickets archivés consultables).
- **Réouverture** : possible pour le conseil syndical ou un résident ; le ticket revient au statut d'avant la consultation.
- **Édition** : le résident peut modifier la description et ajouter/supprimer des photos **à tout moment, même une fois archivé**. **Toute modification est loguée avec son auteur**, et ce log est visible par tous.
- **Suppression** : seul le créateur peut supprimer son ticket, et uniquement s'il n'a **jamais évolué** dans son cycle de vie. Le conseil syndical ou l'admin peut supprimer un ticket non évolué créé par un compte qui s'est retiré ou a été supprimé. Le conseil syndical peut **archiver n'importe quel ticket**.

## Documents et notifications

- **Devis et factures** : fichiers stockés sur le ticket (devis / avenant / facture, avec montant), **gérés uniquement par le conseil syndical**, lisibles par tous.
- **Compte-rendu d'intervention** : pas un document, c'est un **champ du ticket rédigé dans l'app** : une instance par unité concernée, plus une instance pour le conseil syndical. Rempli par tout résident concerné.
- **Notifications** : à chaque événement (création, changement d'état, nouveau devis, décision, acceptation de la résolution, réclamation de rattachement), notifier dans l'app le **conseil syndical** et les **résidents concernés**. **Canal unique pour l'instant : notification in-app** (pas de SMTP, aucun canal externe).

## Deltas par rapport à PROMPT.md (à cibler pour le dev)

- [ ] Rôles/comptes : supprimer « syndic professionnel » ; CS = statut additionnel géré collégialement ; auto-inscription sans vérification d'email (email + nom/prénom/téléphone) ; un seul compte admin à part.
- [ ] Unités : ajouter les parties communes (CS par défaut) ; référentiel en dur en v1 ; ticket rattaché à une ou plusieurs unités, jamais à une personne ; résident multi-unités.
- [ ] Rattachement résident ↔ unité : réclamé par le résident, accepté par un résident de la même unité ou le CS ; pas d'unité = pas de ticket ; auto-retrait/suppression de compte sans impact sur les tickets.
- [ ] Visibilité : lecture ouverte à tous (filtres par défaut sur ses unités, sans restriction).
- [ ] Cycle de vie : nouveaux états (créé → validé CS → consultation → planifié → travaux acceptés → archivé), CS libre sur les états en v1, résolution par tous les résidents concernés (CS seul peut accepter) → archivé, réouverture vers l'état d'avant consultation, édition description/photos même archivé et loguée (log visible par tous), règles de suppression.
- [ ] Création de ticket : unités choisies librement (au moins une des siennes), modifiables après création ; parties communes = CS uniquement.
- [ ] CR d'intervention : champ du ticket in-app (une instance par unité + une pour le CS), plus un document uploadé.
- [ ] Devis/factures : gestion CS uniquement, lecture tous.
- [ ] Notifications : in-app uniquement (retirer email et web push PWA).
