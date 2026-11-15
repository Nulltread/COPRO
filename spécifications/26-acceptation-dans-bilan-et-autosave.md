# Acceptation de l'intervention dans le bilan + sauvegarde à la volée

En cas de contradiction, ce fichier (préfixe 26) prime sur `20`, `23`, `24`, `25` pour les points ci-dessous.

## Bouton d'acceptation de l'intervention dans la section du bilan

- La section **« Bilans de l'intervention »** (visible à partir de « Travaux planifiés ») contient aussi, tant que le ticket est en « Travaux planifiés », le bloc **d'acceptation de l'intervention** : état des validations (un représentant par unité + réception par un membre du CS, spec 25), formulaire du représentant (« J'accepte l'intervention », commentaire + photos facultatifs) et bouton de réception du CS (grisé sans facture). Il n'y a plus de section « Valider les travaux » séparée.

## Sauvegarde à la volée (autosave)

- **Plus de bouton « Enregistrer la description »** ni de bouton « Enregistrer » sur le bilan : ces deux champs se **sauvegardent automatiquement à la volée** (envoi en arrière-plan ~600 ms après la saisie, avec un indicateur « ✓ enregistré » ; les photos sélectionnées dans le bilan sont envoyées immédiatement avec le texte courant). Aucun rechargement de page.
