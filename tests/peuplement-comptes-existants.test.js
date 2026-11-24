const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let dbDir, db, peuplerDepuisCCG;

before(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-peupler2-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
  db = require('../src/db').getDb();
  ({ peuplerDepuisCCG } = require('../src/db/peupler-cle-repartition'));
  const { hashPassword } = require('../src/auth');
  const mdp = hashPassword('motdepasse1');
  const ins = db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?,?,?,?,?,?,?,?,?)');
  // vieux comptes existants (ex. provisionnés en prod avant le peuplement)
  ins.run('admin@copro.local', mdp, 'Paletti', 'Sébastien', '0600', 'admin', 0, 'actif', 1); // admin : jamais propriétaire d'un lot
  ins.run('paletti.resident@copro.local', mdp, 'Paletti', 'Sébastien', '0601', 'resident', 1, 'actif', 1); // homonyme résident
  ins.run('clement.desactive@copro.local', mdp, 'Clement', 'Françoise', '0602', 'resident', 0, 'desactive', 0); // désactivé : non réutilisé
  ins.run('locataire@copro.local', mdp, 'Locataire', 'Lisa', '0603', 'resident', 0, 'actif', 1); // pas dans la CCG : intact
});

after(() => { fs.rmSync(dbDir, { recursive: true, force: true }); });

test('peuplement avec vieux comptes existants : rapprochement par nom (hors admin et inactifs), pas de doublon', () => {
  const r = peuplerDepuisCCG();
  assert.strictEqual(r.erreurs.length, 0, r.erreurs.join('; '));
  assert.strictEqual(r.lotsCrees, 123);
  // le lot 35 (PALETTI Sébastien) est rattaché au compte résident existant, PAS au compte admin
  const resident = db.prepare("SELECT id FROM users WHERE email = 'paletti.resident@copro.local'").get();
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  const lot35 = db.prepare('SELECT * FROM lots WHERE numero = 35').get();
  assert.strictEqual(lot35.user_id, resident.id);
  assert.ok(r.comptesReutilises.some(c => c.userId === resident.id));
  // le compte admin ne possède aucun lot
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM lots WHERE user_id = ?').get(admin.id).n, 0);
  // CLEMENT Françoise : le compte existant est désactivé -> un nouveau compte sans email est créé
  const lot3 = db.prepare('SELECT * FROM lots WHERE numero = 3').get();
  assert.notStrictEqual(lot3.user_id, db.prepare("SELECT id FROM users WHERE email = 'clement.desactive@copro.local'").get().id);
  const nouveauClement = db.prepare('SELECT * FROM users WHERE id = ?').get(lot3.user_id);
  assert.strictEqual(nouveauClement.email, null);
  assert.strictEqual(nouveauClement.nom, 'CLEMENT');
  // 38 propriétaires CCG - 1 réutilisé = 37 comptes créés
  assert.strictEqual(r.comptesCrees.length, 37);
  assert.strictEqual(r.nbComptesProprietaires, 38);
  // le compte hors CCG est intact
  const loc = db.prepare("SELECT * FROM users WHERE email = 'locataire@copro.local'").get();
  assert.strictEqual(loc.statut, 'actif');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM lots WHERE user_id = ?').get(loc.id).n, 0);
});

test('re-exécution : un lot CCG existant sans propriétaire est rattaché au compte trouvé, rien de recréé', () => {
  // simule un lot déjà présent mais sans propriétaire (owner perdu / non renseigné)
  db.prepare('UPDATE lots SET user_id = NULL WHERE numero = 27').run(); // lot 27 = MELLET Pascal
  const nbUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const r = peuplerDepuisCCG();
  assert.strictEqual(r.lotsCrees, 0);
  assert.strictEqual(r.lotsExistants, 123);
  assert.strictEqual(r.lotsMisAJour, 1);
  // le lot 27 retrouve le compte MELLET (créé au premier passage, retrouvé par nom)
  const lot27 = db.prepare('SELECT * FROM lots WHERE numero = 27').get();
  const mellet = db.prepare("SELECT * FROM users WHERE upper(nom) = 'MELLET' AND upper(prenom) = 'PASCAL'").get();
  assert.ok(lot27.user_id);
  assert.strictEqual(lot27.user_id, mellet.id);
  // aucun nouveau compte créé
  assert.strictEqual(r.comptesCrees.length, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, nbUsers);
});
