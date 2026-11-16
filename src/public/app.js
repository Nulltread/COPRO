(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
    afficherInstall();
  });
  window.addEventListener('appinstalled', function () {
    deferredInstall = null;
    afficherInstall();
  });

  function estStandalone() {
    return (window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches))
      || window.navigator.standalone === true;
  }

  function afficherInstall() {
    var bloc = document.getElementById('install-etat');
    if (!bloc) return;
    bloc.innerHTML = '';
    if (estStandalone()) {
      bloc.innerHTML = '<p class="info">✅ L\'application est déjà sur votre écran d\'accueil.</p>';
      return;
    }
    if (deferredInstall) {
      var bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'bouton';
      bouton.textContent = '➕ Ajouter à l\'écran d\'accueil';
      bouton.addEventListener('click', function () {
        deferredInstall.prompt();
        deferredInstall.userChoice.then(function () {
          deferredInstall = null;
          afficherInstall();
        });
      });
      bloc.appendChild(bouton);
      return;
    }
    var ua = navigator.userAgent || '';
    var estIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
    if (estIOS) {
      bloc.innerHTML = '<ol class="aide install-etapes">'
        + '<li>Appuyez sur le bouton <strong>Partager</strong> ⎋ en bas de l\'écran.</li>'
        + '<li>Faites défiler et choisissez <strong>« Sur l\'écran d\'accueil »</strong>.</li>'
        + '</ol>';
    } else {
      bloc.innerHTML = '<p class="aide">Ouvrez le menu de votre navigateur (⋮) puis choisissez '
        + '<strong>« Ajouter à l\'écran d\'accueil »</strong> ou <strong>« Installer l\'application »</strong>.</p>';
    }
  }
  afficherInstall();

  function compresserImage(file, maxDim, qualite) {
    return new Promise(function (resolve) {
      if (!file.type.startsWith('image/')) return resolve(file);
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        if (type === 'image/png' && file.size < 500 * 1024) return resolve(file);
        canvas.toBlob(function (blob) {
          if (!blob) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg'), { type: type }));
        }, type, qualite);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  document.querySelectorAll('input[type=file][multiple]').forEach(function (champ) {
    var conteneur = champ.closest('form').querySelector('.apercu');

    function retirerFichier(index) {
      var dt = new DataTransfer();
      Array.prototype.forEach.call(champ.files, function (f, i) {
        if (i !== index) dt.items.add(f);
      });
      champ.files = dt.files;
      afficherApercu();
    }

    function afficherApercu() {
      if (!conteneur) return;
      conteneur.innerHTML = '';
      Array.prototype.forEach.call(champ.files, function (f, i) {
        if (!f.type.startsWith('image/')) return;
        var miniature = document.createElement('div');
        miniature.className = 'miniature';
        var img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.alt = f.name;
        var poubelle = document.createElement('button');
        poubelle.type = 'button';
        poubelle.className = 'poubelle';
        poubelle.textContent = '🗑';
        poubelle.title = 'Supprimer cette photo';
        poubelle.addEventListener('click', function () { retirerFichier(i); });
        miniature.appendChild(img);
        miniature.appendChild(poubelle);
        conteneur.appendChild(miniature);
      });
    }

    champ.addEventListener('change', function () {
      Promise.all(Array.prototype.map.call(champ.files, function (f) {
        return compresserImage(f, 1600, 0.8);
      })).then(function (compresses) {
        var dt = new DataTransfer();
        compresses.forEach(function (f) { dt.items.add(f); });
        champ.files = dt.files;
        afficherApercu();
        var formAuto = champ.closest('form');
        if (formAuto && formAuto.hasAttribute('data-autosubmit-photos')) {
          montrerOverlay();
          formAuto.requestSubmit();
        }
      });
    });
  });

  // --- Overlay de chargement (voile grisé + serpent tournant, spec 32) ---
  function montrerOverlay() {
    var o = document.getElementById('overlay-chargement');
    if (o) o.hidden = false;
  }
  document.querySelectorAll('form:not([data-autosave])').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (form.dataset.confirme === '1') { montrerOverlay(); return; }
      var s = e.submitter;
      if (form.dataset.confirm || (s && s.dataset.confirm)) return; // la modale de confirmation passe d'abord
      montrerOverlay();
    });
  });

  // --- Modale de confirmation générique (form[data-confirm] ou bouton submitter[data-confirm]) ---
  var modale = document.getElementById('modale');
  if (modale) {
    var modaleTitre = document.getElementById('modale-titre');
    var modaleTexte = document.getElementById('modale-texte');
    var modaleConfirmer = document.getElementById('modale-confirmer');
    var modaleAnnuler = document.getElementById('modale-annuler');
    var formEnAttente = null;
    var submitterEnAttente = null;
    var fermerModale = function () { modale.hidden = true; formEnAttente = null; submitterEnAttente = null; };
    modaleAnnuler.addEventListener('click', fermerModale);
    modale.addEventListener('click', function (e) { if (e.target === modale) fermerModale(); });
    modaleConfirmer.addEventListener('click', function () {
      var f = formEnAttente;
      var s = submitterEnAttente;
      fermerModale();
      if (f) {
        f.dataset.confirme = '1';
        // spec 31 : conserver le bouton cliqué (formaction Accepter/Refuser)
        if (s && f.requestSubmit) f.requestSubmit(s); else f.submit();
      }
    });
    document.querySelectorAll('form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        if (form.dataset.confirme === '1') return;
        var submitter = e.submitter;
        var texte = (submitter && submitter.dataset.confirm) || form.dataset.confirm;
        var titre = (submitter && submitter.dataset.confirmTitre) || form.dataset.confirmTitre;
        if (!texte) return;
        // spec 31 : refus = au moins un commentaire (contenu du bilan) ou une photo
        var action = (submitter && submitter.getAttribute('formaction')) || form.getAttribute('action') || '';
        if (/\/refuser$/.test(action)) {
          var contenu = (form.querySelector('[name=contenu]') || { value: '' }).value.trim();
          var photos = form.querySelector('input[type=file][name=photos]');
          if (!contenu && (!photos || photos.files.length === 0)) {
            e.preventDefault();
            alert('Un commentaire ou au moins une photo est obligatoire pour refuser les travaux.');
            return;
          }
        }
        e.preventDefault();
        modaleTitre.textContent = titre || 'Confirmer ?';
        modaleTexte.textContent = texte;
        formEnAttente = form;
        submitterEnAttente = submitter || null;
        modale.hidden = false;
      });
    });
  }

  // --- Recherche à la volée sur la liste des comptes (spec 17) ---
  var rechercheComptes = document.getElementById('recherche-comptes');
  if (rechercheComptes) {
    var lignes = Array.prototype.slice.call(document.querySelectorAll('#liste-comptes li'));
    var aucun = document.getElementById('recherche-aucun');
    rechercheComptes.addEventListener('input', function () {
      var q = rechercheComptes.value.trim().toLowerCase();
      var visibles = 0;
      lignes.forEach(function (li) {
        var ok = !q || (li.dataset.recherche || li.textContent.toLowerCase()).indexOf(q) !== -1;
        li.style.display = ok ? '' : 'none';
        if (ok) visibles++;
      });
      if (aucun) aucun.hidden = visibles > 0;
    });
  }

  // --- Filtres des tickets : dropdowns custom (ouverture instantanée, 0 latence)
  //     + case « Urgents » qui soumet dès le clic. Au choix d'une option : submit. ---
  var filtres = document.getElementById('filtres-tickets');
  function fermerDropdowns() {
    document.querySelectorAll('.dropdown-liste').forEach(function (l) { l.hidden = true; });
    document.querySelectorAll('.dropdown-bouton').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  if (filtres) {
    var urgent = filtres.querySelector('input[type=checkbox]');
    if (urgent) urgent.addEventListener('change', function () { filtres.submit(); });
    filtres.querySelectorAll('.dropdown').forEach(function (dd) {
      var bouton = dd.querySelector('.dropdown-bouton');
      var liste = dd.querySelector('.dropdown-liste');
      var input = dd.querySelector('input[type=hidden]');
      var valeur = dd.querySelector('.dropdown-valeur');
      bouton.addEventListener('click', function (e) {
        e.stopPropagation();
        var etaitOuvert = !liste.hidden;
        fermerDropdowns();
        if (!etaitOuvert) { liste.hidden = false; bouton.setAttribute('aria-expanded', 'true'); }
      });
      dd.querySelectorAll('.dropdown-option').forEach(function (opt) {
        opt.addEventListener('click', function (e) {
          e.stopPropagation();
          input.value = opt.dataset.value;
          valeur.textContent = opt.textContent;
          dd.querySelectorAll('.dropdown-option').forEach(function (o) { o.classList.toggle('selectionne', o === opt); });
          fermerDropdowns();
          filtres.submit();
        });
      });
    });
    document.addEventListener('click', fermerDropdowns);
  }

  // --- Recherche plaintext des tickets : filtrage à la volée côté client ---
  // (pas de rechargement : le focus reste dans le champ pendant la saisie)
  var rechercheTickets = document.getElementById('recherche-tickets');
  if (rechercheTickets) {
    var cartes = Array.prototype.slice.call(document.querySelectorAll('#liste-tickets li'));
    var aucunTickets = document.getElementById('recherche-aucun-tickets');
    rechercheTickets.addEventListener('input', function () {
      var q = rechercheTickets.value.trim().toLowerCase();
      var visibles = 0;
      cartes.forEach(function (li) {
        var ok = !q || (li.dataset.recherche || '').indexOf(q) !== -1;
        li.style.display = ok ? '' : 'none';
        if (ok) visibles++;
      });
      if (aucunTickets) aucunTickets.hidden = visibles > 0 || cartes.length === 0;
    });
  }

  // --- Sauvegarde à la volée (autosave) des formulaires data-autosave (spec 26) ---
  document.querySelectorAll('form[data-autosave]').forEach(function (form) {
    var etat = form.querySelector('.autosave-etat');
    var timer = null;
    function sauver() {
      if (etat) etat.textContent = 'enregistrement…';
      var options = { method: 'POST' };
      if (form.querySelector('input[type=file]')) {
        options.body = new FormData(form); // multipart (photos éventuelles)
      } else {
        options.headers = { 'content-type': 'application/x-www-form-urlencoded' };
        options.body = new URLSearchParams(new FormData(form)).toString();
      }
      fetch(form.action, options)
        .then(function (r) { if (etat) etat.textContent = r.ok ? '✓ enregistré' : '⚠ non enregistré'; })
        .catch(function () { if (etat) etat.textContent = '⚠ non enregistré'; });
    }
    form.querySelectorAll('textarea, input[type=text]').forEach(function (champ) {
      champ.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(sauver, 600); });
    });
    var fichiers = form.querySelector('input[type=file]');
    if (fichiers) fichiers.addEventListener('change', function () { clearTimeout(timer); sauver(); });
  });

  // --- Unités du ticket : multiselect + persistance immédiate (spec 27/30), initialisé via initMultiselect ci-dessous ---
  var unitesEdit = document.getElementById('unites-edit');

  // --- Devis des consultations : un champ montant par fichier, même ordre ---
  document.querySelectorAll('input[type=file][data-montants]').forEach(function (champ) {
    var conteneur = document.getElementById(champ.dataset.montants);
    if (!conteneur) return;
    champ.addEventListener('change', function () {
      conteneur.innerHTML = '';
      Array.prototype.forEach.call(champ.files, function (f) {
        var label = document.createElement('label');
        label.textContent = 'Montant du devis « ' + f.name + ' » (€)';
        var input = document.createElement('input');
        input.type = 'number';
        input.name = 'devis_montant';
        input.min = '0.01';
        input.step = '0.01';
        input.required = true;
        input.placeholder = 'Montant (€)';
        label.appendChild(input);
        conteneur.appendChild(label);
      });
    });
  });

  // --- Multiselect « search » (spec 29/30) : champ texte + dropdown des 5 premiers
  //     résultats affinée à la saisie ; un clic ajoute une puce à gauche du texte. ---
  function initMultiselect(root, onChange) {
    var options = JSON.parse(root.dataset.options || '[]');
    var chips = root.querySelector('.multiselect-chips');
    var input = root.querySelector('input[type=search]');
    var liste = root.querySelector('.multiselect-liste');
    function selectionnes() {
      return Array.prototype.map.call(chips.querySelectorAll('.chip'), function (c) { return c.dataset.value; });
    }
    function fermer() { liste.hidden = true; }
    function ouvrir() {
      var q = input.value.trim().toLowerCase();
      var dispo = options.filter(function (o) {
        return selectionnes().indexOf(o.value) === -1 && (!q || o.label.toLowerCase().indexOf(q) !== -1);
      }).slice(0, 5);
      liste.innerHTML = '';
      if (dispo.length === 0) {
        var liVide = document.createElement('li');
        var bVide = document.createElement('button');
        bVide.type = 'button';
        bVide.className = 'dropdown-option';
        bVide.disabled = true;
        bVide.textContent = 'Aucun résultat';
        liVide.appendChild(bVide);
        liste.appendChild(liVide);
      }
      dispo.forEach(function (o) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dropdown-option';
        b.textContent = o.label;
        b.addEventListener('click', function (e) { e.stopPropagation(); ajouter(o); });
        li.appendChild(b);
        liste.appendChild(li);
      });
      liste.hidden = false;
    }
    function ajouter(o) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.dataset.value = o.value;
      chip.appendChild(document.createTextNode(o.label));
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-x';
      x.dataset.value = o.value;
      x.textContent = '×';
      x.setAttribute('aria-label', 'Retirer ' + o.label);
      chip.appendChild(x);
      chips.appendChild(chip);
      input.value = '';
      fermer();
      onChange(selectionnes());
    }
    function retirer(v) {
      var chip = chips.querySelector('.chip[data-value="' + v + '"]');
      if (chip) chip.remove();
      input.value = '';
      fermer();
      onChange(selectionnes());
    }
    chips.addEventListener('click', function (e) {
      var x = e.target.closest('.chip-x');
      if (x) { e.stopPropagation(); retirer(x.dataset.value); }
    });
    input.addEventListener('input', ouvrir);
    input.addEventListener('focus', ouvrir);
    input.addEventListener('click', function (e) { e.stopPropagation(); ouvrir(); });
    document.addEventListener('click', fermer);
  }

  // Filtre des unités de la liste des tickets (spec 29) : soumission du formulaire au changement.
  var filtreUnites = document.getElementById('filtre-unites');
  if (filtreUnites) {
    var msHidden = document.getElementById('unites-hidden');
    initMultiselect(filtreUnites, function (vals) {
      msHidden.innerHTML = '';
      vals.forEach(function (v) {
        var h = document.createElement('input');
        h.type = 'hidden';
        h.name = 'unite';
        h.value = v;
        msHidden.appendChild(h);
      });
      filtres.submit();
    });
  }

  // Unités de la fiche ticket (spec 27/30) : multiselect + persistance immédiate au changement.
  if (unitesEdit) {
    var etatU = document.getElementById('unites-etat');
    initMultiselect(unitesEdit, function (ids) {
      var params = new URLSearchParams();
      ids.forEach(function (id) { params.append('unite_ids', id); });
      if (etatU) etatU.textContent = 'enregistrement…';
      fetch(unitesEdit.dataset.action, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      }).then(function (r) {
        if (r.ok) { if (etatU) etatU.textContent = '✓ enregistré'; }
        else location.reload(); // refus : resynchroniser l'affichage
      }).catch(function () { location.reload(); });
    });
  }

  // --- Section consultations (spec 29) : bouton « ajouter » + modale « nouvelle entreprise » ---
  var btnAjouter = document.getElementById('btn-ajouter-consultation');
  var nouvelleConsultation = document.getElementById('nouvelle-consultation');
  if (btnAjouter && nouvelleConsultation) {
    btnAjouter.addEventListener('click', function () {
      nouvelleConsultation.hidden = !nouvelleConsultation.hidden;
      if (!nouvelleConsultation.hidden) nouvelleConsultation.scrollIntoView({ block: 'nearest' });
    });
  }
  var selectEntreprise = document.getElementById('select-entreprise');
  var modaleEntreprise = document.getElementById('modale-entreprise');
  if (selectEntreprise && modaleEntreprise) {
    var ficheNouvelle = document.getElementById('fiche-nouvelle-entreprise');
    function fermerModaleEntreprise() { modaleEntreprise.hidden = true; }
    document.getElementById('modale-entreprise-annuler').addEventListener('click', function () {
      selectEntreprise.value = '';
      fermerModaleEntreprise();
    });
    modaleEntreprise.addEventListener('click', function (e) {
      if (e.target === modaleEntreprise) { selectEntreprise.value = ''; fermerModaleEntreprise(); }
    });
    document.getElementById('modale-entreprise-valider').addEventListener('click', function () {
      var raison = document.getElementById('me-raison');
      if (!raison.value.trim()) { raison.focus(); return; }
      var champs = [
        ['nouvelle_raison_sociale', 'me-raison'],
        ['nouveau_siren_siret', 'me-siren'],
        ['nouveau_contact_nom', 'me-contact'],
        ['nouveau_telephone', 'me-tel'],
        ['nouveau_mail', 'me-mail']
      ];
      champs.forEach(function (paire) {
        var dest = ficheNouvelle.querySelector('input[name="' + paire[0] + '"]');
        var src = document.getElementById(paire[1]);
        if (dest && src) dest.value = src.value;
      });
      fermerModaleEntreprise();
    });
    selectEntreprise.addEventListener('change', function () {
      if (selectEntreprise.value === 'nouvelle') modaleEntreprise.hidden = false;
    });
  }
})();
