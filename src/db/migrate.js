const { getDb } = require('./index');

// Mise à jour d'une base créée avec l'ancien schéma (avant SPEC.md) :
// - users : rôles syndic/conseil fondus en resident + conseil_syndical,
//   statut valide/en_attente -> actif, refuse -> supprime, ajout prenom/telephone.
// - units : ajout du type 'communes' (parties communes) rattachées au CS.
// - rattachements : reconstruits depuis unit_residents (acceptés).
// - tickets : anciennes étapes recodées vers le nouveau cycle de vie.
// - push_subscriptions : table supprimée (notifications in-app uniquement).
function migrate() {
  const db = getDb();
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('conseil_syndical')) migrationAncienne(db);
  // Ajouts incrémentaux (idempotents) pour les bases existantes.
  const cols2 = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols2.includes('email_verifie')) db.prepare('ALTER TABLE users ADD COLUMN email_verifie INTEGER NOT NULL DEFAULT 0').run();
  if (!cols2.includes('notif_email')) db.prepare('ALTER TABLE users ADD COLUMN notif_email INTEGER NOT NULL DEFAULT 0').run();
  // Les comptes existant avant la vérification par email sont considérés comme vérifiés (une seule fois).
  if (db.pragma('user_version', { simple: true }) < 1) {
    db.prepare("UPDATE users SET email_verifie = 1 WHERE statut = 'actif'").run();
    db.pragma('user_version = 1');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  const sansCat = sansCategorie(db, false);
  // v2 (specs 17-22) : parametres admin, entreprises, consultations, validations
  // des travaux avec commentaires, peremption des rattachements, archivage auto.
  if (db.pragma('user_version', { simple: true }) < 2) {
    migrationV2(db);
    db.pragma('user_version = 2');
    console.log('Migration v2 : parametres, entreprises, consultations, peremption, archivage auto.');
  }
  // v3 (corrections) : photos attachees a un contexte (creation/validation/
  // reouverture/compte_rendu) ; comptes-rendus : une instance par personne
  // concernee (user_id) au lieu d'une par unite + une pour le CS.
  if (db.pragma('user_version', { simple: true }) < 3) {
    migrationV3(db);
    db.pragma('user_version = 3');
    console.log('Migration v3 : fichiers.contexte, comptes_rendus par personne.');
  }
  // v4 (spec 28) : cycle de consultation (tickets.cycle), photos de bilan
  // rattachees a un cycle (fichiers.cycle), bilans par cycle
  // (comptes_rendus.cycle, cle ticket+user+cycle).
  if (db.pragma('user_version', { simple: true }) < 4) {
    migrationV4(db);
    db.pragma('user_version = 4');
    console.log('Migration v4 : tickets.cycle, fichiers.cycle, comptes_rendus par cycle (spec 28).');
  }
  // v5 (sollicitations/relances) : tables sollicitations, acces_externes et
  // consultation_dates ; fichiers.auteur_id devient nullable (+ auteur_externe)
  // pour les devis deposes par un prestataire externe ; notifications.donnees.
  if (db.pragma('user_version', { simple: true }) < 5) {
    migrationV5(db);
    db.pragma('user_version = 5');
    console.log('Migration v5 : sollicitations, acces externes prestataires, dates proposees, fichiers.auteur_externe.');
  }
  return sansCat;
}

function migrationV5(db) {
  const ncols = db.prepare('PRAGMA table_info(notifications)').all().map(c => c.name);
  if (!ncols.includes('donnees')) db.prepare('ALTER TABLE notifications ADD COLUMN donnees TEXT').run();
  db.exec(`
    CREATE TABLE IF NOT EXISTS sollicitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
      auteur_id INTEGER REFERENCES users(id),
      type TEXT NOT NULL DEFAULT 'sollicitation' CHECK (type IN ('sollicitation','relance')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS acces_externes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'devis' CHECK (type IN ('devis','dates')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS consultation_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      heure TEXT,
      propose_par TEXT NOT NULL DEFAULT 'prestataire' CHECK (propose_par IN ('prestataire','cs')),
      validee INTEGER NOT NULL DEFAULT 0,
      valide_par INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sollicitations_consultation ON sollicitations(consultation_id);
    CREATE INDEX IF NOT EXISTS idx_acces_externes_consultation ON acces_externes(consultation_id);
    CREATE INDEX IF NOT EXISTS idx_acces_externes_token ON acces_externes(token);
    CREATE INDEX IF NOT EXISTS idx_consultation_dates_consultation ON consultation_dates(consultation_id);
  `);
  const fcols = db.prepare('PRAGMA table_info(fichiers)').all();
  const auteurCol = fcols.find(c => c.name === 'auteur_id');
  if (!fcols.some(c => c.name === 'auteur_externe') || (auteurCol && auteurCol.notnull)) {
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE fichiers_v5 (
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
          consultation_id INTEGER REFERENCES consultations(id) ON DELETE CASCADE,
          contexte TEXT NOT NULL DEFAULT 'creation',
          cycle INTEGER,
          auteur_id INTEGER REFERENCES users(id),
          auteur_externe TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      db.exec(`
        INSERT INTO fichiers_v5 (id, ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, entreprise, delai, retenu, consultation_id, contexte, cycle, auteur_id, auteur_externe, created_at)
        SELECT id, ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, entreprise, delai, retenu, consultation_id, contexte, cycle, auteur_id, NULL, created_at FROM fichiers;
      `);
      db.exec('DROP TABLE fichiers');
      db.exec('ALTER TABLE fichiers_v5 RENAME TO fichiers');
      db.exec('CREATE INDEX IF NOT EXISTS idx_fichiers_ticket ON fichiers(ticket_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_fichiers_consultation ON fichiers(consultation_id)');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      db.pragma('foreign_keys = ON');
      throw e;
    }
    db.pragma('foreign_keys = ON');
  }
}

function migrationV4(db) {
  const tcols = db.prepare('PRAGMA table_info(tickets)').all().map(c => c.name);
  if (!tcols.includes('cycle')) db.prepare('ALTER TABLE tickets ADD COLUMN cycle INTEGER NOT NULL DEFAULT 1').run();
  const fcols = db.prepare('PRAGMA table_info(fichiers)').all().map(c => c.name);
  if (!fcols.includes('cycle')) db.prepare('ALTER TABLE fichiers ADD COLUMN cycle INTEGER').run();
  const crCols = db.prepare('PRAGMA table_info(comptes_rendus)').all().map(c => c.name);
  if (!crCols.includes('cycle')) {
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE comptes_rendus_v4 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          cycle INTEGER NOT NULL DEFAULT 1,
          contenu TEXT NOT NULL DEFAULT '',
          auteur_id INTEGER NOT NULL REFERENCES users(id),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (ticket_id, user_id, cycle)
        );
      `);
      db.exec(`
        INSERT INTO comptes_rendus_v4 (id, ticket_id, user_id, cycle, contenu, auteur_id, updated_at)
        SELECT id, ticket_id, user_id, 1, contenu, auteur_id, updated_at FROM comptes_rendus;
      `);
      db.exec('DROP TABLE comptes_rendus');
      db.exec('ALTER TABLE comptes_rendus_v4 RENAME TO comptes_rendus');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      db.pragma('foreign_keys = ON');
      throw e;
    }
    db.pragma('foreign_keys = ON');
  }
}

function migrationV3(db) {
  const cols = db.prepare('PRAGMA table_info(fichiers)').all().map(c => c.name);
  if (!cols.includes('contexte')) {
    db.prepare("ALTER TABLE fichiers ADD COLUMN contexte TEXT NOT NULL DEFAULT 'creation'").run();
  }
  const crCols = db.prepare('PRAGMA table_info(comptes_rendus)').all().map(c => c.name);
  if (crCols.includes('unit_id') && !crCols.includes('user_id')) {
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE comptes_rendus_v3 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          contenu TEXT NOT NULL DEFAULT '',
          auteur_id INTEGER NOT NULL REFERENCES users(id),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (ticket_id, user_id)
        );
      `);
      // Anciennes lignes (par unite / CS) -> une ligne par auteur (redacteur).
      db.exec(`
        INSERT OR IGNORE INTO comptes_rendus_v3 (ticket_id, user_id, contenu, auteur_id, updated_at)
        SELECT ticket_id, auteur_id, contenu, auteur_id, updated_at FROM comptes_rendus
        WHERE auteur_id IS NOT NULL;
      `);
      db.exec('DROP TABLE comptes_rendus');
      db.exec('ALTER TABLE comptes_rendus_v3 RENAME TO comptes_rendus');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      db.pragma('foreign_keys = ON');
      throw e;
    }
    db.pragma('foreign_keys = ON');
  }
}

function migrationV2(db) {
  const addCol = (table, col, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes(col)) db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
  };
  addCol('tickets', 'acceptes_at', 'TEXT');
  addCol('tickets', 'notif_archive_j3', 'INTEGER NOT NULL DEFAULT 0');
  addCol('tickets', 'notif_archive_j1', 'INTEGER NOT NULL DEFAULT 0');
  addCol('rattachements', 'notif_peremption_j3', 'INTEGER NOT NULL DEFAULT 0');
  addCol('rattachements', 'notif_peremption_j1', 'INTEGER NOT NULL DEFAULT 0');
  addCol('fichiers', 'consultation_id', 'INTEGER REFERENCES consultations(id) ON DELETE CASCADE');
  addCol('resolutions', 'commentaire', "TEXT NOT NULL DEFAULT ''");
  addCol('resolutions', 'caduque', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE TABLE IF NOT EXISTS parametres (
      cle TEXT PRIMARY KEY,
      valeur TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entreprises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raison_sociale TEXT NOT NULL,
      siren_siret TEXT NOT NULL DEFAULT '',
      contact_nom TEXT NOT NULL DEFAULT '',
      telephone TEXT NOT NULL DEFAULT '',
      mail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS consultations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      entreprise_id INTEGER NOT NULL REFERENCES entreprises(id),
      date_planifiee TEXT,
      validee INTEGER NOT NULL DEFAULT 0,
      caduque INTEGER NOT NULL DEFAULT 0,
      auteur_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_consultations_ticket ON consultations(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_fichiers_consultation ON fichiers(consultation_id);
  `);
  db.prepare("INSERT OR IGNORE INTO parametres (cle, valeur) VALUES ('peremption_rattachement_jours', '14')").run();
  db.prepare("INSERT OR IGNORE INTO parametres (cle, valeur) VALUES ('archivage_auto_jours', '31')").run();
  // L'etape 'valide_cs' n'existe plus : les tickets valides passent en consultation.
  db.prepare("UPDATE tickets SET etape = 'consultation' WHERE etape = 'valide_cs'").run();
}

function migrationAncienne(db) {

  db.pragma('foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE users_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        nom TEXT NOT NULL,
        prenom TEXT NOT NULL DEFAULT '',
        telephone TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL CHECK (role IN ('resident','admin')),
        conseil_syndical INTEGER NOT NULL DEFAULT 0,
        statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','supprime')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_v2 (id, email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, created_at)
      SELECT id, email, password_hash, nom, '', '',
        CASE role WHEN 'admin' THEN 'admin' ELSE 'resident' END,
        CASE WHEN role = 'conseil' THEN 1 ELSE 0 END,
        CASE statut WHEN 'refuse' THEN 'supprime' ELSE 'actif' END,
        created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_v2 RENAME TO users;
    `);

    db.exec(`
      CREATE TABLE units_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('villa','garage','communes')),
        numero INTEGER,
        label TEXT NOT NULL,
        UNIQUE (type, numero)
      );
      INSERT INTO units_v2 (id, type, numero, label) SELECT id, type, numero, label FROM units;
      DROP TABLE units;
      ALTER TABLE units_v2 RENAME TO units;
      INSERT INTO units (type, numero, label) SELECT 'communes', NULL, 'Parties communes'
       WHERE NOT EXISTS (SELECT 1 FROM units WHERE type = 'communes');
    `);

    db.exec(`
      CREATE TABLE tickets_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titre TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        categorie TEXT NOT NULL,
        etape TEXT NOT NULL DEFAULT 'cree' CHECK (etape IN ('cree','valide_cs','consultation','intervention_planifiee','travaux_acceptes','archive')),
        etape_avant_consultation TEXT NOT NULL DEFAULT 'valide_cs',
        urgent INTEGER NOT NULL DEFAULT 0,
        auteur_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO tickets_v2 (id, titre, description, categorie, etape, etape_avant_consultation, urgent, auteur_id, created_at, updated_at)
      SELECT id, titre, description, categorie,
        CASE etape
          WHEN 'declaration' THEN 'cree'
          WHEN 'consultation' THEN 'consultation'
          WHEN 'attribution' THEN 'consultation'
          WHEN 'planification' THEN 'intervention_planifiee'
          WHEN 'reception' THEN 'travaux_acceptes'
          WHEN 'cloture' THEN 'archive'
          ELSE 'cree'
        END,
        'valide_cs', urgent, auteur_id, created_at, updated_at
      FROM tickets;
      DROP TABLE tickets;
      ALTER TABLE tickets_v2 RENAME TO tickets;
    `);

    db.exec(`
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
      INSERT OR IGNORE INTO rattachements (unit_id, user_id, qualite, statut)
      SELECT unit_id, user_id, qualite, 'accepte' FROM unit_residents;
    `);

    // Les membres du conseil syndical sont rattachés par défaut aux parties communes.
    db.exec(`
      INSERT OR IGNORE INTO rattachements (unit_id, user_id, qualite, statut)
      SELECT (SELECT id FROM units WHERE type = 'communes'), id, 'proprietaire', 'accepte'
      FROM users WHERE conseil_syndical = 1;
      INSERT OR IGNORE INTO unit_residents (unit_id, user_id, qualite)
      SELECT (SELECT id FROM units WHERE type = 'communes'), id, 'proprietaire'
      FROM users WHERE conseil_syndical = 1;
    `);

    db.exec('DROP TABLE IF EXISTS push_subscriptions');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    db.pragma('foreign_keys = ON');
    throw e;
  }
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_etape ON tickets(etape);
    CREATE INDEX IF NOT EXISTS idx_ticket_units_unit ON ticket_units(unit_id);
    CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_fichiers_ticket ON fichiers(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, lu);
    CREATE INDEX IF NOT EXISTS idx_unit_residents_user ON unit_residents(user_id);
    CREATE INDEX IF NOT EXISTS idx_rattachements_user ON rattachements(user_id, statut);
    CREATE INDEX IF NOT EXISTS idx_rattachements_unit ON rattachements(unit_id, statut);
    CREATE INDEX IF NOT EXISTS idx_resolutions_ticket ON resolutions(ticket_id);
  `);
  // Index des comptes-rendus uniquement si l'ancienne structure (unit_id) existe ;
  // la v3 remplace la table par une cle (ticket_id, user_id).
  const crCols = db.prepare('PRAGMA table_info(comptes_rendus)').all().map(c => c.name);
  if (crCols.includes('unit_id')) {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_ticket_unite ON comptes_rendus(ticket_id, COALESCE(unit_id, 0));');
  }
  console.log('Migration : ancienne base mise à jour vers le nouveau schéma (rôles CS, unités, cycle de vie).');
}

// La catégorie de travaux est retirée : on supprime la colonne si elle existe encore.
function sansCategorie(db, migre) {
  const tcols = db.prepare('PRAGMA table_info(tickets)').all().map(c => c.name);
  if (tcols.includes('categorie')) {
    db.prepare('ALTER TABLE tickets DROP COLUMN categorie').run();
    console.log('Migration : colonne tickets.categorie supprimée.');
    return true;
  }
  return migre;
}

module.exports = { migrate };
