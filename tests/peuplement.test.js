const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let dbDir, db, peuplerDepuisCCG, decouperNomPrenom;

before(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-peupler-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
  db = require('../src/db').getDb();
  ({ peuplerDepuisCCG, decouperNomPrenom } = require('../src/db/peupler-cle-repartition'));
});

after(() => { fs.rmSync(dbDir, { recursive: true, force: true }); });

test('peuplement CCG : 123 lots, total 10000 tantièmes, comptes propriétaires dédupliqués sans email, aucun lien lot→unité', () => {
  const r = peuplerDepuisCCG();
  assert.strictEqual(r.erreurs.length, 0, r.erreurs.join('; '));
  assert.strictEqual(r.lotsCrees, 123);
  assert.strictEqual(r.nbLots, 123);
  assert.strictEqual(r.nbComptesProprietaires, 38);
  // total des tantièmes = 10000 (total CCG)
  assert.strictEqual(db.prepare('SELECT SUM(tantiemes) AS s FROM lots').get().s, 10000);
  // chaque lot a exactement un compte propriétaire, sans email, actif
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM lots WHERE user_id IS NULL').get().n, 0);
  const sansEmail = db.prepare('SELECT COUNT(*) AS n FROM users u JOIN lots l ON l.user_id = u.id WHERE u.email IS NOT NULL').get().n;
  assert.strictEqual(sansEmail, 0);
  // dédoublonnage : ERILIA-LOGIREM = un seul compte, propriétaire de tous ses lots
  const erilia = db.prepare("SELECT u.id, COUNT(*) AS n FROM lots l JOIN users u ON u.id = l.user_id WHERE l.proprietaire_brut LIKE 'ERILIA%' GROUP BY u.id").all();
  assert.strictEqual(erilia.length, 1);
  assert.ok(erilia[0].n > 50, `ERILIA possède ${erilia[0].n} lots`);
  // CLEMENT Françoise possède les lots 3 et 48 -> un seul compte
  const clement = db.prepare("SELECT u.id, COUNT(*) AS n FROM lots l JOIN users u ON u.id = l.user_id WHERE l.proprietaire_brut LIKE 'CLEMENT%' GROUP BY u.id").all();
  assert.strictEqual(clement.length, 1);
  assert.strictEqual(clement[0].n, 2);
  // un lot = un seul compte (user_id), pas de lien lot→unité créé
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM lot_units').get().n, 0);
  // tantièmes du lot 39 = 145 (CCG)
  assert.strictEqual(db.prepare('SELECT tantiemes FROM lots WHERE numero = 39').get().tantiemes, 145);
  // nom/prénom découpés
  const eriliaUser = db.prepare('SELECT * FROM users WHERE id = ?').get(erilia[0].id);
  assert.strictEqual(eriliaUser.nom, 'ERILIA-LOGIREM');
  assert.strictEqual(eriliaUser.prenom, 'Dex Serv Coprop');
});

test('peuplement idempotent : deuxième exécution ne crée rien', () => {
  const avant = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const r = peuplerDepuisCCG();
  assert.strictEqual(r.lotsCrees, 0);
  assert.strictEqual(r.lotsExistants, 123);
  assert.strictEqual(r.comptesCrees.length, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM lots').get().n, 123);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, avant);
});

test('découpage nom/prénom des chaînes de la clé', () => {
  assert.deepStrictEqual(decouperNomPrenom('CLEMENT Francoise'), { nom: 'CLEMENT', prenom: 'Francoise' });
  assert.deepStrictEqual(decouperNomPrenom('GIRAUD & GUIS Magali & Pascal'), { nom: 'GIRAUD & GUIS', prenom: 'Magali & Pascal' });
  assert.deepStrictEqual(decouperNomPrenom('ERILIA-LOGIREM Dex Serv Coprop'), { nom: 'ERILIA-LOGIREM', prenom: 'Dex Serv Coprop' });
  assert.deepStrictEqual(decouperNomPrenom('LABROUSSE .'), { nom: 'LABROUSSE', prenom: 'LABROUSSE' });
  assert.deepStrictEqual(decouperNomPrenom('ROUVIER / PIGNOL Franck et Stéphanie'), { nom: 'ROUVIER / PIGNOL', prenom: 'Franck et Stéphanie' });
  assert.deepStrictEqual(decouperNomPrenom('CRABOL & GIULIANI Jonathan&Emilie'), { nom: 'CRABOL & GIULIANI', prenom: 'Jonathan&Emilie' });
});
