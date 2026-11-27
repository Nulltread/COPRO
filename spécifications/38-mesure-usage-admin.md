# Mesure de l'usage (panneau admin)

Page **« Mesure de l'usage »** à l'URL **`/admin/usage`**, **réservée à l'administrateur seul** (403 sinon, comme `/admin` — voir `administration.md`). Liens : entrée **« Usage »** dans la barre de navigation (bloc admin, desktop + menu burger) et depuis la page `/admin`.

Trois sections :

1. **Connexions par compte** — pour chaque compte (actif, désactivé ou supprimé) : nombre **total** de connexions, connexions sur les **7 derniers jours**, **dernière connexion**. Source : table `connexions` (une ligne par connexion réussie, enregistrée dans `POST /connexion`).
2. **Consultations des pages — 7 derniers jours** — **barregraphe** (SVG inline, sans dépendance externe) : une barre par jour (aujourd'hui inclus), hauteur = nombre de consultations de pages ce jour-là ; **filtre par page** (`?page=<chemin>`) via une liste déroulante « Toutes les pages » + chaque chemin consulté sur la semaine ; récapitulatif texte des consultations par page sur la semaine. Source : table `page_views`.
3. **Journal d'activité** — liste **paginée** (50 entrées par page, `?p=`) des actions tracées dans `audit_log`, **filtre par type** (`?type=`), ordre antichronologique. Chaque entrée : date, type (libellé), contenu, auteur, lien vers l'entité (ticket/document) quand elle existe encore.

## Suivi des consultations de pages (`page_views`)

- Middleware serveur : une ligne par requête **GET HTML** d'un utilisateur **connecté** (`req.accepts('html')`, requête non XHR). Sont **exclus** : la racine `/` (simple redirection), les téléchargements de fichiers (`/fichiers/...`, `/documents/<id>/fichier`) et l'export RGPD (`/profil/export`). Enregistré : utilisateur, chemin (`req.path`), date.
- Les fichiers statiques (`/style.css`, etc.) ne sont pas tracés (servis avant le middleware).

## Journal d'activité (`audit_log`)

Colonnes : `type`, `auteur_id` (NULL = compte supprimé ou action automatique/externe), `entite` + `entite_id`, `contenu` (texte lisible **sans le nom de l'auteur** — l'auteur est joint par `auteur_id`), `created_at`.

Types tracés :

- **Tickets** : `ticket_cree`, `ticket_modifie` (description, unités, caractère urgent), `ticket_etape` (tout changement d'étape, y compris l'archivage automatique), `ticket_supprime` ;
- **Fichiers des tickets** : `fichier_ajoute` (photos, devis, factures — catégorie et noms ; y compris le devis déposé par un prestataire externe via son lien, auteur NULL + raison sociale dans le contenu), `fichier_supprime` ;
- **Documents de la copropriété** : `document_ajoute`, `document_modifie` (tags), `document_supprime`.

## Rétention et RGPD

- **Aucune purge automatique** (volumes faibles : quelques dizaines de lignes par jour au plus).
- À la **suppression d'un compte** (anonymisation, voir `comptes-et-roles.md`) : ses lignes `connexions` et `page_views` sont **supprimées** et `audit_log.auteur_id` passe à **NULL** (le journal reste lisible, affiché « Compte supprimé » — le contenu ne contient aucun nom).
- L'export RGPD de l'utilisateur (`/profil/export`) n'est pas modifié.

## Technique

- Tables `connexions`, `page_views`, `audit_log` : `src/db/schema.sql` + migration **v7** (`src/db/migrate.js`).
- Module `src/audit.js` : `enregistrerAction(type, auteurId, entite, entiteId, contenu)`, `enregistrerConnexion(userId)`, `enregistrerPageVue(userId, chemin)`, constantes `TYPES_AUDIT` / `ETIQUETTES_AUDIT`.
- Route `GET /admin/usage` dans `src/routes/admin.js` (garde `isAdmin`), vue `src/views/admin-usage.ejs`, styles du graphe dans `src/public/style.css`.
- Aide en ligne : page `usage` (`src/aide/usage.md`), correspondance `/admin/usage` → `usage` (voir `37-aide-en-ligne.md`).
