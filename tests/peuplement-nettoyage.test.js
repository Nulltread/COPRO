const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let dbDir, uploadDir, db, peuplerDepuisCCG;

before(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-peupler3-'));
  uploadDir = path.join(dbDir, 'uploads');
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = uploadDir;
  process.env.MAIL_ENABLED = 'false';
  db = require('../src/db').getDb();
  ({ peuplerDepuisCCG } = require('../src/db/peupler-cle-repartition'));
  const { hashPassword } = require('../src/auth');
  const mdp = hashPassword('demo1234');
  // base "version de test" : unités + comptes de test @copro.local + admin fake + CS réel
  db.prepare("INSERT INTO units (type, numero, label) VALUES ('villa', 1, 'Villa 1')").run();
  db.prepare("INSERT INTO units (type, numero, label) VALUES ('garage', 1, 'Garage 1')").run();
  const ins = db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?,?,?,?,?,?,?, ?, 1)');
  ins.run('admin@copro.local', mdp, 'Admin', 'Admin', '0600', 'admin', 0, 'actif'); // admin fake : JAMAIS touché
  const r1 = ins.run('resident1@copro.local', mdp, 'Resident 1', 'Jean', '0601', 'resident', 0, 'actif').lastInsertRowid;
  ins.run('conseil1@copro.local', mdp, 'Martin', 'Marie', '0602', 'resident', 1, 'actif'); // CS de test : supprimé
  const paletti = ins.run('sebastien.paletti@gmail.com', mdp, 'Paletti', 'Sébastien', '0603', 'resident', 1, 'actif').lastInsertRowid; // CS réel : conservé
  // rattachements + ticket de test avec pièce jointe (ligne + fichier disque)
  db.prepare("INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (1, ?, 'proprietaire')").run(r1);
  db.prepare("INSERT INTO rattachements (unit_id, user_id, qualite, statut, valide_par) VALUES (1, ?, 'proprietaire', 'accepte', ?)").run(r1, r1);
  const tid = db.prepare("INSERT INTO tickets (titre, description, etape, auteur_id) VALUES ('[Démo] Fuite', '', 'cree', ?)").run(r1).lastInsertRowid;
  db.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, 1)').run(tid);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'creation', ?, 'créé')").run(tid, r1);
  db.prepare("INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, auteur_id) VALUES (?, 'photo', 'p.jpg', 'photo-test.jpg', 'image/jpeg', 10, ?)").run(tid, r1);
  fs.writeFileSync(path.join(uploadDir, 'photo-test.jpg'), 'faux jpeg');
  global.__paletti = paletti;
});

after(() => { fs.rmSync(dbDir, { recursive: true, force: true }); });

test('peupler : nettoyage des comptes/tickets de test, admin et unités préservés, lot CCG rattaché au compte CS réel', () => {
  const nbUnitsAvant = db.prepare('SELECT COUNT(*) AS n FROM units').get().n;
  const r = peuplerDepuisCCG();
  assert.strictEqual(r.erreurs.length, 0, r.erreurs.join('; '));
  // 1. comptes de test supprimés, admin fake et CS réel intacts
  assert.ok(r.nettoyage, 'nettoyage effectué');
  assert.ok(r.nettoyage.comptesTestSupprimes.includes('resident1@copro.local'));
  assert.ok(r.nettoyage.comptesTestSupprimes.includes('conseil1@copro.local'));
  assert.ok(!r.nettoyage.comptesTestSupprimes.includes('admin@copro.local'));
  assert.strictEqual(db.prepare("SELECT email, role, statut FROM users WHERE email = 'admin@copro.local'").get().email, 'admin@copro.local');
  const paletti = db.prepare("SELECT * FROM users WHERE email = 'sebastien.paletti@gmail.com'").get();
  assert.ok(paletti);
  assert.strictEqual(paletti.conseil_syndical, 1);
  assert.strictEqual(paletti.statut, 'actif');
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@copro.local' AND role != 'admin'").get().n, 0);
  // 2. tous les tickets supprimés, avec attachements (ligne + disque)
  assert.strictEqual(r.nettoyage.ticketsSupprimes, 1);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM fichiers').get().n, 0);
  assert.strictEqual(fs.existsSync(path.join(uploadDir, 'photo-test.jpg')), false);
  // 3. unités non touchées
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM units').get().n, nbUnitsAvant);
  // 4. peuplement CCG : 123 lots, chaque propriétaire a un compte (sans email = inactif en pratique)
  assert.strictEqual(r.nbLots, 123);
  assert.strictEqual(db.prepare('SELECT SUM(tantiemes) AS s FROM lots').get().s, 10000);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM lots WHERE user_id IS NULL').get().n, 0);
  // 5. le lot 35 (PALETTI Sébastien) est rattaché au compte CS réel sebastien.paletti@gmail.com (pas de doublon)
  const lot35 = db.prepare('SELECT * FROM lots WHERE numero = 35').get();
  assert.strictEqual(lot35.user_id, paletti.id);
  assert.ok(r.comptesReutilises.some(c => c.userId === paletti.id));
  // 38 propriétaires - 1 compte réutilisé = 37 comptes créés sans email
  assert.strictEqual(r.comptesCrees.length, 37);
  assert.strictEqual(db.prepare('SELECT COUNT(DISTINCT u.id) AS n FROM users u JOIN lots l ON l.user_id = u.id WHERE u.email IS NULL').get().n, 37);
});

test('re-exécution sans comptes de test : aucun nettoyage, peuplement idempotent', () => {
  const nbUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const r = peuplerDepuisCCG();
  assert.strictEqual(r.nettoyage, null, 'pas de nettoyage quand il n\'y a plus de comptes de test');
  assert.strictEqual(r.lotsCrees, 0);
  assert.strictEqual(r.lotsExistants, 123);
  assert.strictEqual(r.comptesCrees.length, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, nbUsers);
});

test('peupler avec nettoyage désactivé (--sans-nettoyage) : comptes de test conservés', () => {
  db.prepare("INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut, email_verifie) VALUES ('test2@copro.local', 'x', 'Test2', 'Toto', '0', 'resident', 'actif', 1)").run();
  const r = peuplerDepuisCCG({ nettoyage: false });
  assert.strictEqual(r.nettoyage, null);
  assert.ok(db.prepare("SELECT id FROM users WHERE email = 'test2@copro.local'").get());
  db.prepare("DELETE FROM users WHERE email = 'test2@copro.local'").run();
});
