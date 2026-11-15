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
      });
    });
  });

  // --- Modale de confirmation générique (form[data-confirm]) ---
  var modale = document.getElementById('modale');
  if (modale) {
    var modaleTitre = document.getElementById('modale-titre');
    var modaleTexte = document.getElementById('modale-texte');
    var modaleConfirmer = document.getElementById('modale-confirmer');
    var modaleAnnuler = document.getElementById('modale-annuler');
    var formEnAttente = null;
    var fermerModale = function () { modale.hidden = true; formEnAttente = null; };
    modaleAnnuler.addEventListener('click', fermerModale);
    modale.addEventListener('click', function (e) { if (e.target === modale) fermerModale(); });
    modaleConfirmer.addEventListener('click', function () {
      var f = formEnAttente;
      fermerModale();
      if (f) { f.dataset.confirme = '1'; f.submit(); }
    });
    document.querySelectorAll('form[data-confirm]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        if (form.dataset.confirme === '1') return;
        e.preventDefault();
        modaleTitre.textContent = form.dataset.confirmTitre || 'Confirmer ?';
        modaleTexte.textContent = form.dataset.confirm || '';
        formEnAttente = form;
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

  // --- Unités du ticket : un clic = sélection + persistance immédiate (spec 27) ---
  var unitesEdit = document.getElementById('unites-edit');
  if (unitesEdit) {
    var etatU = document.getElementById('unites-etat');
    var puces = Array.prototype.slice.call(unitesEdit.querySelectorAll('.unite-pill'));
    puces.forEach(function (p) {
      p.addEventListener('click', function () {
        p.classList.toggle('selectionne');
        var ids = puces.filter(function (x) { return x.classList.contains('selectionne'); }).map(function (x) { return x.dataset.id; });
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
    });
  }

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
})();
