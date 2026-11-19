# Assemblées générales et procès-verbaux

Dans le **socle réglementaire** (décision du demandeur : le workflow AG est essentiel) — voir `socle-reglementaire.md`.

## Contraintes légales rappelées

- Convocation avec **ordre du jour** envoyée au moins **21 jours francs** avant l'AG (décret n° 67-223 du 17 mars 1967) ; documents comptables consultables avant l'AG.
- **Feuille de présence** (présents, représentés avec pouvoir, absents), annexée au PV.
- Majorités selon les résolutions : **art. 24** (majorité des voix des présents/représentés), **art. 25** (majorité de tous les copropriétaires), **art. 26** (double majorité) de la loi 1965.
- **PV notifié dans le mois** suivant l'AG (art. 42 loi 1965) ; délai de contestation de **2 mois** à compter de la notification ; **registre des délibérations** tenu par le syndic.
- **PV des 3 dernières AG en ligne** (décret n° 2019-502) — l'app joue ce rôle via les Documents de la copropriété.
- Vote par correspondance / visioconférence : autorisés par la loi, prévus en **v2+** (hors socle).

## Page « AG »

- Lien dans la **barre de navigation**, réservé au **gestionnaire** (CS/admin), à côté de « Tableau de bord ».
- Liste des AG, ordre chronologique décroissant, avec **statut** : `brouillon` → `convoquée` → `tenue` → `PV envoyé`.

## Cycle d'une AG

1. **Création** (gestionnaire) : date, heure, lieu, type (ordinaire / extraordinaire), **ordre du jour** (liste de points), **projets de résolutions** (texte + majorité requise art. 24/25/26), documents joints (liés au module Documents de la copropriété).
2. **Convocation** : génération d'un **document de convocation** téléchargeable (date, heure, lieu, ODJ, résolutions, documents joints) + **envoi par email** aux copropriétaires (emails vérifiés uniquement, voir `mail-et-domaine.md`) + notification in-app ; passage au statut `convoquée`. **Alerte J-21** avant l'AG aux membres du CS et à l'admin (une seule fois, comme les autres alertes J-x, voir `notifications.md`).
3. **Tenue** : **feuille de présence** — pour chaque copropriétaire (compte rattaché à au moins une unité validée) : présent / représenté (nom du mandataire) / absent ; calcul automatique des **voix présentes + représentées** à partir des **tantièmes** (voir `tantiemes.md`). **Vote par résolution** : pour / contre / abstention, avec calcul automatique du résultat selon la majorité requise ; la résolution est marquée **adoptée** ou **rejetée**. Passage au statut `tenue`.
4. **PV** : généré automatiquement (ODJ, feuille de présence, résolutions et résultats, date de l'AG), téléchargeable ; archivé dans les **Documents de la copropriété** (catégorie « PV d'AG ») ; notification « PV de l'AG du … disponible » à tous les copropriétaires, **dans le mois** ; passage au statut `PV envoyé`. Le **registre des délibérations** est la liste chronologique des AG/PV de la page.

## Droits et visibilité

- Création/édition de l'AG, feuille de présence, votes détaillés : **gestionnaire uniquement**.
- **PV (avec feuille de présence annexée)** : lisible par **tous les utilisateurs connectés** (extranet, décret 2019-502) — c'est un document de la copropriété.
- Chaque événement de l'AG (convocation envoyée, AG tenue, PV disponible) est **horodaté avec son auteur** et tracé dans le fil de suivi de l'AG.

## Hors socle (v2+)

- Signature électronique du PV (qualifiée eIDAS hors socle), vote par correspondance, visioconférence.
