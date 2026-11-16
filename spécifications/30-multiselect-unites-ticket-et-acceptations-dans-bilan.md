# Multiselect des unités dans la fiche ticket + acceptations matérialisées dans le bilan

En cas de contradiction, ce fichier (préfixe 30) prime sur `27-unites-par-clic.md`, `28-bilan-acceptation-refus.md`, `29-organisation-fiche-ticket-filtre-unites-consultations-profil.md` et les fichiers antérieurs pour tous les points ci-dessous.

## Sélection des unités dans la fiche ticket : multiselect « search »

- Dans la fiche ticket (section **Description** → « Unités concernées »), la sélection des unités se fait avec le **même composant multiselect « search » que le filtre de la liste des tickets** (spec 29) : champ texte, dropdown des 5 premiers résultats affinée à la saisie, **puce ajoutée à gauche du texte** au clic, puces retirables.
- Cela **remplace les puces cliquables** de la spec 27. La **persistance immédiate au changement est conservée** (envoi en arrière-plan à chaque ajout/retrait, indicateur « ✓ enregistré », resynchronisation depuis le serveur si l'envoi est refusé).
- Quand l'utilisateur n'a pas le droit de modifier les unités, il voit toujours la simple liste des unités (sans composant).

## Suppression de la section « Acceptations des travaux »

- La section « **Acceptations des travaux** » (état « Travaux acceptés ») est **supprimée purement et simplement** : elle n'apparaît plus avant la section Consultations ni ailleurs.
- Les **acceptations sont matérialisées dans la section « Bilans de l'intervention » sous forme de pastilles/coches**, sur le même modèle que les demandes de rattachement dans la page de compte : `✅ <nom> a accepté` (avec le commentaire éventuel), `📄 caduque (lecture seule)` pour les acceptations des cycles précédents.
- Restent également dans la section « Bilans » : le bloc Accepter/Refuser (état « Travaux planifiés », spec 28), les photos d'acceptation, la **date d'archivage automatique**, le formulaire de **réouverture** (état « Travaux acceptés ») et les photos de réouverture.
- L'ordre des sections de la fiche ticket reste celui de la spec 29 : **Description → Consultation → Bilan de l'intervention → Factures**.
