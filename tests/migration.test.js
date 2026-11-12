const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let dbDir, db;

const OLD_SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('villa','garage')),
  numero INTEGER NOT NULL,
  label TEXT NOT NULL,
  UNIQUE (type, numero)
);
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  nom TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('resident','syndic','conseil','admin')),
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','valide','refuse')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE unit_residents (
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qualite TEXT NOT NULL CHECK (qualite IN ('proprietaire','locataire')),
  PRIMARY KEY (unit_id, user_id)
);
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titre TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  categorie TEXT NOT NULL,
  etape TEXT NOT NULL DEFAULT 'declaration' CHECK (etape IN ('declaration','consultation','attribution','planification','reception','cloture')),
  urgent INTEGER NOT NULL DEFAULT 0,
  auteur_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE ticket_units (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, unit_id)
);
CREATE TABLE ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  auteur_id INTEGER REFERENCES users(id),
  contenu TEXT NOT NULL DEFAULT '',
  donnees TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE fichiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL,
  nom_original TEXT NOT NULL,
  nom_stockage TEXT NOT NULL,
  mime TEXT NOT NULL,
  taille INTEGER NOT NULL,
  montant REAL,
  entreprise TEXT,
  delai TEXT,
  retenu INTEGER NOT NULL DEFAULT 0,
  auteur_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  lu INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
`;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

before(() => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-migration-'));
  process.env.DB_PATH = path.join(dbDir, 'old.db');
  process.env.UPLOAD_DIR = path.join(dbDir, 'uploads');
  const Database = require('better-sqlite3');
  const old = new Database(process.env.DB_PATH);
  old.exec(OLD_SCHEMA);
  const mdp = hashPassword('demo1234');
  old.prepare("INSERT INTO units (type, numero, label) VALUES ('villa', 1, 'Villa 1')").run();
  const admin = old.prepare('INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?,?,?,?,?)')
    .run('admin@copro.local', mdp, 'Admin Copro', 'admin', 'valide').lastInsertRowid;
  old.prepare('INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?,?,?,?,?)')
    .run('conseil@copro.local', mdp, 'Marie Conseil', 'conseil', 'valide');
  const r1 = old.prepare('INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?,?,?,?,?)')
    .run('r1@copro.local', mdp, 'Resident 1', 'resident', 'valide').lastInsertRowid;
  old.prepare('INSERT INTO users (email, password_hash, nom, role, statut) VALUES (?,?,?,?,?)')
    .run('refuse@copro.local', mdp, 'Refusé', 'resident', 'refuse');
  old.prepare("INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (1, ?, 'proprietaire')").run(r1);
  old.prepare("INSERT INTO tickets (titre, description, categorie, etape, urgent, auteur_id) VALUES ('Vieux ticket', '', 'Autre', 'cloture', 0, ?)").run(r1);
  old.prepare('INSERT INTO ticket_units (ticket_id, unit_id) VALUES (1, 1)').run();
  old.close();
  db = require('../src/db').getDb();
});

after(() => { fs.rmSync(dbDir, { recursive: true, force: true }); });

test('migration : admin valide -> actif, toujours admin', () => {
  const admin = db.prepare("SELECT role, statut, conseil_syndical FROM users WHERE email='admin@copro.local'").get();
  assert.strictEqual(admin.role, 'admin');
  assert.strictEqual(admin.statut, 'actif');
});

test('migration : conseil -> resident + conseil_syndical=1, rattaché aux parties communes', () => {
  const cs = db.prepare("SELECT role, conseil_syndical, statut FROM users WHERE email='conseil@copro.local'").get();
  assert.strictEqual(cs.role, 'resident');
  assert.strictEqual(cs.conseil_syndical, 1);
  assert.strictEqual(cs.statut, 'actif');
  const communes = db.prepare("SELECT id FROM units WHERE type='communes'").get();
  assert.ok(communes);
  const n = db.prepare('SELECT COUNT(*) AS n FROM unit_residents ur JOIN users u ON u.id=ur.user_id WHERE u.email=? AND ur.unit_id=?')
    .get('conseil@copro.local', communes.id).n;
  assert.strictEqual(n, 1);
});

test('migration : statut refuse -> supprime ; resident valide -> actif', () => {
  assert.strictEqual(db.prepare("SELECT statut FROM users WHERE email='refuse@copro.local'").get().statut, 'supprime');
  assert.strictEqual(db.prepare("SELECT statut FROM users WHERE email='r1@copro.local'").get().statut, 'actif');
});

test('migration : unit_residents -> rattachements acceptés', () => {
  const n = db.prepare("SELECT COUNT(*) AS n FROM rattachements WHERE statut='accepte'").get().n;
  assert.ok(n >= 2); // r1 sur villa 1 + conseil sur parties communes
});

test('migration : anciennes étapes recodées vers le nouveau cycle', () => {
  const t = db.prepare('SELECT etape, etape_avant_consultation FROM tickets WHERE id=1').get();
  assert.strictEqual(t.etape, 'archive');
  assert.strictEqual(t.etape_avant_consultation, 'valide_cs');
});

test('migration : colonne tickets.categorie supprimée', () => {
  const cols = db.prepare('PRAGMA table_info(tickets)').all().map(c => c.name);
  assert.ok(!cols.includes('categorie'));
});

test('migration : push_subscriptions supprimée', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='push_subscriptions'").all();
  assert.strictEqual(tables.length, 0);
});

test('migration : login admin fonctionne après migration', async () => {
  const { createApp } = require('../src/app');
  const app = createApp();
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(base + '/connexion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@copro.local', motdepasse: 'demo1234' }),
    redirect: 'manual'
  });
  assert.strictEqual(res.status, 302);
  server.close();
});

test('migration : une base déjà à jour n\'est pas touchée', () => {
  const { migrate } = require('../src/db/migrate');
  assert.strictEqual(migrate(), false);
  assert.strictEqual(db.prepare("SELECT statut FROM users WHERE email='admin@copro.local'").get().statut, 'actif');
});
