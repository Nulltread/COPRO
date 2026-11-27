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
  email TEXT COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('resident','admin')),
  conseil_syndical INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','desactive','supprime')),
  email_verifie INTEGER NOT NULL DEFAULT 0,
  notif_email INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_actif
  ON users(email) WHERE email IS NOT NULL AND statut = 'actif';

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
  notif_peremption_j3 INTEGER NOT NULL DEFAULT 0,
  notif_peremption_j1 INTEGER NOT NULL DEFAULT 0,
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
  etape TEXT NOT NULL DEFAULT 'cree' CHECK (etape IN ('cree','consultation','intervention_planifiee','travaux_acceptes','archive')),
  etape_avant_consultation TEXT NOT NULL DEFAULT 'cree',
  urgent INTEGER NOT NULL DEFAULT 0,
  auteur_id INTEGER NOT NULL REFERENCES users(id),
  acceptes_at TEXT,
  notif_archive_j3 INTEGER NOT NULL DEFAULT 0,
  notif_archive_j1 INTEGER NOT NULL DEFAULT 0,
  -- Numero du cycle de consultation en cours (spec 28) : incremente a chaque
  -- repassage en consultation (reouverture ou refus) ; les bilans des cycles
  -- passes sont figes en lecture seule.
  cycle INTEGER NOT NULL DEFAULT 1,
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

-- Validations des travaux (planifie -> acceptes) par les residents concernes.
-- caduque = 1 : validation conservee en lecture seule apres une reouverture.
CREATE TABLE IF NOT EXISTS resolutions (
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commentaire TEXT NOT NULL DEFAULT '',
  caduque INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ticket_id, user_id)
);

-- Parametres globaux (panneau d'administration, reserve a l'admin).
CREATE TABLE IF NOT EXISTS parametres (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

-- Referentiel des entreprises (gere par le CS et l'admin).
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

-- Consultations d'un ticket (etape 'consultation') : entreprise + date +
-- un ou plusieurs devis (table fichiers, categorie 'devis', consultation_id).
-- validee = 1 : retenue par le CS pour passer en travaux planifies.
-- caduque = 1 : conservee en lecture seule apres une reouverture.
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

-- Bilans d'intervention : UNE instance par personne concernee ET par cycle
-- (spec 28) -> cle (ticket_id, user_id, cycle). Les bilans des cycles passes
-- sont figes en lecture seule de facon definitive.
CREATE TABLE IF NOT EXISTS comptes_rendus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle INTEGER NOT NULL DEFAULT 1,
  contenu TEXT NOT NULL DEFAULT '',
  auteur_id INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ticket_id, user_id, cycle)
);

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
  consultation_id INTEGER REFERENCES consultations(id) ON DELETE CASCADE,
  contexte TEXT NOT NULL DEFAULT 'creation',
  -- Cycle du ticket auquel la photo de bilan est rattachee (contexte
  -- 'compte_rendu') ; NULL pour les autres contextes (spec 28).
  cycle INTEGER,
  -- NULL quand le fichier est depose par un prestataire externe (sans compte)
  -- via son lien de consultation ; auteur_externe porte alors sa raison sociale.
  auteur_id INTEGER REFERENCES users(id),
  auteur_externe TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  lu INTEGER NOT NULL DEFAULT 0,
  -- Donnees JSON complementaires (ex. { "fichier_id": 12 } pour un lien
  -- direct vers un fichier dans la notification).
  donnees TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sollicitations et relances des prestataires par email, par consultation
-- (voir specifications/sollicitations-relances.md) : le systeme se souvient
-- des envois et adapte le mail (sollicitation vs relance).
CREATE TABLE IF NOT EXISTS sollicitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  auteur_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'sollicitation' CHECK (type IN ('sollicitation','relance')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Jetons d'acces externes (prestataires, sans compte) : lien direct vers la
-- version reduite de la consultation. Duree de vie maximale : 7 jours.
CREATE TABLE IF NOT EXISTS acces_externes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'devis' CHECK (type IN ('devis','dates')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dates d'intervention proposees pour une consultation (par le prestataire
-- via son lien, ou saisies a la main par le CS). Une date "acceptee" =
-- validee = 1 (validation par un membre du CS ou un occupant) ou saisie
-- directement en date_planifiee de la consultation par le CS.
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
-- Index sur consultations/fichiers.crees dans migrate.js (migration v2) :
-- une vieille base n'a pas encore ces colonnes au moment de lire ce fichier.
CREATE INDEX IF NOT EXISTS idx_resolutions_ticket ON resolutions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sollicitations_consultation ON sollicitations(consultation_id);
CREATE INDEX IF NOT EXISTS idx_acces_externes_consultation ON acces_externes(consultation_id);
CREATE INDEX IF NOT EXISTS idx_acces_externes_token ON acces_externes(token);
CREATE INDEX IF NOT EXISTS idx_consultation_dates_consultation ON consultation_dates(consultation_id);

-- Documents de la copropriete (spec 34) : depot gere par le CS/admin, avec
-- categorie thematique obligatoire, niveau d'acces (loi) et tags custom.
-- niveau 'prive' : unit_id = unite destinataire (visible par ses residents + admin).
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titre TEXT NOT NULL,
  categorie TEXT NOT NULL CHECK (categorie IN ('juridique','instances','technique','comptable')),
  niveau TEXT NOT NULL CHECK (niveau IN ('commun','controle','prive')),
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  nom_original TEXT NOT NULL,
  nom_stockage TEXT NOT NULL,
  mime TEXT NOT NULL,
  taille INTEGER NOT NULL,
  auteur_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_tags (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags(tag_id);

CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL UNIQUE,
  designation TEXT NOT NULL DEFAULT '',
  type_lot TEXT NOT NULL DEFAULT '',
  tantiemes INTEGER NOT NULL DEFAULT 0,
  proprietaire_brut TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lot_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','accepte','refuse')),
  demande_par INTEGER REFERENCES users(id),
  valide_par INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  valide_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_units_unit_actif ON lot_units(unit_id) WHERE statut IN ('en_attente','accepte');
CREATE INDEX IF NOT EXISTS idx_lot_units_lot ON lot_units(lot_id);
CREATE INDEX IF NOT EXISTS idx_lots_user ON lots(user_id);

CREATE TABLE IF NOT EXISTS lot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id INTEGER NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  auteur_id INTEGER REFERENCES users(id),
  contenu TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lot_events_lot ON lot_events(lot_id);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mesure de l'usage (spec 38) : une ligne par connexion reussie.
CREATE TABLE IF NOT EXISTS connexions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_connexions_user ON connexions(user_id);
CREATE INDEX IF NOT EXISTS idx_connexions_created ON connexions(created_at);

-- Mesure de l'usage (spec 38) : une ligne par consultation de page HTML
-- (GET, utilisateur connecte ; hors racine, telechargements et export).
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chemin TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_chemin ON page_views(chemin);
CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views(user_id);

-- Mesure de l'usage (spec 38) : journal des creations/modifications
-- (tickets, fichiers, documents). Le contenu ne contient PAS le nom de
-- l'auteur (joint par auteur_id) : a la suppression du compte, auteur_id
-- passe a NULL et l'historique reste lisible ("Compte supprimé").
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  auteur_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entite TEXT NOT NULL DEFAULT '',
  entite_id INTEGER,
  contenu TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_type ON audit_log(type);
CREATE INDEX IF NOT EXISTS idx_audit_log_auteur ON audit_log(auteur_id);
