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
  checks.push(['page entreprises CS', (await req('GET', '/entreprises')).status === 200]);
  checks.push(['panneau admin interdit au CS', (await req('GET', '/admin')).status === 403]);
  checks.push(['page rattachements CS', (await req('GET', '/rattachements')).status === 200]);
  checks.push(['profil', (await req('GET', '/profil')).status === 200]);
  checks.push(['notifications', (await req('GET', '/notifications')).status === 200]);
  checks.push(['nouveau ticket (form)', (await req('GET', '/tickets/nouveau')).status === 200]);
  const formCS = await (await req('GET', '/tickets/nouveau')).text();
  checks.push(['form CS inclut parties communes', formCS.includes('Parties communes')]);

  const ca = await req('POST', '/connexion', { email: 'admin@copro.local', motdepasse: 'demo1234' });
  checks.push(['login admin unique', ca.status === 302]);
  checks.push(['admin voit comptes', (await req('GET', '/admin/comptes')).status === 200]);
  checks.push(['panneau admin', (await req('GET', '/admin')).status === 200]);
  checks.push(['plus de page admin/unites (référentiel en dur)', (await req('GET', '/admin/unites')).status === 404]);

  const r = await req('POST', '/connexion', { email: 'resident1@copro.local', motdepasse: 'demo1234' });
  checks.push(['login résident', r.status === 302]);
  const listeDefaut = await (await req('GET', '/tickets')).text();
  checks.push(['filtre défaut = ses unités (voit Fuite)', listeDefaut.includes('Fuite')]);
  const t3res = await (await req('GET', '/tickets/3')).text();
  checks.push(['ticket planifié : section Bilans masquée aux non-concernés', !t3res.includes('Bilans de l’intervention')]);
  checks.push(['filtre défaut masque villa 20/21', !listeDefaut.includes('Infiltration plafond')]);
  const listeToutes = await (await req('GET', '/tickets?unite=toutes')).text();
  checks.push(['lecture ouverte : voit le ticket villa 20/21', listeToutes.includes('Infiltration plafond')]);
  checks.push(['lecture ouverte : détail ticket villa 20/21', (await req('GET', '/tickets/5')).status === 200]);
  const formRes = await (await req('GET', '/tickets/nouveau')).text();
  checks.push(['form résident sans parties communes', !formRes.includes('Parties communes')]);
  checks.push(['page rattachements résident', (await req('GET', '/rattachements')).status === 200]);
  const profilRes = await (await req('GET', '/profil')).text();
  checks.push(['profil : contrôle custom des rattachements (type + n° + statut)', profilRes.includes('rattachement-pill')]);
  checks.push(['profil : plus de bouton "voir mes rattachements"', !profilRes.includes("Voir l'état de mes rattachements")]);
  // transition v2 : ticket 2 encore « créé » -> consultation par le CS
  const tr = await req('POST', '/connexion', { email: 'conseil1@copro.local', motdepasse: 'demo1234' });
  const pass = await req('POST', '/tickets/2/passer-consultation');
  checks.push(['transition créé -> consultation (CS)', pass.status === 302]);
  const t3 = await (await req('GET', '/tickets/3')).text();
  checks.push(['ticket planifié : boutons Accepter/Refuser visibles au CS', t3.includes('/accepter') && t3.includes('/refuser')]);
  checks.push(['ticket planifié : section Bilans de l’intervention', t3.includes('Bilans de l’intervention')]);
  const t4 = await (await req('GET', '/tickets/4')).text();
  checks.push(['ticket acceptés : plus de boutons Accepter/Refuser (lecture seule)', !t4.includes('/accepter') && !t4.includes('/refuser')]);

  // compte en attente de rattachement : peut se connecter mais pas créer de ticket
  const att = await req('POST', '/connexion', { email: 'attente@copro.local', motdepasse: 'demo1234' });
  checks.push(['login compte sans unité validée', att.status === 302]);
  const nv = await req('POST', '/tickets', { titre: 'Non autorisé', categorie: 'Autre', unite_ids: String(await (async () => { const { getDb } = require('../src/db'); return getDb().prepare("SELECT id FROM units WHERE type='villa' AND numero=1").get().id; })()) });
  checks.push(['pas de ticket sans unité validée', nv.status === 403]);
  const listeAttente = await (await req('GET', '/tickets?unite=toutes')).text();
  checks.push(['sans unité validée : aucun ticket visible', !listeAttente.includes('Fuite') && !listeAttente.includes('Chaudière')]);
  checks.push(['sans unité validée : détail ticket introuvable', (await req('GET', '/tickets/1')).status === 404]);

  // Page Documents (spec 34) : CS voit la page + le formulaire, le résident la page
  // mais pas le formulaire, les devis/factures de demo apparaissent, pas les photos.
  const csDocs = await req('POST', '/connexion', { email: 'conseil1@copro.local', motdepasse: 'demo1234' });
  checks.push(['login CS (documents)', csDocs.status === 302]);
  const pageDocs = await (await req('GET', '/documents')).text();
  checks.push(['page Documents (CS)', pageDocs.includes('id="liste-documents"')]);
  checks.push(['lien Documents dans la nav + burger', pageDocs.includes('href="/documents"') && pageDocs.includes('id="menu-burger"')]);
  checks.push(['formulaire ajout documents (CS)', (await req('GET', '/documents/nouveau')).status === 200]);
  checks.push(['devis de demo listés dans Documents', pageDocs.includes('devis-martin.pdf')]);
  checks.push(['facture de demo listée dans Documents', pageDocs.includes('facture-porte.pdf')]);
  const rDocs = await req('POST', '/connexion', { email: 'resident1@copro.local', motdepasse: 'demo1234' });
  checks.push(['login résident (documents)', rDocs.status === 302]);
  checks.push(['page Documents (résident)', (await req('GET', '/documents')).status === 200]);
  checks.push(['formulaire ajout documents interdit au résident', (await req('GET', '/documents/nouveau')).status === 403]);
  checks.push(['upload documents interdit au résident', (await req('POST', '/documents', {})).status === 403]);
  const attDocs = await req('POST', '/connexion', { email: 'attente@copro.local', motdepasse: 'demo1234' });
  checks.push(['login compte sans unité (documents)', attDocs.status === 302]);
  const pageAttente = await (await req('GET', '/documents')).text();
  checks.push(['sans unité validée : aucun document visible', !pageAttente.includes('devis-martin.pdf')]);

  let ok = true;
  for (const [nom, res] of checks) { console.log((res ? 'OK  ' : 'FAIL') + ' ' + nom); if (!res) ok = false; }
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
