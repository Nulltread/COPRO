# Panneau d'administration

- Page **« Administration » réservée à l'admin seul** (les membres du conseil syndical n'y ont pas accès).

## Réglages disponibles

- **Délai de péremption des demandes de rattachement** (en jours, défaut **14**) — voir `rattachements.md` ;
- **Délai d'archivage automatique des tickets « travaux acceptés »** (en jours, défaut **31**) — voir `cycle-de-vie-des-tickets.md`.

## Mesure de l'usage

- Le panneau d'administration donne aussi accès à la page **« Mesure de l'usage »** (`/admin/usage`, admin seul) : connexions par compte, consultations des pages sur les 7 derniers jours (barregraphe filtrable par page) et journal des créations/modifications (tickets, fichiers, documents) — voir `38-mesure-usage-admin.md`.

## Modalité technique

- La péremption et l'archivage automatique sont évalués par une **tâche périodique côté serveur** (au démarrage de l'application et à intervalle régulier, ex. toutes les heures).
- Les alertes à J-3 et J-1 (péremption des rattachements, archivage automatique) ne sont envoyées **qu'une seule fois** par échéance (voir `notifications.md`).
