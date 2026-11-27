# Mail de lancement au conseil syndical — v0 de test (27/11/2026) — v3

> **Canal d'envoi** : connecteur Gmail de Sébastien — **brouillon uniquement**.
> L'envoi effectif ne se fera que sur demande explicite de Sébastien.
> **Aucune pièce jointe** : toute l'aide est en ligne dans l'application (bouton « ? »).
>
> **Historique des brouillons Gmail** (l'API ne permet ni de modifier ni de supprimer
> un brouillon : chaque version = un nouveau brouillon, les anciennes sont à supprimer
> manuellement dans Gmail) :
> - v1 = `r4375582934563626056` (emoji sapin, « nous »)
> - v2 = `r-3342795053297377134` (sans sapin, « de mon initiative personnelle »)
> - **v3 = brouillon courant** (ci-dessous) : « j'ai créé » (pas d'équivoque, sans « nous »,
>   sans « initiative personnelle »).
>
> **Note style / UX** : aucun « skill d'UX design » n'est accessible dans cet
> environnement (registre des skills, prompts, Drive, Gmail et bibliothèque de
> documents fouillés). Le style a donc été revu selon les bonnes pratiques e-mail
> reconnues : CSS 100 % inline, conteneur 640 px, polices système, tailles ≥ 15 px,
> interligne 1,6, texte préheader caché, contrastes ≥ 4,5:1 (pied de page assombri),
> un seul CTA principal (bouton URL), encadrés à liséré coloré, aucune image
> obligatoire.
>
> **Destinataires (les 9 membres du CS, liste explicite) :**
> sebastien.paletti@gmail.com, olivier.blauvac@gmail.com, yves.brunel0073@orange.fr,
> prele.collas@laposte.net, nathalie.delavallee9@gmail.com, davidgomez1143@gmail.com,
> soniallorca75@gmail.com, julien.debastiani@erilia.fr, yohkun@gmail.com
>
> **Objet :** La Pinède de Notre-Dame — je vous propose de tester l'outil que j'ai créé (1 semaine de test, votre compte est déjà créé)
>
> **URL de l'app :** https://copro-pinede-gardanne.fr

---

## Version texte brut (corps du brouillon Gmail)

Bonjour à toutes et à tous,

**J'ai créé** pour notre copropriété un outil en ligne de suivi des travaux et sinistres : **Copro La Pinède de Notre-Dame**. Je vous propose de le tester pendant une semaine, à l'adresse :

**https://copro-pinede-gardanne.fr**

**À quoi ça sert ?** Déclarer un problème (fuite, dégât des eaux, travaux à prévoir…) avec des photos, et suivre son traitement **du début à la fin au même endroit** : devis des entreprises, dates d'intervention, bilan final. Tout le monde voit l'avancement ; le conseil syndical pilote les consultations et la planification.

**Comment se connecter** (votre compte est déjà créé) :

1. Rendez-vous sur **https://copro-pinede-gardanne.fr** puis cliquez sur « Connexion ».
2. **Identifiant = votre adresse email** (celle sur laquelle vous recevez ce mail).
3. **Mot de passe** : utilisez le mail individuel « Choisissez votre mot de passe — Copro La Pinède de Gardanne » envoyé séparément à votre adresse : cliquez sur son lien (valable 24 h) et choisissez votre mot de passe (8 caractères minimum). Aucun mot de passe n'est jamais transmis en clair. Lien perdu ? Répondez-moi, je vous le renvoie.
4. Une fois connecté, l'**aide complète est en ligne dans l'app** via le bouton « ? » (menu Aide) : sommaire, recherche, et pages détaillées — le « ? » s'ouvre directement sur la page adaptée à l'écran où vous êtes.

**Ce que vous trouverez pendant le test :**

- **vos lots déjà rattachés** à votre compte (page « Mes lots »), et les 123 lots de la copropriété peuplés ;
- **des tickets réalistes déjà chargés**, à différents stades, issus de vrais dossiers récents de la copropriété, pour voir concrètement ce que ça donne ;
- pendant cette période de test, votre compte est rattaché à vos **lots mais pas encore à un logement** : la page « Mon logement » de l'aide en ligne (« ? ») explique **comment se rattacher à son logement**.

**La période de test : une semaine, du jeudi 27/11 au jeudi 04/12.**

- **Dites-moi si ça vous est utile** — et ce qui manque ou n'est pas clair — en répondant simplement à ce mail. Vos retours décideront de la suite.
- **À l'issue de la semaine, je nettoie les données de test** : vous pourrez ensuite jouer librement avec l'outil, sans risque.
- **Votre email est bien configuré sur votre compte** : même pendant cette démo, vous pouvez recevoir des mails de l'application (notifications, par ex. sur un ticket).

**Transparence :** l'**intelligence artificielle (IA) a été largement utilisée pour créer cette application, sa documentation et ce mail**. Je reste bien entendu disponible **en personne** pour vous aider ou répondre à vos questions : **sebastien.paletti@gmail.com** ou **06 78 97 59 28**.

Merci d'avance pour votre temps et vos retours !

Bien cordialement,

**Sébastien PALETTI**
Membre du conseil syndical — Copropriétaire (villa 10)
Copropriété « La Pinède de Notre-Dame », Gardanne

---
Aucune pièce jointe : toute l'aide est en ligne dans l'application, via le bouton « ? » (menu Aide).

---

## Version HTML (champ `htmlBody` du brouillon Gmail)

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>La Pinède de Notre-Dame — test de l'outil en ligne</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f4;font-family:-apple-system,'Segoe UI',Arial,Helvetica,sans-serif;color:#26332a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Une semaine de test · votre compte est déjà créé · aucune installation · https://copro-pinede-gardanne.fr</div>
  <div style="max-width:640px;margin:0 auto;background:#ffffff;">

    <!-- En-tête -->
    <div style="background:#2e5d3a;color:#ffffff;padding:28px 32px;">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:.9;">Copropriété « La Pinède de Notre-Dame » — Gardanne</div>
      <div style="font-size:26px;font-weight:bold;margin-top:6px;line-height:1.3;">Testez l'outil que j'ai créé</div>
      <div style="font-size:15px;margin-top:8px;opacity:.95;">Une semaine de test · votre compte est déjà créé · aucune installation</div>
    </div>

    <div style="padding:28px 32px;">

      <p style="font-size:16px;line-height:1.6;">Bonjour à toutes et à tous,</p>
      <p style="font-size:16px;line-height:1.6;"><strong>J'ai créé</strong> pour notre copropriété un <strong>outil en ligne de suivi des travaux et sinistres</strong> — et je vous propose de le tester pendant une semaine :</p>

      <div style="text-align:center;margin:24px 0;">
        <a href="https://copro-pinede-gardanne.fr" style="display:inline-block;background:#2e5d3a;color:#ffffff;text-decoration:none;font-size:18px;font-weight:bold;padding:14px 28px;border-radius:8px;">https://copro-pinede-gardanne.fr</a>
      </div>

      <p style="font-size:16px;line-height:1.6;"><strong>À quoi ça sert ?</strong> Déclarer un problème (fuite, dégât des eaux, travaux à prévoir…) avec des photos, et suivre son traitement <strong>du début à la fin au même endroit</strong> : devis des entreprises, dates d'intervention, bilan final. Tout le monde voit l'avancement ; le conseil syndical pilote les consultations et la planification.</p>

      <!-- Comment se connecter -->
      <div style="background:#eef5ef;border:1px solid #cfe3d2;border-left:5px solid #2e5d3a;border-radius:8px;padding:18px 22px;margin:24px 0;">
        <div style="font-size:17px;font-weight:bold;color:#2e5d3a;margin-bottom:10px;">🔑 Comment se connecter (votre compte est déjà créé)</div>
        <ol style="font-size:15px;line-height:1.7;margin:0;padding-left:20px;">
          <li>Rendez-vous sur <strong>https://copro-pinede-gardanne.fr</strong> puis cliquez sur <strong>« Connexion »</strong>.</li>
          <li><strong>Identifiant = votre adresse email</strong> (celle sur laquelle vous recevez ce mail).</li>
          <li><strong>Mot de passe</strong> : utilisez le mail individuel <em>« Choisissez votre mot de passe — Copro La Pinède de Gardanne »</em> envoyé séparément à votre adresse — cliquez sur son lien (valable 24&nbsp;h) et choisissez votre mot de passe (8 caractères minimum). <strong>Aucun mot de passe n'est jamais transmis en clair.</strong> Lien perdu ? Répondez-moi, je vous le renvoie.</li>
          <li>Une fois connecté, l'<strong>aide complète est en ligne dans l'app</strong> via le bouton <strong>« ? »</strong> (menu Aide) : sommaire, recherche, pages détaillées — et le « ? » s'ouvre <strong>directement sur la page adaptée à l'écran où vous êtes</strong>.</li>
        </ol>
      </div>

      <!-- Ce que vous trouverez -->
      <div style="font-size:17px;font-weight:bold;color:#2e5d3a;margin:24px 0 8px;">📋 Ce que vous trouverez pendant le test</div>
      <ul style="font-size:15px;line-height:1.7;margin:0;padding-left:20px;">
        <li><strong>vos lots déjà rattachés</strong> à votre compte (page « Mes lots »), et les 123 lots de la copropriété peuplés ;</li>
        <li><strong>des tickets réalistes déjà chargés</strong>, à différents stades, issus de vrais dossiers récents de la copropriété ;</li>
        <li>pendant la période de test, votre compte est rattaché à vos <strong>lots mais pas encore à un logement</strong> : la page <strong>« Mon logement »</strong> de l'aide en ligne (« ? ») explique <strong>comment se rattacher à son logement</strong>.</li>
      </ul>

      <!-- Période de test -->
      <div style="background:#fdf6e3;border:1px solid #f0dfae;border-left:5px solid #a8821a;border-radius:8px;padding:18px 22px;margin:24px 0;">
        <div style="font-size:17px;font-weight:bold;color:#7a5f14;margin-bottom:10px;">📅 Une semaine de test : du jeudi 27/11 au jeudi 04/12</div>
        <ul style="font-size:15px;line-height:1.7;margin:0;padding-left:20px;">
          <li><strong>Dites-moi si ça vous est utile</strong> — et ce qui manque ou n'est pas clair — en répondant simplement à ce mail. Vos retours décideront de la suite.</li>
          <li><strong>À l'issue de la semaine, je nettoie les données de test</strong> : vous pourrez ensuite jouer librement avec l'outil, sans risque.</li>
          <li><strong>Votre email est bien configuré sur votre compte</strong> : même pendant cette démo, vous pouvez recevoir des mails de l'application (notifications, par ex. sur un ticket).</li>
        </ul>
      </div>

      <!-- Transparence IA -->
      <div style="background:#eef2fb;border:1px solid #ccd6f0;border-left:5px solid #4a6fd4;border-radius:8px;padding:18px 22px;margin:24px 0;">
        <div style="font-size:17px;font-weight:bold;color:#3a55a8;margin-bottom:8px;">🤖 Transparence</div>
        <p style="font-size:15px;line-height:1.6;margin:0;">L'<strong>intelligence artificielle (IA) a été largement utilisée pour créer cette application, sa documentation et ce mail</strong>. Je reste bien entendu disponible <strong>en personne</strong> pour vous aider :<br>
        📧 <strong>sebastien.paletti@gmail.com</strong> &nbsp;·&nbsp; 📞 <strong>06 78 97 59 28</strong></p>
      </div>

      <p style="font-size:16px;line-height:1.6;">Merci d'avance pour votre temps et vos retours !</p>

      <p style="font-size:16px;line-height:1.5;margin-bottom:0;">Bien cordialement,</p>
      <p style="font-size:16px;line-height:1.5;margin-top:6px;">
        <strong>Sébastien PALETTI</strong><br>
        <span style="color:#5a6b5e;">Membre du conseil syndical — Copropriétaire (villa 10)<br>
        Copropriété « La Pinède de Notre-Dame », Gardanne</span>
      </p>

    </div>

    <div style="background:#f4f6f4;color:#5f6b62;font-size:12px;padding:14px 32px;line-height:1.5;">
      Aucune pièce jointe : toute l'aide est en ligne dans l'application, via le bouton « ? » (menu Aide).
    </div>

  </div>
</body>
</html>
```

---

## Check-list de conformité (exigences Sébastien)

- [x] Brouillon Gmail uniquement — envoi sur autorisation explicite ultérieure
- [x] Destinataires = les 9 emails du CS (liste explicite, sans Burlando)
- [x] Mention explicite : l'IA a été largement utilisée pour créer l'app, la doc et ce mail
- [x] Disponibilité en personne : sebastien.paletti@gmail.com / 06 78 97 59 28
- [x] Semaine de test (27/11 → 04/12) + « dites-moi si ça vous est utile »
- [x] Nettoyage à l'issue de la semaine → jouer librement ensuite
- [x] Email configuré sur le compte → mails possibles même en démo
- [x] Bloc « comment se connecter » dans le mail (email + lien de réinitialisation individuel, valable 24 h, aucun mot de passe en clair)
- [x] « J'ai créé » (pas d'équivoque sur l'auteur, plus de « nous », sans « initiative personnelle »)
- [x] Plus d'emoji sapin ; mise en forme HTML conservée (couleurs validées par Sébastien) + revue UX (préheader, contrastes, CTA unique, CSS inline)
- [x] Signature Sébastien PALETTI
- [x] Aucune PJ : aide en ligne dans l'app (bouton « ? » contextuel), page « Mon logement » pour le rattachement pendant les tests
- [x] Données de test réalistes (`npm run seed:realiste`) + lots peuplés
