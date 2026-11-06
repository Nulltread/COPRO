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
  const login = await req('POST', '/connexion', { email: 'syndic@copro.local', motdepasse: 'demo1234' });
  checks.push(['login syndic', login.status === 302]);
  checks.push(['GET /tickets', (await req('GET', '/tickets')).status === 200]);
  const t1 = await req('GET', '/tickets/1');
  checks.push(['GET /tickets/1', t1.status === 200]);
  checks.push(['titre présent', (await t1.text()).includes('Fuite')]);
  checks.push(['tableau de bord', (await req('GET', '/tableau-de-bord')).status === 200]);
  const ca = await req('POST', '/connexion', { email: 'admin@copro.local', motdepasse: 'demo1234' });
  checks.push(['login admin', ca.status === 302]);
  checks.push(['admin unités (61 villas + 61 garages)', (await (await req('GET', '/admin/unites')).text()).split('Villa ').length >= 61]);
  const cs2 = await req('POST', '/connexion', { email: 'syndic@copro.local', motdepasse: 'demo1234' });
  checks.push(['admin comptes (syndic)', (await req('GET', '/admin/comptes')).status === 200]);
  checks.push(['profil', (await req('GET', '/profil')).status === 200]);
  checks.push(['notifications', (await req('GET', '/notifications')).status === 200]);
  checks.push(['nouveau ticket (form)', (await req('GET', '/tickets/nouveau')).status === 200]);

  const r = await req('POST', '/connexion', { email: 'resident1@copro.local', motdepasse: 'demo1234' });
  checks.push(['login résident', r.status === 302]);
  const liste = await (await req('GET', '/tickets')).text();
  checks.push(['résident voit ses tickets', liste.includes('Fuite')]);
  checks.push(['résident villa 1 ne voit pas ticket villa 20/21', !liste.includes('Infiltration plafond')]);
  const t5 = await req('GET', '/tickets/5');
  checks.push(['résident 1 bloqué sur ticket villa 20/21', t5.status === 404]);

  let ok = true;
  for (const [nom, res] of checks) { console.log((res ? 'OK  ' : 'FAIL') + ' ' + nom); if (!res) ok = false; }
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
