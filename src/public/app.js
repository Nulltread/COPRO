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
})();
