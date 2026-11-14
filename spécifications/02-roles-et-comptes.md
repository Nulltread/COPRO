# Rôles et comptes

Trois niveaux de droits : **résident**, **membre du conseil syndical** (statut additionnel), **administrateur**.

## Résident (propriétaire ou locataire)

- Compte de base. **Auto-inscription** : identifiant = adresse email, nom et prénom obligatoires, numéro de téléphone obligatoire. **Vérification par email** : à l'inscription, un email contenant un **lien de validation** est envoyé (voir `16-serveur-mail-et-domaine.md`) ; le compte est actif immédiatement mais son email reste « non vérifié » (`email_verifie = 0`) tant que le lien n'est pas ouvert. Un email non vérifié ne figure pas dans la liste de diffusion du CS.
- Chacun peut changer son mot de passe dans son espace compte.
- Un résident crée des tickets, suit leur avancement, commente, ajoute des photos. **Compte requis pour déclarer un ticket.**

## Membre du conseil syndical (CS)

- Pas un compte à part : c'est un **statut supplémentaire** ajouté à un compte résident.
- Gestion **collégiale** : les membres du CS peuvent s'attribuer ou se retirer ce statut entre eux (eux-mêmes ou les autres).
- **Seul le conseil syndical peut tout faire sur un ticket** dans son cycle de vie (transitions, devis/factures, décisions…).
- Il n'existe **plus de rôle « syndic professionnel »** (supprimé par rapport au brief initial).

## Administrateur

- **Un et un seul compte admin**, à part, qui peut tout faire dans l'application.
