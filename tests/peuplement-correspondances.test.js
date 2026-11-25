const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let dbDir, db, peuplerDepuisCCG;

before(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-peupler4-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
  db = require('../src/db').getDb();
  ({ peuplerDepuisCCG } = require('../src/db/peupler-cle-repartition'));
  const { hashPassword } = require('../src/auth');
  const ins = db.prepare('INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie) VALUES (?,?,?,?,?,?,?, ?, 1)');
  ins.run('admin@copro.local', hashPassword('x'), 'Admin', 'Admin', '0', 'admin', 0, 'actif');
  // représentant ERILIA, compte réel pré-créé (provisionner)
  ins.run('julien.debastiani@erilia.fr', hashPassword('x'), 'DE BASTIANI', 'Julien', '0', 'resident', 1, 'actif');
});

after(() => { fs.rmSync(dbDir, { recursive: true, force: true }); });

test('correspondance ERILIA : tous les lots ERILIA rattachés au compte julien.debastiani@erilia.fr, aucun placeholder créé', () => {
  const julien = db.prepare("SELECT id FROM users WHERE email = 'julien.debastiani@erilia.fr'").get();
  const r = peuplerDepuisCCG();
  assert.strictEqual(r.erreurs.length, 0, r.erreurs.join('; '));
  const nbErilia = db.prepare("SELECT COUNT(*) AS n FROM lots WHERE proprietaire_brut LIKE 'ERILIA%'").get().n;
  assert.ok(nbErilia > 50);
  const possedesParJulien = db.prepare("SELECT COUNT(*) AS n FROM lots WHERE proprietaire_brut LIKE 'ERILIA%' AND user_id = ?").get(julien.id).n;
  assert.strictEqual(possedesParJulien, nbErilia);
  // aucun compte "ERILIA-LOGIREM" placeholder créé
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM users WHERE nom = 'ERILIA-LOGIREM'").get().n, 0);
  // 38 propriétaires CCG - 1 (ERILIA) = 37 comptes créés
  assert.strictEqual(r.comptesCrees.length, 37);
  assert.strictEqual(r.nbComptesProprietaires, 38); // 37 créés + julien
});

test('réassignation : lots déjà owned par un placeholder sans email -> basculés sur le compte de la correspondance, placeholder supprimé', () => {
  const julien = db.prepare("SELECT id FROM users WHERE email = 'julien.debastiani@erilia.fr'").get();
  // simule un premier peuplement ayant créé un placeholder ERILIA sans email
  const ph = db.prepare("INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut) VALUES (NULL, 'x', 'ERILIA-LOGIREM', 'Dex Serv Coprop', '', 'resident', 'actif')").run().lastInsertRowid;
  db.prepare("UPDATE lots SET user_id = ? WHERE proprietaire_brut LIKE 'ERILIA%'").run(ph);
  const r = peuplerDepuisCCG();
  const nbErilia = db.prepare("SELECT COUNT(*) AS n FROM lots WHERE proprietaire_brut LIKE 'ERILIA%'").get().n;
  assert.strictEqual(r.lotsReassignes, nbErilia);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM lots WHERE proprietaire_brut LIKE 'ERILIA%' AND user_id = ?").get(julien.id).n, nbErilia);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(ph).n, 0, 'placeholder supprimé');
  assert.strictEqual(r.placeholdersSupprimes, 1);
  assert.strictEqual(r.lotsCrees, 0);
});
