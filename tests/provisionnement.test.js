const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let db, provisionnerDepuisObjet, creerDonneesDemo, supprimerDonneesDemo, verifyPassword;

before(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-prov-'));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
  const dbModule = require('../src/db');
  db = dbModule.getDb();
  ({ provisionnerDepuisObjet } = require('../src/db/provisionner-comptes'));
  ({ creerDonneesDemo, supprimerDonneesDemo } = require('../src/db/donnees-demo'));
  ({ verifyPassword } = require('../src/auth'));
});

const FICHIER = {
  admin: { email: 'syndic@exemple.fr', nom: 'Syndic', prenom: 'Sylvie', telephone: '0600000000', mot_de_passe: 'motdepasseadmin1' },
  comptes: [
    {
      email: 'cs1@exemple.fr', nom: 'Martin', prenom: 'Marie', telephone: '0611111111',
      conseil_syndical: true,
      unites: [
        { type: 'villa', numero: 12, qualite: 'proprietaire' },
        { type: 'garage', numero: 12, qualite: 'proprietaire' },
        { type: 'communes', qualite: 'proprietaire' }
      ]
    },
    { email: 'res1@exemple.fr', nom: 'Durand', prenom: 'Paul', telephone: '0622222222', unites: [{ type: 'villa', numero: 3, qualite: 'locataire' }] }
  ]
};

test('provisionnement : référentiel, comptes, rattachements, emails vérifiés', () => {
  const r = provisionnerDepuisObjet(FICHIER);
  assert.strictEqual(r.erreurs.length, 0, r.erreurs.join('; '));
  assert.strictEqual(r.referentielCree, true);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM units').get().n, 123);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n, 1);

  const cs = db.prepare('SELECT * FROM users WHERE email = ?').get('cs1@exemple.fr');
  assert.ok(cs);
  assert.strictEqual(cs.conseil_syndical, 1);
  assert.strictEqual(cs.email_verifie, 1);
  assert.strictEqual(cs.statut, 'actif');
  assert.strictEqual(r.mdpGeneres.length, 2);
  const genCs = r.mdpGeneres.find(g => g.email === 'cs1@exemple.fr');
  assert.ok(genCs);
  assert.ok(verifyPassword(genCs.mot_de_passe, cs.password_hash));

  const admin = db.prepare('SELECT * FROM users WHERE email = ?').get('syndic@exemple.fr');
  assert.strictEqual(admin.role, 'admin');
  assert.ok(verifyPassword('motdepasseadmin1', admin.password_hash));

  const rat = db.prepare(`SELECT r.*, u.type, u.numero FROM rattachements r JOIN units u ON u.id = r.unit_id WHERE r.user_id = ?`).all(cs.id);
  assert.strictEqual(rat.length, 3);
  assert.ok(rat.every(x => x.statut === 'accepte'));
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM unit_residents WHERE user_id = ?').get(cs.id).n, 3);

  const res = db.prepare('SELECT * FROM users WHERE email = ?').get('res1@exemple.fr');
  const ratRes = db.prepare('SELECT qualite, statut FROM rattachements WHERE user_id = ?').get(res.id);
  assert.strictEqual(ratRes.qualite, 'locataire');
  assert.strictEqual(ratRes.statut, 'accepte');
  assert.strictEqual(res.conseil_syndical, 0);
});

test('provisionnement idempotent : rejoue sans doublon, mdp conservé si non fourni', () => {
  const avant = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('cs1@exemple.fr').password_hash;
  const r = provisionnerDepuisObjet(FICHIER);
  assert.strictEqual(r.crees.length, 0);
  assert.strictEqual(r.misAJour.length, 3);
  assert.strictEqual(r.mdpGeneres.length, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 3);
  const apres = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('cs1@exemple.fr').password_hash;
  assert.strictEqual(avant, apres);
});

test('provisionnement : réinitialisation de mot de passe explicite', () => {
  provisionnerDepuisObjet({
    comptes: [{ email: 'res1@exemple.fr', nom: 'Durand', prenom: 'Paul', telephone: '0622222222', mot_de_passe: 'nouveaumdp123', unites: [{ type: 'villa', numero: 3, qualite: 'locataire' }] }]
  });
  const res = db.prepare('SELECT * FROM users WHERE email = ?').get('res1@exemple.fr');
  assert.ok(verifyPassword('nouveaumdp123', res.password_hash));
});

test('provisionnement : refuse un second admin distinct', () => {
  const r = provisionnerDepuisObjet({ admin: { email: 'autre@exemple.fr', nom: 'X', mot_de_passe: 'motdepasse123' }, comptes: [] });
  assert.ok(r.erreurs.some(e => e.includes('admin existe')));
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n, 1);
});

test('données de démo : 5 tickets marqués, idempotentes, supprimables', () => {
  const r1 = creerDonneesDemo({ auteurs: ['cs1@exemple.fr'] });
  assert.strictEqual(r1.total, 5);
  const r2 = creerDonneesDemo({ auteurs: ['cs1@exemple.fr'] });
  assert.strictEqual(r2.total, 5);
  const etapes = db.prepare("SELECT etape, COUNT(*) AS n FROM tickets WHERE titre LIKE '[Démo]%' GROUP BY etape").all();
  const etapesMap = Object.fromEntries(etapes.map(e => [e.etape, e.n]));
  assert.deepStrictEqual(etapesMap, { cree: 1, consultation: 1, intervention_planifiee: 1, travaux_acceptes: 1, archive: 1 });
  const devis = db.prepare("SELECT COUNT(*) AS n FROM fichiers WHERE categorie = 'devis'").get().n;
  assert.ok(devis >= 4);
  const urgent = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE titre LIKE '[Démo]%' AND urgent = 1").get().n;
  assert.strictEqual(urgent, 1);
  const n = supprimerDonneesDemo();
  assert.strictEqual(n, 5);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE titre LIKE '[Démo]%'").get().n, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM fichiers').get().n, 0);
});

test('admin : jamais rattaché à une unité, jamais statut CS, protégé contre la liste comptes', () => {
  const r = provisionnerDepuisObjet({
    admin: { email: 'syndic@exemple.fr', nom: 'Syndic', prenom: 'Sylvie', telephone: '0600000000', mot_de_passe: 'motdepasseadmin1', conseil_syndical: true, unites: [{ type: 'villa', numero: 1, qualite: 'proprietaire' }] },
    comptes: [{ email: 'syndic@exemple.fr', nom: 'Syndic', prenom: 'Sylvie', conseil_syndical: true, unites: [{ type: 'villa', numero: 2, qualite: 'proprietaire' }] }]
  });
  const admin = db.prepare('SELECT * FROM users WHERE email = ?').get('syndic@exemple.fr');
  assert.strictEqual(admin.role, 'admin');
  assert.strictEqual(admin.conseil_syndical, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM rattachements WHERE user_id = ?').get(admin.id).n, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM unit_residents WHERE user_id = ?').get(admin.id).n, 0);
  assert.ok(verifyPassword('motdepasseadmin1', admin.password_hash));
  assert.ok(r.erreurs.some(e => e.includes('jamais rattaché')));
  assert.ok(r.erreurs.some(e => e.includes('compte admin')));
  assert.ok(r.erreurs.some(e => e.includes('statut ignoré')));
});
