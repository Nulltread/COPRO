PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('villa','garage','communes')),
  numero INTEGER,
  label TEXT NOT NULL,
  UNIQUE (type, numero)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('resident','admin')),
  conseil_syndical INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','supprime')),
  email_verifie INTEGER NOT NULL DEFAULT 0,
  notif_email INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Jetons de validation de l'email (lien unique et expirable envoyé à l'inscription).
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rattachement d'un compte a une unite : reclame par le resident,
-- accepte par un resident de la meme unite ou un membre du conseil syndical.
CREATE TABLE IF NOT EXISTS rattachements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qualite TEXT NOT NULL CHECK (qualite IN ('proprietaire','locataire')),
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','accepte','refuse')),
  valide_par INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  valide_at TEXT,
  UNIQUE (unit_id, user_id)
);

-- Unites validees d'un resident (alimente quand un rattachement est accepte).
CREATE TABLE IF NOT EXISTS unit_residents (
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qualite TEXT NOT NULL CHECK (qualite IN ('proprietaire','locataire')),
  PRIMARY KEY (unit_id, user_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titre TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  etape TEXT NOT NULL DEFAULT 'cree' CHECK (etape IN ('cree','valide_cs','consultation','intervention_planifiee','travaux_acceptes','archive')),
  etape_avant_consultation TEXT NOT NULL DEFAULT 'valide_cs',
  urgent INTEGER NOT NULL DEFAULT 0,
  auteur_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_units (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, unit_id)
);

CREATE TABLE IF NOT EXISTS ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  auteur_id INTEGER REFERENCES users(id),
  contenu TEXT NOT NULL DEFAULT '',
  donnees TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Acceptations de la resolution (travaux acceptes) par les residents concernes.
CREATE TABLE IF NOT EXISTS resolutions (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ticket_id, user_id)
);

-- Comptes-rendus d'intervention : une instance par unite du ticket (unit_id)
-- plus une instance pour le conseil syndical (unit_id NULL).
CREATE TABLE IF NOT EXISTS comptes_rendus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL DEFAULT '',
  auteur_id INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_ticket_unite ON comptes_rendus(ticket_id, COALESCE(unit_id, 0));

CREATE TABLE IF NOT EXISTS fichiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL CHECK (categorie IN ('photo','devis','avenant','facture','decision','compte_rendu')),
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

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  lu INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_etape ON tickets(etape);
CREATE INDEX IF NOT EXISTS idx_ticket_units_unit ON ticket_units(unit_id);
CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_fichiers_ticket ON fichiers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, lu);
CREATE INDEX IF NOT EXISTS idx_unit_residents_user ON unit_residents(user_id);
CREATE INDEX IF NOT EXISTS idx_rattachements_user ON rattachements(user_id, statut);
CREATE INDEX IF NOT EXISTS idx_rattachements_unit ON rattachements(unit_id, statut);
CREATE INDEX IF NOT EXISTS idx_resolutions_ticket ON resolutions(ticket_id);
