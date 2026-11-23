const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIMES_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const TAILLE_MAX = 10 * 1024 * 1024;

// Documents de la copropriete (spec 34) : limite 2 Mo par fichier. On accepte
// jusqu'a 30 Mo en entree pour pouvoir compresser les images qui depassent
// 2 Mo ; un PDF > 2 Mo est refuse (non compressible).
const TAILLE_MAX_DOC = 2 * 1024 * 1024;
const TAILLE_MAX_ENTREE_DOC = 30 * 1024 * 1024;

const uploadDocuments = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX_ENTREE_DOC, files: 10 },
  fileFilter: (req, file, cb) => {
    if (MIMES_OK.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Type de fichier non autorisé (JPEG, PNG, WebP ou PDF uniquement).'));
  }
});

// Compression JPEG progressive (qualite puis dimensions) pour passer sous la limite.
async function compresserImageAuPoids(buf, limite) {
  for (const q of [80, 65, 50, 35]) {
    const out = await sharp(buf).jpeg({ quality: q }).toBuffer();
    if (out.length <= limite) return out;
  }
  let width = 1600;
  while (width >= 400) {
    const out = await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    if (out.length <= limite) return out;
    width = Math.round(width * 0.75);
  }
  return sharp(buf).resize({ width: 400 }).jpeg({ quality: 50 }).toBuffer();
}

// Enregistre un fichier document (multer memoryStorage) sur le disque sous un
// nom aleatoire. Image > 2 Mo => compressee automatiquement ; PDF > 2 Mo =>
// erreur explicite. Retourne { nomStockage, mime, taille }.
async function enregistrerDocument(f) {
  let buffer = f.buffer;
  let mime = f.mimetype;
  let ext = path.extname(f.originalname).toLowerCase();
  if (mime === 'application/pdf') {
    if (buffer.length > TAILLE_MAX_DOC) {
      throw new Error(`« ${f.originalname} » dépasse 2 Mo : les PDF ne sont pas compressés, envoi refusé.`);
    }
  } else {
    if (buffer.length > TAILLE_MAX_DOC) {
      buffer = await compresserImageAuPoids(buffer, TAILLE_MAX_DOC);
      if (buffer.length > TAILLE_MAX_DOC) {
        throw new Error(`« ${f.originalname} » : impossible de compresser sous 2 Mo, envoi refusé.`);
      }
      mime = 'image/jpeg';
      ext = '.jpg';
    } else if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      ext = mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg';
    }
  }
  const nomStockage = crypto.randomBytes(16).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, nomStockage), buffer);
  return { nomStockage, mime, taille: buffer.length };
}

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

function enregistrerFichiers(db, ticketId, categorie, files, meta, auteurId, contexte = 'creation', cycle = null) {
  const ins = db.prepare(
    `INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, entreprise, delai, contexte, cycle, auteur_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const f of files || []) {
    ins.run(ticketId, categorie, f.originalname, f.filename, f.mimetype, f.size,
      meta.montant ?? null, meta.entreprise || null, meta.delai || null, contexte, cycle, auteurId);
  }
}

module.exports = { upload, enregistrerFichiers, UPLOAD_DIR, MIMES_OK, TAILLE_MAX, uploadDocuments, enregistrerDocument, TAILLE_MAX_DOC };
