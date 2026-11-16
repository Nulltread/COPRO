# Vision et principes généraux

## Contexte

Application web de suivi de travaux et sinistres pour une copropriété de **61 pavillons (villas) et 61 garages**. Les utilisateurs sont des personnes **non techniques** : l'interface doit être **simplissime**, **mobile-first** (utilisable sur téléphone), chaque action atteignable en un minimum de clics. L'objectif est un outil **simple, accessible et bon marché à héberger**.

- Interface en **français**, vocabulaire courant, aucune notion technique exposée à l'utilisateur.
- Responsive / mobile-first.

## Principes généraux

- Chaque ticket permet le suivi de son avancement, avec photos, devis, factures et bilans d'intervention, et est attribué à une ou plusieurs villas/garages (voir `unites.md` et `cycle-de-vie-des-tickets.md`).
- Un sinistre urgent (fuite, danger…) peut être signalé via un indicateur **« urgent »** : il est notifié en priorité (mention « URGENT ») au conseil syndical, **sans modifier le parcours du ticket** (voir `cycle-de-vie-des-tickets.md` et `notifications.md`).
- Principe d'interface : **moins de texte explicatif** dans les pages — on ne ré-explique pas le fonctionnement des boutons.

## Contraintes globales

- Coût d'hébergement **minimal** et **simplicité** : stack légère, application web monolithique, un seul conteneur déployable sur un petit VPS ou une PaaS bas coût, pas de dépendance à des services payants (voir `stockage-securite-deploiement.md`).

## Livrables attendus

1. Application fonctionnelle couvrant l'ensemble des spécifications de ce dossier.
2. Schéma de données (unités, comptes, tickets, transitions, fichiers, notifications).
3. Jeu de données de démonstration : 61 villas, 61 garages, quelques comptes de chaque rôle, tickets à différents stades.
4. Instructions de déploiement simples (README pas à pas).
