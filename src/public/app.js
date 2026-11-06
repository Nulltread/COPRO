(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }

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
    champ.addEventListener('change', function () {
      var conteneur = champ.closest('form').querySelector('.apercu');
      if (conteneur) {
        conteneur.innerHTML = '';
        Array.prototype.forEach.call(champ.files, function (f) {
          if (!f.type.startsWith('image/')) return;
          var img = document.createElement('img');
          img.src = URL.createObjectURL(f);
          conteneur.appendChild(img);
        });
      }
      Promise.all(Array.prototype.map.call(champ.files, function (f) {
        return compresserImage(f, 1600, 0.8);
      })).then(function (compresses) {
        var dt = new DataTransfer();
        compresses.forEach(function (f) { dt.items.add(f); });
        champ.files = dt.files;
      });
    });
  });

  var boutonPush = document.getElementById('bouton-push');
  if (boutonPush && 'serviceWorker' in navigator && 'PushManager' in window && window.VAPID_PUBLIC_KEY) {
    boutonPush.addEventListener('click', function () {
      navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: (function (b64) {
            var pad = b64.length % 4 ? '='.repeat(4 - b64.length % 4) : '';
            var bin = atob(b64 + pad);
            var arr = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr;
          })(window.VAPID_PUBLIC_KEY)
        });
      }).then(function (sub) {
        return fetch('/notifications/api/push/abonnement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON())
        });
      }).then(function () {
        document.getElementById('etat-push').textContent = 'Activées ✅';
      }).catch(function () {
        document.getElementById('etat-push').textContent = 'Activation refusée par le navigateur.';
      });
    });
  }
})();
