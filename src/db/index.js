const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db = null;

function getDb() {
  if (db) return db;
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'copro.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  require('./migrate').migrate();
  return db;
}

module.exports = { getDb };
