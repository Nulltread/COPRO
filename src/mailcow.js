// Synchronisation de la liste de diffusion conseil-syndical@domaine
// vers les adresses email VERIFIEES des membres actifs du conseil syndical.
// Appelée à chaque changement (statut CS, vérification d'email, suppression).
// Sans configuration API (MAILCOW_API_KEY), la synchro est ignorée.

const ALIAS = () => `conseil-syndical@${process.env.MAIL_DOMAIN || 'copro-pinede-gardanne.fr'}`;

function membresCSAvecEmailVerifie() {
  const { getDb } = require('./db');
  return getDb().prepare(
    "SELECT email FROM users WHERE conseil_syndical = 1 AND statut = 'actif' AND email_verifie = 1 ORDER BY email"
  ).all().map(r => r.email);
}

async function synchroniserAliasCS() {
  const apiUrl = process.env.MAILCOW_API_URL;
  const apiKey = process.env.MAILCOW_API_KEY;
  if (!apiUrl || !apiKey) return false;
  const destinations = membresCSAvecEmailVerifie();
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/v1/edit/alias`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: ALIAS(),
        destination: destinations,
        active: '1'
      })
    });
    if (!res.ok) {
      // L'alias n'existe pas encore : on le crée.
      const res2 = await fetch(`${apiUrl.replace(/\/$/, '')}/api/v1/add/alias`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: ALIAS(),
          destination: destinations.join(', '),
          active: '1'
        })
      });
      if (!res2.ok) throw new Error(`API Mailcow add/alias: ${res2.status}`);
    }
    return true;
  } catch (err) {
    console.error('Synchro alias conseil-syndical echouee :', err.message);
    return false;
  }
}

module.exports = { synchroniserAliasCS, membresCSAvecEmailVerifie, ALIAS };
