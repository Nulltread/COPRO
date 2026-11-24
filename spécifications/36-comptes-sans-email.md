# Comptes sans email et réinitialisation du mot de passe

## Email facultatif

- L'**adresse email d'un compte est facultative** : les comptes créés par le CS ou l'admin peuvent n'en avoir aucune.
- **Unicité de l'email uniquement parmi les comptes actifs** (statut `actif`) : un compte désactivé ou supprimé ne bloque pas la réutilisation de son email.
- La **connexion se fait toujours par email** (identifiant inchangé) : un compte **sans email est inaccessible** tant qu'aucun email n'est renseigné.

## Mot de passe : réinitialisation par email, systématique

- Tout compte créé par le CS/admin reçoit un **mot de passe aléatoire** (non communiqué, inutilisable en l'état).
- **Dès qu'un email est renseigné sur un compte** (à la création ou lors d'une modification), un **mail de réinitialisation du mot de passe** est envoyé **automatiquement** à cette adresse : lien **unique et expirable** menant à un formulaire de nouveau mot de passe (**8 caractères minimum**) — voir `mail-et-domaine.md`. Un **renvoi manuel** est possible depuis la page Comptes.
- Le titulaire définit ainsi lui-même son mot de passe ; l'application ne transmet jamais de mot de passe en clair.

## Création des comptes

- **Les comptes de propriétaires ne peuvent être créés QUE par le conseil syndical ou l'admin** (depuis la page Comptes — voir `comptes-et-roles.md`). Aucun propriétaire ne peut s'auto-inscrire.
- **Auto-inscription (`/inscription`) : locataires uniquement** — le choix de qualité « propriétaire » est supprimé du formulaire ; le compte créé réclame son rattachement à l'unité choisie **en qualité locataire** (voir `rattachements.md`).
- Depuis son profil, la réclamation de rattachement se fait elle aussi **toujours en qualité locataire**.

## Nom et prénom obligatoires

- **Nom et prénom sont obligatoires pour TOUS les comptes**, à la création comme à la modification (auto-inscription, création par le gestionnaire, script de peuplement).

## Statut « désactivé » (distinct de « supprimé »)

- Nouveau statut de compte **`desactive`**, définitif, distinct de `supprime` (anonymisation par auto-suppression, inchangé — voir `comptes-et-roles.md`).
- Déclenché uniquement par un **rachat de lot** (voir `35-lots.md`) : désactivation de l'ancien compte s'il n'a plus aucun rattachement (ni lot, ni locataire).
- Un compte désactivé : **ne peut plus se connecter** (403, message distinct de « supprimé »), ne reçoit **plus de notifications**, est **exclu de la liste de diffusion du CS** et de l'**unicité d'email**, mais **conserve son identité, ses tickets (l'auteur reste visible) et tout son historique d'activité**. **Aucune réactivation possible.**
