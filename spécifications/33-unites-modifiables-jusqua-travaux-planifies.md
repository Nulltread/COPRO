# Unités d'un ticket modifiables jusqu'au passage en « Travaux planifiés »

En cas de contradiction, ce fichier (préfixe 33) prime sur `23-corrections-affichage-ticket.md`, `27-unites-par-clic.md`, `29`, `30`, `31`, `32` et les fichiers antérieurs pour ce point.

- Les **unités concernées d'un ticket sont modifiables tant que le ticket n'est pas entré en « Travaux planifiés »** — c'est-à-dire aux états **« Créé » et « En consultation »** (donc jusqu'à la validation d'une consultation/devis, qui fait passer en « Travaux planifiés »).
- **Qui** : mêmes règles que l'édition du ticket (créateur, résidents concernés des unités, membres du CS, admin) — y compris à l'état « En consultation » (la restriction « CS/admin seuls en consultation » de la spec 23 est levée pour les unités).
- À partir de **« Travaux planifiés »** (planifiés, acceptés, archivé) : les unités sont **figées** — plus jamais modifiables ; on affiche la simple liste des unités.
- Le composant reste le multiselect « search » (spec 29/30) avec persistance immédiate (spec 27).
