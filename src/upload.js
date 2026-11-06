const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIMES_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const TAILLE_MAX = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase());
  }
});

const upload = multer({
  storage,
  limits: { fileSize: TAILLE_MAX, files: 10 },
  fileFilter: (req, file, cb) => {
    if (MIMES_OK.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Type de fichier non autorisé (JPEG, PNG, WebP ou PDF uniquement).'));
  }
});

function enregistrerFichiers(db, ticketId, categorie, files, meta, auteurId) {
  const ins = db.prepare(
    `INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, entreprise, delai, auteur_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const f of files || []) {
    ins.run(ticketId, categorie, f.originalname, f.filename, f.mimetype, f.size,
      meta.montant ?? null, meta.entreprise || null, meta.delai || null, auteurId);
  }
}

module.exports = { upload, enregistrerFichiers, UPLOAD_DIR, MIMES_OK, TAILLE_MAX };
