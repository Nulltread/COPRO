# Modification des unités par clic (persistance immédiate)

En cas de contradiction, ce fichier (préfixe 27) prime sur `20` et `23` pour ce point.

- Dans la fiche ticket, la modification des **unités concernées** ne se fait plus via un multiselect + bouton « Enregistrer » : chaque unité est une **puce cliquable** ; **un clic sélectionne/désélectionne l'unité et la persiste immédiatement** (envoi en arrière-plan, indicateur « ✓ enregistré », sans rechargement de page — même principe que la sauvegarde à la volée de la description et du bilan, spec 26).
- Si l'envoi est refusé (ex. plus aucune de vos unités sélectionnée), l'affichage est resynchronisé depuis le serveur.
- Quand l'utilisateur n'a pas le droit de modifier les unités (occupant une fois le ticket passé en consultation, ou ticket archivé — spec 23), il voit une simple liste des unités, sans puces cliquables.
