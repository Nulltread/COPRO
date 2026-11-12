const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-smoke-'));
  process.env.DB_PATH = path.join(dir, 'smoke.db');
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  require('../src/db/seed').seed();
  const { createApp } = require('../src/app');
  const app = createApp();
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const cookies = {};
  async function req(methode, url, body) {
    const headers = {};
    const ch = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (ch) headers.cookie = ch;
    let payload;
    if (body) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
    const res = await fetch(base + url, { method: methode, headers, body: payload, redirect: 'manual' });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const i = pair.indexOf('=');
      cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
    return res;
  }

  const checks = [];
  const login = await req('POST', '/connexion', { email: 'conseil1@copro.local', motdepasse: 'demo1234' });
  checks.push(['login membre CS', login.status === 302]);
  checks.push(['GET /tickets', (await req('GET', '/tickets')).status === 200]);
  const t1 = await req('GET', '/tickets/1');
  checks.push(['GET /tickets/1', t1.status === 200]);
  checks.push(['titre présent', (await t1.text()).includes('Fuite')]);
  checks.push(['tableau de bord CS', (await req('GET', '/tableau-de-bord')).status === 200]);
  checks.push(['page comptes CS', (await req('GET', '/admin/comptes')).status === 200]);
  checks.push(['page rattachements CS', (await req('GET', '/rattachements')).status === 200]);
  checks.push(['profil', (await req('GET', '/profil')).status === 200]);
  checks.push(['notifications', (await req('GET', '/notifications')).status === 200]);
  checks.push(['nouveau ticket (form)', (await req('GET', '/tickets/nouveau')).status === 200]);
  const formCS = await (await req('GET', '/tickets/nouveau')).text();
  checks.push(['form CS inclut parties communes', formCS.includes('Parties communes')]);

  const ca = await req('POST', '/connexion', { email: 'admin@copro.local', motdepasse: 'demo1234' });
  checks.push(['login admin unique', ca.status === 302]);
  checks.push(['admin voit comptes', (await req('GET', '/admin/comptes')).status === 200]);
  checks.push(['plus de page admin/unites (référentiel en dur)', (await req('GET', '/admin/unites')).status === 404]);

  const r = await req('POST', '/connexion', { email: 'resident1@copro.local', motdepasse: 'demo1234' });
  checks.push(['login résident', r.status === 302]);
  const listeDefaut = await (await req('GET', '/tickets')).text();
  checks.push(['filtre défaut = ses unités (voit Fuite)', listeDefaut.includes('Fuite')]);
  checks.push(['filtre défaut masque villa 20/21', !listeDefaut.includes('Infiltration plafond')]);
  const listeToutes = await (await req('GET', '/tickets?unite=toutes')).text();
  checks.push(['lecture ouverte : voit le ticket villa 20/21', listeToutes.includes('Infiltration plafond')]);
  checks.push(['lecture ouverte : détail ticket villa 20/21', (await req('GET', '/tickets/5')).status === 200]);
  const formRes = await (await req('GET', '/tickets/nouveau')).text();
  checks.push(['form résident sans parties communes', !formRes.includes('Parties communes')]);
  checks.push(['page rattachements résident', (await req('GET', '/rattachements')).status === 200]);

  // compte en attente de rattachement : peut se connecter mais pas créer de ticket
  const att = await req('POST', '/connexion', { email: 'attente@copro.local', motdepasse: 'demo1234' });
  checks.push(['login compte sans unité validée', att.status === 302]);
  const nv = await req('POST', '/tickets', { titre: 'Non autorisé', categorie: 'Autre', unite_ids: String(await (async () => { const { getDb } = require('../src/db'); return getDb().prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id; })()) });
  checks.push(['pas de ticket sans unité validée', nv.status === 403]);
  const listeAttente = await (await req('GET', '/tickets?unite=toutes')).text();
  checks.push(['sans unité validée : aucun ticket visible', !listeAttente.includes('Fuite') && !listeAttente.includes('Chaudière')]);
  checks.push(['sans unité validée : détail ticket introuvable', (await req('GET', '/tickets/1')).status === 404]);

  let ok = true;
  for (const [nom, res] of checks) { console.log((res ? 'OK  ' : 'FAIL') + ' ' + nom); if (!res) ok = false; }
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
