# Documents, devis, factures et coûts

## Photos

- **N'importe quel acteur peut ajouter des photos à n'importe quelle étape** du ticket.
- **Compression obligatoire côté client** avant envoi : redimensionnement + compression (JPEG/PNG, qualité cible ~80 %, dimension max ~1600 px), pour limiter le stockage et la bande passante.

## Devis, factures et décisions (fichiers uploadés)

- Stockage de fichiers (PDF/images) sur le ticket, catégorisés : **photo / devis / avenant / facture / décision / compte-rendu (document)**, avec métadonnées : montant, entreprise, délai.
- **Devis, avenants, factures et décisions : ajout et modification réservés au conseil syndical** ; lisibles par tous.
- **Mise en concurrence** : plusieurs devis peuvent être attachés au ticket, avec comparaison côte à côte (montant, entreprise, délai).
- **Décision** : choix explicite d'un devis (ou avenant) retenu, enregistré sur le ticket avec **montant retenu, entreprise et justification**. Les devis non retenus restent archivés sur le ticket.
- **Avenants** : si un surcoût est découvert pendant les travaux, un devis complémentaire (avenant) peut être ajouté, avec une nouvelle décision enregistrée.

## Compte-rendu d'intervention

- Ce n'est **pas qu'un document** : c'est un **champ du ticket rédigé dans l'app** — une instance par unité concernée, plus une instance pour le conseil syndical.
- Rempli par tout résident concerné. Un document uploadé de catégorie « compte-rendu » peut aussi être joint.

## Coût du ticket

Le ticket porte un **coût** affiché : total des devis et avenants **retenus**, total **facturé**, et **écart** éventuel.
