# Rattachements — affichage profil, péremption, panneau d'administration

En cas de contradiction, ce fichier (préfixe 19) prime sur `04-rattachements.md`, `11-comportements-constates-code-fonctionnels.md` et `13-ergonomie-formulaire-ticket.md` pour les points ci-dessous.

## Section « Mes rattachements » dans Mon profil

- **Plus de bouton/lien « voir l'état de mes rattachements »** dans cette section.
- Les unités demandées ou validées apparaissent dans un **contrôle custom** qui liste chaque unité avec, **juxtaposés** : le **type** (villa / garage / parties communes), le **numéro**, et le **statut** — **sablier** pour « en attente », **check verte** pour « validé » (et l'indication « refusé » le cas échéant).
- La **page des rattachements** (gestion des demandes en attente : accepter/refuser) **reste accessible** : via les **liens des notifications en direct** qui mènent à la page, et par son URL directe. Elle n'apparaît plus dans la barre de navigation ni comme bouton dans le profil.

## Péremption des demandes de rattachement

- Une demande de rattachement **en attente périme au bout de N jours** (défaut **14**, réglable dans le panneau d'administration ci-dessous) : à l'expiration, la demande est **supprimée**.
- **Notifications à J-3 et à J-1** avant la péremption aux **admin et membres du conseil syndical** (in-app + email si activé), chacune envoyée une seule fois.
- Après péremption, le résident peut **à nouveau réclamer** la même unité (la contrainte « une seule demande par couple unité/compte » ne s'applique qu'à une demande encore existante).

## Panneau d'administration (nouveau)

- Nouvelle page **« Administration » réservée à l'admin seul** (les membres du CS n'y ont pas accès).
- Réglages disponibles :
  - **délai de péremption des demandes de rattachement** (en jours, défaut **14**) ;
  - **délai d'archivage automatique des tickets « travaux acceptés »** (en jours, défaut **31**, voir `20`).
- Modalité technique : la péremption et l'archivage automatique sont évalués par une **tâche périodique côté serveur** (au démarrage de l'application et à intervalle régulier, ex. toutes les heures) ; les notifications J-3/J-1 ne sont envoyées qu'une fois par échéance.
