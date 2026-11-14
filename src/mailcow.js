// Synchronisation de la liste de diffusion conseil-syndical@domaine
// vers les adresses email VERIFIEES des membres actifs du conseil syndical.
// Appelée à chaque changement (statut CS, vérification d'email, suppression).
// Sans configuration API (MAILCOW_API_KEY), la synchro est ignorée.
//
// L'API est appelée via la passerelle Docker du conteneur app (ex. 172.18.0.1:8443)
// avec le SNI mail.<domaine> pour valider le certificat.

const https = require('https');

const ALIAS = () => `conseil-syndical@${process.env.MAIL_DOMAIN || 'copro-pinede-gardanne.fr'}`;

function membresCSAvecEmailVerifie() {
  const { getDb } = require('./db');
  return getDb().prepare(
    "SELECT email FROM users WHERE conseil_syndical = 1 AND statut = 'actif' AND email_verifie = 1 ORDER BY email"
  ).all().map(r => r.email);
}

function apiPost(apiUrl, apiKey, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(apiUrl);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path,
      method: 'POST',
      servername: process.env.MAILCOW_TLS_SERVERNAME || `mail.${process.env.MAIL_DOMAIN || 'copro-pinede-gardanne.fr'}`,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(body))
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout API Mailcow')));
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function synchroniserAliasCS() {
  const apiUrl = process.env.MAILCOW_API_URL;
  const apiKey = process.env.MAILCOW_API_KEY;
  if (!apiUrl || !apiKey) return false;
  const membres = membresCSAvecEmailVerifie();
  // Alias jamais vide (l'API Mailcow refuse une destination vide) : adresse bidon
  // réservée, inexistante côté serveur, donc jamais délivrée ni stockée.
  const destinations = membres.length ? membres : [`liste-vide@${process.env.MAIL_DOMAIN || 'copro-pinede-gardanne.fr'}`];
  try {
    let res = await apiPost(apiUrl, apiKey, '/api/v1/edit/alias', {
      address: ALIAS(),
      destination: destinations,
      active: '1'
    });
    if (res.status === 404 || res.status === 400) {
      // L'alias n'existe pas encore : on le crée.
      res = await apiPost(apiUrl, apiKey, '/api/v1/add/alias', {
        address: ALIAS(),
        destination: destinations.join(', '),
        active: '1'
      });
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`API Mailcow: ${res.status} ${res.body.slice(0, 200)}`);
    return true;
  } catch (err) {
    console.error('Synchro alias conseil-syndical echouee :', err.message);
    return false;
  }
}

module.exports = { synchroniserAliasCS, membresCSAvecEmailVerifie, ALIAS };
