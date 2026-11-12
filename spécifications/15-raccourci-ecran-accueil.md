# Raccourci sur l'\u00e9cran d'accueil (depuis la page Mon profil)

L'application reste une **application web responsive** (pas d'app native Android/iOS). On propose toutefois \u00e0 l'utilisateur, depuis la page **Mon profil**, d'ajouter un **raccourci sur son \u00e9cran d'accueil**, qui ouvre le site en plein \u00e9cran comme une application.

**Hors p\u00e9rim\u00e8tre** : aucun push natif, aucune app des stores (coh\u00e9rent avec `08-notifications.md`).

## Mise en place technique (PWA minimale)

- **Manifest** `/manifest.webmanifest` : nom \u00ab Copro La Pin\u00e8de de Notre Dame \u00bb, `short_name` \u00ab Copro \u00bb, `start_url` `/tickets`, `display: standalone`, `theme_color` #1a5fb4, ic\u00f4nes PNG 192 et 512 px (purpose `any` + `maskable`).
- **Ic\u00f4nes** : `icon-192.png`, `icon-512.png` (m\u00eame visuel que `icon.svg`), plus balises `apple-touch-icon`, `apple-mobile-web-app-capable` et `apple-mobile-web-app-status-bar-style` dans le `<head>` pour iOS.
- **Service worker minimal** `/sw.js` : mis en cache les statiques de base (`/style.css`, `/app.js`, ic\u00f4nes, `/`) \u2014 il ne sert que de crit\u00e8re d'installabilit\u00e9 pour Android/Chrome, **aucune notification push**.

## Section \u00ab Ajouter \u00e0 l'\u00e9cran d'accueil \u00bb sur Mon profil

Une section d\u00e9di\u00e9e, affich\u00e9e **uniquement selon le contexte d\u00e9tect\u00e9 c\u00f4t\u00e9 client** (d\u00e9tection de l'OS / navigateur en JavaScript, jamais c\u00f4t\u00e9 serveur) :

1. **D\u00e9j\u00e0 install\u00e9** (mode `standalone` ou `display-mode` plein \u00e9cran) : message \u00ab L'application est d\u00e9j\u00e0 sur votre \u00e9cran d'accueil \u00bb, aucun bouton.
2. **Android / Chrome** (ou tout navigateur exposant `beforeinstallprompt`) : bouton \u00ab \u2795 Ajouter \u00e0 l'\u00e9cran d'accueil \u00bb qui d\u00e9clenche le prompt natif du navigateur. Apr\u00e8s installation ou refus, la section revient \u00e0 l'\u00e9tat 1 ou 3.
3. **iOS / Safari** (d\u00e9tection `iPhone|iPad|iPod` et absence de `window.MSStream`) : **pas de bouton** (Apple ne permet pas le d\u00e9clenchement programmatique) \u2014 instructions visuelles en 2 \u00e9tapes : 1) appuyer sur le bouton **Partager** \u23c8, 2) choisir **\u00ab Sur l'\u00e9cran d'accueil \u00bb**.
4. **Autres navigateurs** : instructions g\u00e9n\u00e9riques (menu du navigateur \u2192 \u00ab Ajouter \u00e0 l'\u00e9cran d'accueil \u00bb / \u00ab Installer \u00bb), ou masquage de la section si le navigateur ne le supporte manifestement pas.

La d\u00e9tection s'appuie sur le **user-agent** et les capacit\u00e9s du navigateur (`beforeinstallprompt`, `navigator.standalone`), jamais sur une saisie manuelle de l'utilisateur.
