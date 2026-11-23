const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let db, nettoyerDemo, UPLOAD_DIR, dbDir, hashPassword, creerDonneesDemo;

before(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-nettoyage-'));
  process.env.DB_PATH = path.join(dbDir, 'test.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  process.env.MAIL_ENABLED = 'false';
  require('../src/db/seed').seed();
  const dbModule = require('../src/db');
  db = dbModule.getDb();
  ({ hashPassword } = require('../src/auth'));
  ({ UPLOAD_DIR } = require('../src/upload'));
  ({ nettoyerDemo } = require('../src/db/nettoyer-demo'));
  ({ creerDonneesDemo } = require('../src/db/donnees-demo'));

  const insUser = db.prepare(
    `INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'actif', 1)`
  );
  const adminId = insUser.run('vrai-admin@exemple.fr', hashPassword('motdepasseadmin1'), 'Admin', 'Vrai', '0600', 'admin', 0).lastInsertRowid;
  const csId = insUser.run('vrai-cs@exemple.fr', hashPassword('motdepassecs123'), 'CS', 'Vrai', '0601', 'resident', 1).lastInsertRowid;
  const villa5 = db.prepare("SELECT id FROM units WHERE type = 'villa' AND numero = 5").get().id;
  db.prepare('INSERT INTO rattachements (unit_id, user_id, qualite, statut, valide_par, valide_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(villa5, csId, 'proprietaire', 'accepte', adminId, "datetime('now')");
  db.prepare('INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, ?)').run(villa5, csId, 'proprietaire');

  const tid = db.prepare('INSERT INTO tickets (titre, description, etape, urgent, auteur_id) VALUES (?, ?, ?, 0, ?)')
    .run('Ticket réel de test', 'À conserver sans --tout', 'cree', csId).lastInsertRowid;
  db.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (?, ?)').run(tid, villa5);
  const stockage = 'fichier-test-reel.pdf';
  fs.writeFileSync(path.join(UPLOAD_DIR, stockage), '%PDF-1.4 reel');
  db.prepare(`INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, auteur_id) VALUES (?, 'devis', 'devis-reel.pdf', ?, 'application/pdf', 10, ?)`)
    .run(tid, stockage, csId);

  creerDonneesDemo({ auteurs: ['vrai-cs@exemple.fr'] });
});

test('nettoyage : comptes de démo, tickets de démo et seed supprimés, comptes réels et unités conservés', () => {
  const avant = fs.readdirSync(UPLOAD_DIR).length;
  const r = nettoyerDemo();
  assert.strictEqual(r.comptesSupprimes, 75);
  assert.ok(r.ticketsSupprimes >= 12);
  assert.strictEqual(r.ticketsRestants, 1);
  assert.strictEqual(r.unites, 123);

  const users = db.prepare('SELECT email, role FROM users').all();
  assert.deepStrictEqual(users.map(u => u.email).sort(), ['vrai-admin@exemple.fr', 'vrai-cs@exemple.fr']);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@copro.local'").get().n === 0);

  const tickets = db.prepare('SELECT titre FROM tickets').all();
  assert.deepStrictEqual(tickets.map(t => t.titre), ['Ticket réel de test']);

  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM entreprises').get().n, 0);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM units').get().n, 123);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE titre LIKE '[Démo]%'").get().n === 0);

  const restants = fs.readdirSync(UPLOAD_DIR);
  assert.deepStrictEqual(restants, ['fichier-test-reel.pdf']);
  assert.ok(avant > restants.length);
});

test('nettoyage --tout : vide aussi les tickets restants, garde les comptes et les unités', () => {
  const r = nettoyerDemo({ tout: true });
  assert.strictEqual(r.ticketsSupprimes, 1);
  assert.strictEqual(r.ticketsRestants, 0);
  assert.strictEqual(r.comptesRestants, 2);
  assert.strictEqual(r.unites, 123);
  assert.deepStrictEqual(fs.readdirSync(UPLOAD_DIR), []);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM fichiers').get().n, 0);
});
