const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let server, base, dbDir;

function tmpEnv() {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-docs-test-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
}

async function client() {
  const cookies = {};
  return {
    async req(methode, url, body, formData) {
      const headers = {};
      const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
      if (cookieHeader) headers.cookie = cookieHeader;
      let payload;
      if (formData) payload = formData;
      else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
      const res = await fetch(base + url, { method: methode, headers, body: payload, redirect: 'manual' });
      for (const sc of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
        const [pair] = sc.split(';');
        const idx = pair.indexOf('=');
        cookies[pair.slice(0, idx)] = pair.slice(idx + 1);
      }
      return res;
    },
    cookies
  };
}

async function login(c, email, mdp) {
  return c.req('POST', '/connexion', { email, motdepasse: mdp });
}

let ids = {};

before(async () => {
  tmpEnv();
  const { getDb } = require('../src/db');
  const { hashPassword } = require('../src/auth');
  const db = getDb();
  const insU = db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)');
  ids.villa1 = insU.run('villa', 1, 'Villa 1').lastInsertRowid;
  ids.villa2 = insU.run('villa', 2, 'Villa 2').lastInsertRowid;
  ids.communes = insU.run('communes', null, 'Parties communes').lastInsertRowid;
  const mdp = hashPassword('motdepasse1');
  const insUser = db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?,?,?,?,?,?,?,?,1)');
  ids.admin = insUser.run('admin@test.local', mdp, 'Admin', 'Admin', '0600', 'admin', 0, 'actif').lastInsertRowid;
  ids.cs = insUser.run('cs@test.local', mdp, 'Conseil', 'Claire', '0601', 'resident', 1, 'actif').lastInsertRowid;
  ids.r1 = insUser.run('r1@test.local', mdp, 'Resident 1', 'Jean', '0602', 'resident', 0, 'actif').lastInsertRowid;
  ids.r2 = insUser.run('r2@test.local', mdp, 'Resident 2', 'Marie', '0603', 'resident', 0, 'actif').lastInsertRowid;
  ids.sansUnite = insUser.run('sansunite@test.local', mdp, 'Sans Unite', 'Sam', '0604', 'resident', 0, 'actif').lastInsertRowid;
  const insRes = db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?,?,?)');
  insRes.run(ids.villa1, ids.r1, 'proprietaire');
  insRes.run(ids.villa2, ids.r2, 'proprietaire');
  insRes.run(ids.communes, ids.cs, 'proprietaire');

  const { createApp } = require('../src/app');
  const app = createApp();
  await new Promise(resolve => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); fs.rmSync(dbDir, { recursive: true, force: true }); });

function db() { return require('../src/db').getDb(); }

function formDoc(fichiers, champs) {
  const form = new FormData();
  for (const [nom, blob, filename] of fichiers) form.append('fichiers', blob, filename);
  for (const [k, v] of Object.entries(champs)) {
    if (Array.isArray(v)) v.forEach(x => form.append(k, x));
    else form.append(k, v);
  }
  return form;
}

function pdf(name = 'contrat.pdf', contenu = 'PDF factice') {
  return [name, new Blob([contenu], { type: 'application/pdf' }), name];
}

async function uploadDoc(c, fichiers, champs) {
  return c.req('POST', '/documents', undefined, formDoc(fichiers, champs));
}

test('upload reserve au CS/admin : resident 403 sur le formulaire et sur POST', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  assert.strictEqual((await r1.req('GET', '/documents/nouveau')).status, 403);
  assert.strictEqual((await uploadDoc(r1, [pdf()], { categorie: 'juridique', niveau: 'commun' })).status, 403);
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  assert.strictEqual((await cs.req('GET', '/documents/nouveau')).status, 200);
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  assert.strictEqual((await admin.req('GET', '/documents/nouveau')).status, 200);
});

test('upload CS : categorie + niveau obligatoires, multi-fichiers, tags crees a la volee, fichier sur disque', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  // sans categorie -> 400, rien en base
  const ko = await uploadDoc(cs, [pdf()], { niveau: 'commun' });
  assert.strictEqual(ko.status, 400);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM documents').get().n, 0);
  // upload multiple : 2 fichiers, categorie instances, niveau commun, 2 nouveaux tags
  const res = await uploadDoc(cs, [pdf('pv-ag-2025.pdf'), pdf('convocation-ag.pdf')], {
    categorie: 'instances', niveau: 'commun', tags: ['AG 2025', 'convocation']
  });
  assert.strictEqual(res.status, 302);
  const docs = db().prepare("SELECT * FROM documents WHERE categorie='instances' ORDER BY id").all();
  assert.strictEqual(docs.length, 2);
  assert.strictEqual(docs[0].niveau, 'commun');
  assert.strictEqual(docs[0].auteur_id, ids.cs);
  assert.ok(docs.every(d => fs.existsSync(path.join(process.env.UPLOAD_DIR, d.nom_stockage))));
  const tags = db().prepare("SELECT nom FROM tags ORDER BY nom").all().map(t => t.nom);
  assert.deepStrictEqual(tags, ['AG 2025', 'convocation']);
  const nbLiens = db().prepare('SELECT COUNT(*) AS n FROM document_tags').get().n;
  assert.strictEqual(nbLiens, 4); // 2 tags x 2 documents
  ids.docCommun = docs[0].id;
});

test('PDF > 2 Mo refuse ; image > 2 Mo compressee automatiquement sous 2 Mo (sharp)', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  const grosPdf = new Blob([new Uint8Array(2 * 1024 * 1024 + 100)], { type: 'application/pdf' });
  const ko = await uploadDoc(cs, [['gros.pdf', grosPdf, 'gros.pdf']], { categorie: 'comptable', niveau: 'commun' });
  assert.strictEqual(ko.status, 400);
  assert.strictEqual(db().prepare("SELECT COUNT(*) AS n FROM documents WHERE titre='gros.pdf'").get().n, 0);

  // image JPEG bruitee ~7 Mo > 2 Mo
  const sharp = require('sharp');
  const grosse = await sharp({ create: { width: 3000, height: 3000, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .jpeg({ quality: 95 }).toBuffer();
  assert.ok(grosse.length > 2 * 1024 * 1024);
  const res = await uploadDoc(cs, [['scan-ocr.jpg', new Blob([grosse], { type: 'image/jpeg' }), 'scan-ocr.jpg']], {
    categorie: 'technique', niveau: 'controle'
  });
  assert.strictEqual(res.status, 302);
  const doc = db().prepare("SELECT * FROM documents WHERE titre='scan-ocr.jpg'").get();
  assert.ok(doc, 'document image enregistre');
  assert.ok(doc.taille <= 2 * 1024 * 1024, `compresse sous 2 Mo (taille=${doc.taille})`);
  assert.strictEqual(doc.mime, 'image/jpeg');
  const surDisque = fs.statSync(path.join(process.env.UPLOAD_DIR, doc.nom_stockage)).size;
  assert.ok(surDisque <= 2 * 1024 * 1024);
  ids.docControle = doc.id;
});

test('niveaux d\'acces : commun visible par tous, controle CS/admin seuls, prive = residents de l\'unite + admin', async () => {
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  // prive sur villa 2
  const res = await uploadDoc(cs, [pdf('decompte-villa2.pdf')], {
    categorie: 'comptable', niveau: 'prive', unit_id: String(ids.villa2), tags: ['privé']
  });
  assert.strictEqual(res.status, 302);
  const docPrive = db().prepare("SELECT * FROM documents WHERE titre='decompte-villa2.pdf'").get();
  assert.strictEqual(docPrive.niveau, 'prive');
  assert.strictEqual(docPrive.unit_id, ids.villa2);
  ids.docPrive = docPrive.id;
  // niveau prive sans unite -> 400
  const ko = await uploadDoc(cs, [pdf('x.pdf')], { categorie: 'comptable', niveau: 'prive' });
  assert.strictEqual(ko.status, 400);

  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const r2 = await client(); await login(r2, 'r2@test.local', 'motdepasse1');
  const admin = await client(); await login(admin, 'admin@test.local', 'motdepasse1');
  const sansUnite = await client(); await login(sansUnite, 'sansunite@test.local', 'motdepasse1');

  // commun : visible par r1, pas par le compte sans unite
  const listeR1 = await (await r1.req('GET', '/documents')).text();
  assert.ok(listeR1.includes('pv-ag-2025.pdf'));
  const listeSans = await (await sansUnite.req('GET', '/documents')).text();
  assert.ok(!listeSans.includes('pv-ag-2025.pdf'));
  assert.strictEqual((await r1.req('GET', `/documents/${ids.docCommun}/fichier`)).status, 200);
  const f = await r1.req('GET', `/documents/${ids.docCommun}/fichier`);
  assert.strictEqual(f.headers.get('x-content-type-options'), 'nosniff');
  assert.ok((f.headers.get('content-disposition') || '').startsWith('inline;'));

  // controle : invisible pour r1/r2/sansUnite, visible CS + admin
  assert.ok(!listeR1.includes('scan-ocr.jpg'));
  assert.strictEqual((await r1.req('GET', `/documents/${ids.docControle}`)).status, 404);
  assert.strictEqual((await r1.req('GET', `/documents/${ids.docControle}/fichier`)).status, 404);
  const listeCs = await (await cs.req('GET', '/documents')).text();
  assert.ok(listeCs.includes('scan-ocr.jpg'));
  assert.strictEqual((await cs.req('GET', `/documents/${ids.docControle}/fichier`)).status, 200);
  assert.strictEqual((await admin.req('GET', `/documents/${ids.docControle}/fichier`)).status, 200);

  // prive (villa 2) : r2 oui, r1 non, CS non (pas resident de villa 2), admin oui
  assert.strictEqual((await r2.req('GET', `/documents/${ids.docPrive}/fichier`)).status, 200);
  assert.strictEqual((await r1.req('GET', `/documents/${ids.docPrive}/fichier`)).status, 404);
  assert.strictEqual((await cs.req('GET', `/documents/${ids.docPrive}/fichier`)).status, 404);
  assert.strictEqual((await admin.req('GET', `/documents/${ids.docPrive}/fichier`)).status, 200);
  assert.strictEqual((await sansUnite.req('GET', `/documents/${ids.docPrive}/fichier`)).status, 404);
});

test('tags : edition reservee au gestionnaire ; les autres voient en lecture seule', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  // resident : 403 sur la modification des tags, et la fiche n'a pas de formulaire de tags
  assert.strictEqual((await r1.req('POST', `/documents/${ids.docCommun}/tags`, { tags: ['bidon'] })).status, 403);
  const ficheR1 = await (await r1.req('GET', `/documents/${ids.docCommun}`)).text();
  assert.ok(!ficheR1.includes('id="tags-edit"'));
  assert.ok(ficheR1.includes('AG 2025')); // lecture seule
  // CS : remplace les tags (1 existant + 1 nouveau)
  const tagId = db().prepare("SELECT id FROM tags WHERE nom='AG 2025'").get().id;
  const res = await cs.req('POST', `/documents/${ids.docCommun}/tags`, { tags: [String(tagId), 'nouveau tag'] });
  assert.strictEqual(res.status, 302);
  const noms = db().prepare('SELECT t.nom FROM document_tags dt JOIN tags t ON t.id=dt.tag_id WHERE dt.document_id=? ORDER BY t.nom').all(ids.docCommun).map(t => t.nom);
  assert.deepStrictEqual(noms, ['AG 2025', 'nouveau tag']);
  const ficheCs = await (await cs.req('GET', `/documents/${ids.docCommun}`)).text();
  assert.ok(ficheCs.includes('id="tags-edit"'));
  assert.ok(ficheCs.includes('data-creer="1"'));
});

test('devis et factures des tickets dans la liste, photos exclues (spec 34)', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  // ticket + consultation + devis + facture + photo
  const tid = db().prepare("INSERT INTO tickets (titre, description, etape, auteur_id) VALUES ('Travaux toit','desc','consultation',?)").run(ids.r1).lastInsertRowid;
  db().prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?,?)').run(tid, ids.villa1);
  const eid = db().prepare('INSERT INTO entreprises (raison_sociale) VALUES (?)').run('Toit SARL').lastInsertRowid;
  const cid = db().prepare('INSERT INTO consultations (ticket_id, entreprise_id, auteur_id) VALUES (?,?,?)').run(tid, eid, ids.cs).lastInsertRowid;
  db().prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, consultation_id, auteur_id) VALUES (?, 'devis', 'devis-toit.pdf', 'x1.pdf', 'application/pdf', 10, 900, ?, ?)").run(tid, cid, ids.cs);
  db().prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, auteur_id) VALUES (?, 'facture', 'facture-toit.pdf', 'x2.pdf', 'application/pdf', 10, 900, ?)").run(tid, ids.cs);
  db().prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, auteur_id) VALUES (?, 'photo', 'photo-toit.png', 'x3.png', 'image/png', 10, ?)").run(tid, ids.r1);

  const liste = await (await r1.req('GET', '/documents')).text();
  assert.ok(liste.includes('devis-toit.pdf'));
  assert.ok(liste.includes('facture-toit.pdf'));
  assert.ok(liste.includes(`ticket #${tid}`));
  assert.ok(!liste.includes('photo-toit.png'));
  // filtre categorie=devis : seulement les devis de tickets
  const listeDevis = await (await r1.req('GET', '/documents?categorie=devis')).text();
  assert.ok(listeDevis.includes('devis-toit.pdf'));
  assert.ok(!listeDevis.includes('facture-toit.pdf'));
  assert.ok(!listeDevis.includes('pv-ag-2025.pdf'));
  // filtre categorie=instances : seulement les documents du depot de cette categorie
  const listeInst = await (await r1.req('GET', '/documents?categorie=instances')).text();
  assert.ok(listeInst.includes('pv-ag-2025.pdf'));
  assert.ok(!listeInst.includes('devis-toit.pdf'));
  // filtre par tag
  const tagId = db().prepare("SELECT id FROM tags WHERE nom='AG 2025'").get().id;
  const listeTag = await (await r1.req('GET', '/documents?tag=' + tagId)).text();
  assert.ok(listeTag.includes('pv-ag-2025.pdf'));
  assert.ok(!listeTag.includes('devis-toit.pdf')); // les fichiers tickets n'ont pas de tags
  // compte sans unite : aucun fichier de ticket visible
  const sansUnite = await client(); await login(sansUnite, 'sansunite@test.local', 'motdepasse1');
  const listeSans = await (await sansUnite.req('GET', '/documents')).text();
  assert.ok(!listeSans.includes('devis-toit.pdf'));
});

test('recherche sur le titre + UI (champ recherche, data-recherche, nav Documents + burger)', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const page = await (await r1.req('GET', '/documents')).text();
  assert.ok(page.includes('id="recherche-documents"'));
  assert.ok(page.includes('id="liste-documents"'));
  assert.ok(page.includes('data-recherche="pv-ag-2025.pdf"'));
  assert.ok(page.includes('id="filtres-documents"'));
  assert.ok(page.includes('id="filtre-tags"'));
  assert.ok(page.includes('name="categorie"'));
  // nav : lien Documents + burger + panneau
  const tickets = await (await r1.req('GET', '/tickets')).text();
  assert.ok(tickets.includes('href="/documents"'));
  assert.ok(tickets.includes('id="menu-burger"'));
  assert.ok(tickets.includes('id="menu-panneau"'));
  const appjs = await (await r1.req('GET', '/app.js')).text();
  assert.ok(appjs.includes("getElementById('menu-burger')"));
  assert.ok(appjs.includes("getElementById('recherche-documents')"));
  assert.ok(appjs.includes('data-creer="1"'));
  assert.ok(appjs.includes('compresserImagePoids'));
  const css = await (await r1.req('GET', '/style.css')).text();
  assert.ok(css.includes('.menu-panneau'));
  assert.ok(css.includes('@media (min-width: 900px)'));
  assert.ok(css.includes('.tag-niveau-prive'));
});

test('suppression : resident 403, CS supprime (ligne + fichier disque + tags)', async () => {
  const r1 = await client(); await login(r1, 'r1@test.local', 'motdepasse1');
  const cs = await client(); await login(cs, 'cs@test.local', 'motdepasse1');
  assert.strictEqual((await r1.req('POST', `/documents/${ids.docCommun}/supprimer`)).status, 403);
  const doc = db().prepare('SELECT * FROM documents WHERE id=?').get(ids.docCommun);
  const chemin = path.join(process.env.UPLOAD_DIR, doc.nom_stockage);
  assert.ok(fs.existsSync(chemin));
  const res = await cs.req('POST', `/documents/${ids.docCommun}/supprimer`);
  assert.strictEqual(res.status, 302);
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM documents WHERE id=?').get(ids.docCommun).n, 0);
  assert.ok(!fs.existsSync(chemin));
  assert.strictEqual(db().prepare('SELECT COUNT(*) AS n FROM document_tags WHERE document_id=?').get(ids.docCommun).n, 0);
});
