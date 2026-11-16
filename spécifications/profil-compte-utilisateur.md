# Page compte de l'utilisateur (« Mon profil »)

## Informations du compte

- **Profil modifiable** : nom, prénom, téléphone, mot de passe (laisser le champ vide = inchangé).
- Option **« recevoir aussi les notifications par email »** (désactivée par défaut ; réservée aux emails vérifiés — voir `notifications.md`).
- **« Renvoyer l'email de confirmation »** (vérification de l'adresse email) disponible depuis l'espace compte (voir `comptes-et-roles.md`).
- **Export RGPD** : téléchargement d'un fichier JSON (`mes-donnees-copro.json`) contenant le compte, les unités, les tickets créés et les notifications.
- **Suppression de compte** : anonymisation et retrait des sessions (voir `comptes-et-roles.md`).

## Section « Mes rattachements »

- Contrôle custom listant chaque unité demandée ou validée (type, numéro, statut : sablier / check verte / refusé).
- **Annuler une demande en attente** et **annuler un rattachement accepté** (auto-retrait d'une unité), chacun avec une **modale de confirmation**.
- La page de gestion des rattachements n'a plus de bouton ici ni dans la barre de navigation : elle reste accessible via les liens des notifications et par son URL directe (voir `rattachements.md`).

## Raccourci sur l'écran d'accueil (PWA minimale)

L'application reste une **application web responsive** (pas d'app native Android/iOS, aucun push natif, aucune app des stores). On propose depuis la page **Mon profil** d'ajouter un **raccourci sur l'écran d'accueil**, qui ouvre le site en plein écran comme une application. Le **titre de la section est supprimé** (le contenu reste).

### Mise en place technique

- **Manifest** `/manifest.webmanifest` : nom « Copro La Pinède de Notre Dame », `short_name` « Copro », `start_url` `/tickets`, `display: standalone`, `theme_color` #1a5fb4, icônes PNG 192 et 512 px (purpose `any` + `maskable`).
- **Icônes** : `icon-192.png`, `icon-512.png` (même visuel que `icon.svg`), plus balises `apple-touch-icon`, `apple-mobile-web-app-capable` et `apple-mobile-web-app-status-bar-style` dans le `<head>` pour iOS.
- **Service worker minimal** `/sw.js` : sert les statiques de base (`/style.css`, `/app.js`, icônes, `/`) en **réseau d'abord** (le cache n'est utilisé que hors-ligne) — il ne sert que de critère d'installabilité pour Android/Chrome, **aucune notification push**.
- **Anti-cache** : en-têtes `Cache-Control: no-cache` sur les statiques et le HTML.

### Affichage de la section (détection côté client uniquement)

La section est affichée selon le contexte détecté **côté client** (user-agent et capacités du navigateur, jamais côté serveur, jamais de saisie manuelle) :

1. **Déjà installé** (mode `standalone` ou `display-mode` plein écran) : message « L'application est déjà sur votre écran d'accueil », aucun bouton ;
2. **Android / Chrome** (ou tout navigateur exposant `beforeinstallprompt`) : bouton « ➕ Ajouter à l'écran d'accueil » déclenchant le prompt natif ; après installation ou refus, retour à l'état 1 ou 3 ;
3. **iOS / Safari** (détection `iPhone|iPad|iPod` et absence de `window.MSStream`) : pas de bouton (Apple ne permet pas le déclenchement programmatique) — instructions visuelles en 2 étapes : 1) bouton **Partager** ⎋, 2) « **Sur l'écran d'accueil** » ;
4. **Autres navigateurs** : instructions génériques (menu du navigateur → « Ajouter à l'écran d'accueil » / « Installer »), ou masquage de la section si le navigateur ne le supporte manifestement pas.
