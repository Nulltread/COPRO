# Socle réglementaire minimal

Décision du demandeur : définir le **socle minimal nécessaire et suffisant** pour que la copropriété soit en règle, l'application servant d'**extranet sécurisé** et de **trace probante**. Contexte : 122 lots (61 villas + 61 garages), syndic **coopératif** (conseil syndical, art. 17-1 de la loi n° 65-557 du 10 juillet 1965) — la loi Hoguet (carte pro, garantie financière, RC pro) ne s'applique qu'aux syndics professionnels et ne concerne pas ce projet.

## Le socle (7 blocs)

1. **Documents de la copropriété** — espace sécurisé en ligne (art. 18 loi 1965, **décret n° 2019-502** : liste minimale de documents dématérialisés, sauf décision contraire de l'AG) : règlement de copropriété, **PV des 3 dernières AG**, carnet d'entretien, contrats en cours, comptes annuels + budget prévisionnel, fiche synthétique (décret n° 2016-1822), diagnostics (DTG/PPT/DPE), attestations d'assurance, registre de sécurité.
2. **Carnet d'entretien** (art. 18 loi 1965, **décret n° 2001-477 du 30 mai 2001**) — alimenté **automatiquement** par les tickets archivés (travaux réalisés, factures, bilans, photos) + dépôts manuels + échéancier des contrôles.
3. **Échéancier réglementaire** — dates + alertes J-90/J-30/J-7 + documents associés : **PPT** (art. 14-2 loi 1965, immeuble > 15 ans), **DPE collectif** (loi Climat et Résilience, selon nombre de lots), DTG, **fonds de travaux** (art. 14-2-1, ≥ 5 % du budget prévisionnel si immeuble > 10 ans).
4. **Charges et appels de fonds** (décret n° 2005-240 du 14 mars 2005) — budget prévisionnel, appels de fonds avec calcul des quotes-parts, enregistrement des paiements, impayés + relances, état daté (notaire), **export comptable CSV** pour l'expert-comptable. Les **tantièmes** vivent sur une **page dédiée, non liée à la facturation** — voir `tantiemes.md`. Visibilité restreinte : chacun ne voit que son propre solde, le gestionnaire voit tout.
5. **Contrats et prestataires** (art. 18 et 21 loi 1965) — contrats hébergés dans les documents + date de fin + alerte de renouvellement, au-dessus du référentiel entreprises existant (`consultations-entreprises-factures.md`) ; la mise en concurrence passe par les consultations de tickets.
6. **Valeur probante des tickets** (art. 1366 code civil, décret n° 2016-1673) — fil de suivi **append-only** (non modifiable, même par l'admin) + horodatage serveur + **export PDF horodaté** de la fiche ticket archivé.
7. **Workflow AG** — **essentiel** (décision du demandeur : « en associatif, toute minute gagnée est précieuse »), donc dans le socle et non en v2 — voir `ag-et-pv.md`.

+ **RGPD** : export/suppression déjà en place (`profil-compte-utilisateur.md`, `comptes-et-roles.md`) ; à compléter : **durées de conservation/purge paramétrables** et **mention d'information à l'inscription**.

## Hors app (procédures à documenter, pas des features)

- Compte bancaire **séparé au nom du syndicat** (art. 18 II loi 1965, sans dérogation) — géré à la banque.
- **Comptabilité légale** en partie double + 5 annexes (décret 2005-240) — expert-comptable/CS ; **l'app ne fait jamais la comptabilité légale**, elle fournit la trace et les exports.
- Immatriculation au **Registre national des copropriétés** (RNC).
- Assurance **RC des membres du CS** bénévoles.
- **Registre des traitements** RGPD, procédure de notification de violation à la CNIL sous **72 h**, contrat **DPA art. 28** avec l'hébergeur.

## Hors socle (v2+)

- Signature électronique **qualifiée eIDAS** du PV d'AG ; horodatage qualifié eIDAS.
- Vote par correspondance / visioconférence en AG.
- Module sinistres/assurance dédié (les tickets sinistres couvrent le besoin).

## Règle générale

L'application est l'**outil principal de gestion** (tickets, AG, documents, charges) mais ne se substitue jamais aux actes juridiques externes : compte bancaire, comptabilité certifiée, actes notariés.
