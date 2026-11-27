const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let db, seedRealiste, provisionnerDepuisObjet;

before(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-seedr-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
  const dbModule = require('../src/db');
  db = dbModule.getDb();
  ({ seedRealiste } = require('../src/db/seed-realiste'));
  ({ provisionnerDepuisObjet } = require('../src/db/provisionner-comptes'));
  provisionnerDepuisObjet({
    admin: { email: 'admin@copro.local', nom: 'Admin', prenom: 'Admin', mot_de_passe: 'motdepasseadmin1' },
    comptes: [
      { email: 'sebastien.paletti@gmail.com', nom: 'Paletti', prenom: 'Sébastien', conseil_syndical: true, unites: [{ type: 'garage', numero: 43, qualite: 'locataire' }, { type: 'communes', qualite: 'proprietaire' }] },
      { email: 'soniallorca75@gmail.com', nom: 'Llorca', prenom: 'Sonia', conseil_syndical: true, unites: [{ type: 'communes', qualite: 'proprietaire' }] }
    ]
  }, { silencieux: true });
});

test('seed réaliste : référentiel, entreprises, 11 tickets à tous les stades, auteurs = comptes existants', () => {
  const r = seedRealiste();
  assert.deepStrictEqual(r.erreurs, []);
  assert.strictEqual(r.ticketsCrees, 11);
  assert.strictEqual(r.entreprises, 9);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM units').get().n, 123);

  const etapes = Object.fromEntries(db.prepare('SELECT etape, COUNT(*) AS n FROM tickets GROUP BY etape').all().map(e => [e.etape, e.n]));
  assert.deepStrictEqual(etapes, { cree: 3, consultation: 4, intervention_planifiee: 1, travaux_acceptes: 2, archive: 1 });
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE urgent = 1').get().n, 2);

  const pal = db.prepare("SELECT id FROM users WHERE email = 'sebastien.paletti@gmail.com'").get();
  const tPal = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE auteur_id = ? AND titre LIKE '%villa 10%'").get(pal.id).n;
  assert.strictEqual(tPal, 1);
  const llorca = db.prepare("SELECT id FROM users WHERE email = 'soniallorca75@gmail.com'").get();
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE auteur_id = ? AND titre LIKE '%gaz%'").get(llorca.id).n, 1);

  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM consultations WHERE validee = 1").get().n >= 1);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM fichiers WHERE categorie = 'devis'").get().n >= 4);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM fichiers WHERE categorie = 'facture'").get().n >= 1);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM resolutions').get().n >= 1);
  const t42 = db.prepare("SELECT id FROM tickets WHERE titre LIKE '%appartement 42%'").get();
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM ticket_units tu JOIN units u ON u.id = tu.unit_id WHERE tu.ticket_id = ? AND u.type = \'villa\' AND u.numero = 42').get(t42.id).n === 1);
});

test('seed réaliste idempotente : seconde exécution ne crée rien', () => {
  const r = seedRealiste();
  assert.strictEqual(r.ticketsCrees, 0);
  assert.strictEqual(r.ticketsExistants, 11);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n, 11);
});
