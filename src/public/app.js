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

  // Compression d'une image jusqu'a passer sous maxBytes (qualite puis
  // dimensions decroissantes, sortie JPEG) — utilisée pour les documents
  // (limite 2 Mo, spec 34) ; le serveur recompresse en garantie (sharp).
  function compresserImagePoids(file, maxBytes) {
    return new Promise(function (resolve) {
      if (!file.type.startsWith('image/')) return resolve(file);
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        var etapes = [[1, 0.8], [1, 0.6], [0.75, 0.65], [0.75, 0.45], [0.55, 0.55], [0.55, 0.35], [0.4, 0.45]];
        var i = 0;
        (function suivant() {
          if (i >= etapes.length) { resolve(file); return; }
          var s = etapes[i][0], q = etapes[i][1];
          i++;
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * s));
          canvas.height = Math.max(1, Math.round(h * s));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(function (blob) {
            if (blob && blob.size <= maxBytes) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
            } else suivant();
          }, 'image/jpeg', q);
        })();
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // Mosaïque d'ajout (photos ET devis) : tout input fichier dans un .bloc-photos.
  // Chaque miniature s'insère au début de la ligne, le carré « + » se déplace à droite ;
  // les carrés sont répartis équitablement sur la largeur (voir style.css).
  document.querySelectorAll('.bloc-photos input[type=file]').forEach(function (champ) {
    var bloc = champ.closest('.bloc-photos');
    var zone = bloc ? bloc.querySelector('label') : null;

    function retirerFichier(index) {
      var dt = new DataTransfer();
      Array.prototype.forEach.call(champ.files, function (f, i) {
        if (i !== index) dt.items.add(f);
      });
      champ.files = dt.files;
      afficherApercu();
    }

    function afficherApercu() {
      if (!bloc) return;
      bloc.querySelectorAll('.miniature').forEach(function (m) { m.remove(); });
      Array.prototype.forEach.call(champ.files, function (f, i) {
        var miniature = document.createElement('div');
        miniature.className = 'miniature' + (f.type.startsWith('image/') ? '' : ' miniature-fichier');
        if (f.type.startsWith('image/')) {
          var img = document.createElement('img');
          img.src = URL.createObjectURL(f);
          img.alt = f.name;
          miniature.appendChild(img);
        } else {
          // fichier non image (ex. PDF) : tuile explicite avec logo fichier + nom
          var icone = document.createElement('span');
          icone.className = 'miniature-fichier-icone';
          icone.setAttribute('aria-hidden', 'true');
          icone.textContent = '📄';
          var nom = document.createElement('span');
          nom.className = 'miniature-fichier-nom';
          nom.textContent = f.name;
          miniature.appendChild(icone);
          miniature.appendChild(nom);
        }
        var poubelle = document.createElement('button');
        poubelle.type = 'button';
        poubelle.className = 'poubelle';
        poubelle.textContent = '🗑';
        poubelle.title = 'Supprimer ce fichier';
        poubelle.addEventListener('click', function () { retirerFichier(i); });
        miniature.appendChild(poubelle);
        bloc.insertBefore(miniature, zone || bloc.firstChild);
      });
    }

    champ.addEventListener('change', function () {
      var maxPoids = Number(champ.dataset.compressMax || 0);
      Promise.all(Array.prototype.map.call(champ.files, function (f) {
        return compresserImage(f, 1600, 0.8).then(function (f2) {
          if (maxPoids && f2.size > maxPoids && f2.type.startsWith('image/')) return compresserImagePoids(f2, maxPoids);
          return f2;
        });
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

  // --- Filtres (tickets et documents) : dropdowns custom (ouverture instantanée,
  //     0 latence). Au choix d'une option : submit du formulaire concerné. ---
  function fermerDropdowns() {
    document.querySelectorAll('.dropdown-liste').forEach(function (l) { l.hidden = true; });
    document.querySelectorAll('.dropdown-bouton').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  function brancherDropdowns(formEl) {
    formEl.querySelectorAll('.dropdown').forEach(function (dd) {
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
          formEl.submit();
        });
      });
    });
  }
  document.addEventListener('click', fermerDropdowns);
  var filtres = document.getElementById('filtres-tickets');
  if (filtres) {
    var urgent = filtres.querySelector('input[type=checkbox]');
    if (urgent) urgent.addEventListener('change', function () { filtres.submit(); });
    brancherDropdowns(filtres);
  }
  // --- Filtres de la page Documents (spec 34) : catégorie (dropdown) + tags (multiselect) ---
  var filtresDocs = document.getElementById('filtres-documents');
  if (filtresDocs) {
    brancherDropdowns(filtresDocs);
    var filtreTags = document.getElementById('filtre-tags');
    if (filtreTags) {
      var tagsHidden = document.getElementById('tags-hidden');
      initMultiselect(filtreTags, function (vals) {
        tagsHidden.innerHTML = '';
        vals.forEach(function (v) {
          var h = document.createElement('input');
          h.type = 'hidden';
          h.name = 'tag';
          h.value = v;
          tagsHidden.appendChild(h);
        });
        filtresDocs.submit();
      });
    }
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

  // --- Recherche plaintext des documents (spec 34) : sur le titre, à la volée ---
  var rechercheDocs = document.getElementById('recherche-documents');
  if (rechercheDocs) {
    var lisDocs = Array.prototype.slice.call(document.querySelectorAll('#liste-documents li'));
    var aucunDocs = document.getElementById('recherche-aucun-documents');
    rechercheDocs.addEventListener('input', function () {
      var q = rechercheDocs.value.trim().toLowerCase();
      var visibles = 0;
      lisDocs.forEach(function (li) {
        var ok = !q || (li.dataset.recherche || '').indexOf(q) !== -1;
        li.style.display = ok ? '' : 'none';
        if (ok) visibles++;
      });
      if (aucunDocs) aucunDocs.hidden = visibles > 0 || lisDocs.length === 0;
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
      marquerObligatoires(conteneur);
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

  // --- Section consultations : formulaire d'ajout directement visible, un seul
  //     bouton « Ajouter » persiste les champs saisis (entreprise existante ou créée
  //     à la volée via la modale) en un seul envoi ---
  var selectEntreprise = document.getElementById('select-entreprise');
  var modaleEntreprise = document.getElementById('modale-entreprise');
  if (selectEntreprise && modaleEntreprise) {
    var ficheNouvelle = document.getElementById('fiche-nouvelle-entreprise');
    var optionNouvelle = selectEntreprise.querySelector('option[value="nouvelle"]');
    var texteOptionNouvelle = optionNouvelle ? optionNouvelle.textContent : '';
    function fermerModaleEntreprise() { modaleEntreprise.hidden = true; }
    function reinitialiserOptionNouvelle() {
      selectEntreprise.value = '';
      if (optionNouvelle) optionNouvelle.textContent = texteOptionNouvelle;
    }
    document.getElementById('modale-entreprise-annuler').addEventListener('click', function () {
      reinitialiserOptionNouvelle();
      fermerModaleEntreprise();
    });
    modaleEntreprise.addEventListener('click', function (e) {
      if (e.target === modaleEntreprise) { reinitialiserOptionNouvelle(); fermerModaleEntreprise(); }
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
      // retour visuel : l'option du sélecteur affiche la raison sociale saisie ;
      // la création effective a lieu à la soumission du formulaire (valeur 'nouvelle')
      if (optionNouvelle) optionNouvelle.textContent = '➕ ' + raison.value.trim() + ' (nouvelle entreprise)';
      fermerModaleEntreprise();
    });
    selectEntreprise.addEventListener('change', function () {
      if (selectEntreprise.value === 'nouvelle') modaleEntreprise.hidden = false;
      else if (optionNouvelle) optionNouvelle.textContent = texteOptionNouvelle;
    });
  }

  // --- Espace prestataire : ajout de lignes date/heure dans le formulaire de proposition ---
  var boutonAjouterDate = document.getElementById('ajouter-date');
  if (boutonAjouterDate) {
    boutonAjouterDate.addEventListener('click', function () {
      var conteneur = document.getElementById('lignes-dates');
      var modele = conteneur.querySelector('.ligne-date');
      if (!modele) return;
      var copie = modele.cloneNode(true);
      copie.querySelectorAll('input').forEach(function (i) { i.value = ''; });
      conteneur.appendChild(copie);
    });
  }

  // --- Menu burger responsive (spec nav) : panneau sous la barre en < 900 px ---
  var burger = document.getElementById('menu-burger');
  var panneau = document.getElementById('menu-panneau');
  if (burger && panneau) {
    function fermerMenu() { panneau.hidden = true; burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Ouvrir le menu'); }
    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      var ouvrir = panneau.hidden;
      panneau.hidden = !ouvrir;
      burger.setAttribute('aria-expanded', String(ouvrir));
      burger.setAttribute('aria-label', ouvrir ? 'Fermer le menu' : 'Ouvrir le menu');
    });
    panneau.addEventListener('click', function (e) { if (e.target.closest('a')) fermerMenu(); });
    document.addEventListener('click', function (e) {
      if (!panneau.hidden && !panneau.contains(e.target) && !burger.contains(e.target)) fermerMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panneau.hidden) { fermerMenu(); burger.focus(); }
    });
  }

  // --- Multiselect de tags AVEC création (spec 34) : champ texte + dropdown des
  //     tags existants affinés à la saisie ; si aucun ne correspond, une option
  //     « Créer « … » » ajoute un tag à la volée. Utilisé à l'upload et sur la
  //     fiche du document (édition réservée au gestionnaire, gérée côté serveur). ---
  function initTags(root) {
    var options = JSON.parse(root.dataset.options || '[]');
    var preselectionnes = JSON.parse(root.dataset.selected || '[]');
    var chips = root.querySelector('.multiselect-chips');
    var input = root.querySelector('input[type=search]');
    var liste = root.querySelector('.multiselect-liste');
    var hidden = root.querySelector('.multiselect-hidden');
    function valeurs() {
      return Array.prototype.map.call(chips.querySelectorAll('.chip'), function (c) { return c.dataset.value; });
    }
    function synchroniser() {
      hidden.innerHTML = '';
      valeurs().forEach(function (v) {
        var h = document.createElement('input');
        h.type = 'hidden';
        h.name = 'tags';
        h.value = v;
        hidden.appendChild(h);
      });
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
      liste.hidden = true;
      synchroniser();
    }
    preselectionnes.forEach(ajouter);
    synchroniser();
    chips.addEventListener('click', function (e) {
      var x = e.target.closest('.chip-x');
      if (x) { e.stopPropagation(); x.closest('.chip').remove(); synchroniser(); }
    });
    function ouvrir() {
      var q = input.value.trim().toLowerCase();
      var dispo = options.filter(function (o) {
        return valeurs().indexOf(o.value) === -1 && (!q || o.label.toLowerCase().indexOf(q) !== -1);
      }).slice(0, 5);
      liste.innerHTML = '';
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
      if (q && !options.some(function (o) { return o.label.toLowerCase() === q; })) {
        var liC = document.createElement('li');
        var bC = document.createElement('button');
        bC.type = 'button';
        bC.className = 'dropdown-option';
        bC.textContent = '➕ Créer « ' + input.value.trim() + ' »';
        bC.addEventListener('click', function (e) {
          e.stopPropagation();
          ajouter({ value: input.value.trim(), label: input.value.trim() });
        });
        liC.appendChild(bC);
        liste.appendChild(liC);
      }
      if (!liste.children.length) {
        var liVide = document.createElement('li');
        var bVide = document.createElement('button');
        bVide.type = 'button';
        bVide.className = 'dropdown-option';
        bVide.disabled = true;
        bVide.textContent = 'Aucun résultat';
        liVide.appendChild(bVide);
        liste.appendChild(liVide);
      }
      liste.hidden = false;
    }
    input.addEventListener('input', ouvrir);
    input.addEventListener('focus', ouvrir);
    input.addEventListener('click', function (e) { e.stopPropagation(); ouvrir(); });
  }
  document.querySelectorAll('.multiselect[data-creer="1"]').forEach(initTags);

  // --- Formulaire d'upload de documents : niveau « privé » => unité destinataire requise ---
  var selectNiveau = document.getElementById('niveau-doc');
  if (selectNiveau) {
    var labelUnite = document.getElementById('champ-unite-label');
    var selectUnite = document.getElementById('champ-unite');
    function majUnite() {
      var prive = selectNiveau.value === 'prive';
      if (labelUnite) labelUnite.hidden = !prive;
      if (selectUnite) selectUnite.required = prive;
    }
    selectNiveau.addEventListener('change', majUnite);
    majUnite();
  }

  // --- Étoile rouge sur tous les champs obligatoires, dans toute l'application ---
  function marquerObligatoires(root) {
    (root || document).querySelectorAll('label').forEach(function (label) {
      if (label.querySelector('.req') || !label.querySelector('[required]')) return;
      var etoile = document.createElement('span');
      etoile.className = 'req';
      etoile.setAttribute('aria-hidden', 'true');
      etoile.textContent = ' *';
      var walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT, null);
      var noeud = null, n;
      while ((n = walker.nextNode())) { if (n.textContent.trim()) { noeud = n; break; } }
      if (noeud) {
        var titre = document.createElement('span');
        titre.className = 'label-titre';
        noeud.parentNode.insertBefore(titre, noeud);
        titre.appendChild(noeud);
        titre.appendChild(etoile);
      } else {
        label.insertBefore(etoile, label.firstChild);
      }
    });
  }
  marquerObligatoires();
})();
