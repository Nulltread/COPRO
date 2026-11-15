# Factures et réception des travaux (remplace la règle « archivage bloqué sans facture »)

En cas de contradiction, ce fichier (préfixe 24) prime sur `20-cycle-de-vie-des-tickets-v2.md` pour les points ci-dessous.

## Archivage : plus aucune condition de facture

- L'archivage (manuel par un membre du CS ou l'admin, à tout moment hors état archivé, **et automatique** après le délai réglé en « Travaux acceptés ») **ne dépend plus des factures**. La règle « aucun archivage sans facture » de la spec 20 est retirée.

## Factures = pièce jointe obligatoire de la réception des travaux

- Les factures (PDF + coût, section dédiée, ajout par le CS/admin tant que le ticket n'est pas archivé) servent désormais à la **validation de la réception des travaux**.
- Le passage de « Travaux planifiés » à « Travaux acceptés » exige désormais :
  1. **tous les propriétaires et locataires des unités concernées** ont validé les travaux (commentaire et/ou photos facultatifs) — inchangé ;
  2. **au moins un membre du conseil syndical (ou l'admin) a validé la réception des travaux**, et cette validation **nécessite qu'au moins une facture soit jointe au ticket** (bouton grisé + explication tant qu'il n'y a pas de facture ; rejet côté serveur sinon).
- Garage = villa (même process) ; pour les parties communes, pas de résident à valider, la réception par un membre du CS suffit.
- À la réouverture (travaux acceptés → consultation), les validations précédentes (résidents et réception) deviennent caduques comme les consultations : il faut de nouvelles validations de tous les résidents **et** une nouvelle réception par un membre du CS (avec facture) pour repasser en « Travaux acceptés ».
