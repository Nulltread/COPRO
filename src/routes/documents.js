const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const {
  isGestionnaire, isAdmin, unitsDeUser, peutVoirTicket, peutVoirDocument,
  CATEGORIES_DOCUMENT, ETIQUETTES_CATEGORIES_DOCUMENT, NIVEAUX_ACCES, ETIQUETTES_NIVEAUX
} = require('../droits');
const { uploadDocuments, enregistrerDocument, UPLOAD_DIR, TAILLE_MAX_DOC } = require('../upload');

const router = express.Router();
router.use(requireAuth);

function requireGestionnaire(req, res, next) {
  if (!isGestionnaire(req.user)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Page réservée au conseil syndical et à l\'administrateur.' });
  }
  next();
}

function tailleLisible(t) {
  if (t >= 1024 * 1024) return (t / (1024 * 1024)).toFixed(1) + ' Mo';
  if (t >= 1024) return Math.round(t / 1024) + ' Ko';
  return t + ' o';
}

// Valeurs de tags : id numerique (tag existant) ou nom libre (creation).
function parseTags(db, valeurs) {
  const liste = Array.isArray(valeurs) ? valeurs : [valeurs];
  const ids = [];
  for (let v of liste) {
    v = String(v || '').trim();
    if (!v) continue;
    if (/^\d+$/.test(v)) {
      const t = db.prepare('SELECT id FROM tags WHERE id = ?').get(Number(v));
      if (t) ids.push(t.id);
    } else {
      if (v.length > 60) v = v.slice(0, 60);
      db.prepare('INSERT OR IGNORE INTO tags (nom) VALUES (?)').run(v);
      ids.push(db.prepare('SELECT id FROM tags WHERE nom = ?').get(v).id);
    }
  }
  return [...new Set(ids)];
}

function tagsOptions(db) {
  return db.prepare('SELECT id AS value, nom AS label FROM tags ORDER BY nom COLLATE NOCASE')
    .all().map(t => ({ value: String(t.value), label: t.label }));
}

function docAvecTags(db, doc) {
  const tags = db.prepare(
    `SELECT t.id, t.nom FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
     WHERE dt.document_id = ? ORDER BY t.nom COLLATE NOCASE`
  ).all(doc.id);
  return { ...doc, tags, tags_noms: tags.map(t => t.nom).join('|'), tags_ids: tags.map(t => t.id).join('|') };
}

// Liste unifiee : documents deposes (visibles selon le niveau d'acces) +
// devis/factures des tickets (visibilite = celle du ticket, spec 34).
function listeDocuments(user, filtres) {
  const db = getDb();
  const cat = filtres.categorie || '';
  const tagsSel = (Array.isArray(filtres.tag) ? filtres.tag : [filtres.tag])
    .filter(Boolean).map(Number);
  const items = [];
  if (!cat || CATEGORIES_DOCUMENT.includes(cat)) {
    const docs = db.prepare(
      `SELECT d.*, u.nom AS auteur_nom, un.label AS unite_label FROM documents d
       LEFT JOIN users u ON u.id = d.auteur_id
       LEFT JOIN units un ON un.id = d.unit_id
       ORDER BY d.created_at DESC, d.id DESC`
    ).all()
      .filter(d => peutVoirDocument(user, d))
      .map(d => docAvecTags(db, d))
      .filter(d => !cat || d.categorie === cat)
      .filter(d => tagsSel.length === 0 || (d.tags_ids || '').split('|').map(Number).some(id => tagsSel.includes(id)))
      .map(d => ({ source: 'depot', ...d, taille_lisible: tailleLisible(d.taille) }));
    items.push(...docs);
  }
  if (!cat || ['devis', 'facture'].includes(cat)) {
    // Les fichiers de tickets n'ont pas de tags : exclus si un filtre tag est actif.
    if (tagsSel.length === 0) {
      const fichiers = db.prepare(
        `SELECT f.*, t.titre AS ticket_titre FROM fichiers f
         JOIN tickets t ON t.id = f.ticket_id
         WHERE f.categorie IN ('devis','facture')
         ORDER BY f.created_at DESC, f.id DESC`
      ).all()
        .filter(f => peutVoirTicket(user, f.ticket_id))
        .filter(f => !cat || f.categorie === cat)
        .map(f => ({ source: 'ticket', ...f, titre: f.nom_original, taille_lisible: tailleLisible(f.taille) }));
      items.push(...fichiers);
    }
  }
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '') || (b.id - a.id));
  return items;
}

router.get('/', (req, res) => {
  const db = getDb();
  const cat = CATEGORIES_DOCUMENT.includes(req.query.categorie) || ['devis', 'facture'].includes(req.query.categorie)
    ? req.query.categorie : '';
  const items = listeDocuments(req.user, { categorie: cat, tag: req.query.tag });
  const etiquettesFiltre = {
    ...ETIQUETTES_CATEGORIES_DOCUMENT,
    devis: 'Devis (tickets)',
    facture: 'Factures (tickets)'
  };
  res.render('documents', {
    user: req.user,
    gestionnaire: isGestionnaire(req.user),
    admin: isAdmin(req.user),
    mesUnites: unitsDeUser(req.user.id),
    items,
    filtres: { categorie: cat },
    categories: CATEGORIES_DOCUMENT,
    etiquettesCategories: ETIQUETTES_CATEGORIES_DOCUMENT,
    etiquettesFiltre,
    etiquettesNiveaux: ETIQUETTES_NIVEAUX,
    tagsOptions: tagsOptions(db),
    tagsSel: (Array.isArray(req.query.tag) ? req.query.tag : [req.query.tag]).filter(Boolean),
    message: req.query.message || null
  });
});

function formData(db, erreur, body = {}) {
  return {
    user: null, // remplit par l'appelant
    erreur,
    form: {
      categorie: body.categorie || '',
      niveau: body.niveau || ''
    },
    categories: CATEGORIES_DOCUMENT,
    etiquettesCategories: ETIQUETTES_CATEGORIES_DOCUMENT,
    niveaux: NIVEAUX_ACCES,
    etiquettesNiveaux: ETIQUETTES_NIVEAUX,
    unites: db.prepare('SELECT * FROM units ORDER BY type DESC, numero').all(),
    tagsOptions: tagsOptions(db)
  };
}

router.get('/nouveau', requireGestionnaire, (req, res) => {
  res.render('document-form', { ...formData(getDb(), null), user: req.user });
});

router.post('/', requireGestionnaire, (req, res) => {
  uploadDocuments.array('fichiers', 10)(req, res, async (err) => {
    const db = getDb();
    const rendreErreur = (message, statut = 400) =>
      res.status(statut).render('document-form', { ...formData(db, message, req.body), user: req.user });
    if (err) return rendreErreur(err.message);
    if (!req.files || req.files.length === 0) return rendreErreur('Aucun fichier sélectionné.');
    const categorie = String(req.body.categorie || '');
    const niveau = String(req.body.niveau || '');
    if (!CATEGORIES_DOCUMENT.includes(categorie)) return rendreErreur('La catégorie est obligatoire.');
    if (!NIVEAUX_ACCES.includes(niveau)) return rendreErreur('Le niveau d\'accès est obligatoire.');
    let unitId = null;
    if (niveau === 'prive') {
      unitId = Number(req.body.unit_id || 0) || null;
      if (!unitId || !db.prepare('SELECT id FROM units WHERE id = ?').get(unitId)) {
        return rendreErreur('Pour un document « privé », choisissez l\'unité destinataire.');
      }
    }
    const tagIds = parseTags(db, req.body.tags);
    // Enregistrement sur le disque (avec compression des images > 2 Mo) ;
    // en cas d'erreur, on supprime les fichiers et lignes deja ecrits (spec 34).
    const ecrits = [];
    const docIds = [];
    try {
      for (const f of req.files) {
        const enreg = await enregistrerDocument(f);
        ecrits.push(enreg.nomStockage);
        const info = db.prepare(
          `INSERT INTO documents (titre, categorie, niveau, unit_id, nom_original, nom_stockage, mime, taille, auteur_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(f.originalname, categorie, niveau, unitId, f.originalname, enreg.nomStockage, enreg.mime, enreg.taille, req.user.id);
        docIds.push(Number(info.lastInsertRowid));
        const ins = db.prepare('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)');
        for (const tid of tagIds) ins.run(info.lastInsertRowid, tid);
      }
    } catch (e) {
      for (const nom of ecrits) {
        const p = path.join(UPLOAD_DIR, nom);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      if (docIds.length) {
        db.prepare('DELETE FROM documents WHERE id IN (' + docIds.map(() => '?').join(',') + ')').run(...docIds);
      }
      return rendreErreur(e.message);
    }
    res.redirect('/documents?message=' + encodeURIComponent(`${req.files.length} document(s) ajouté(s).`));
  });
});

function docValide(user, id) {
  const db = getDb();
  const doc = db.prepare(
    `SELECT d.*, u.nom AS auteur_nom, un.label AS unite_label FROM documents d
     LEFT JOIN users u ON u.id = d.auteur_id
     LEFT JOIN units un ON un.id = d.unit_id
     WHERE d.id = ?`
  ).get(Number(id));
  if (!doc || !peutVoirDocument(user, doc)) return null;
  return docAvecTags(db, doc);
}

router.get('/:id', (req, res) => {
  const db = getDb();
  const doc = docValide(req.user, req.params.id);
  if (!doc) return res.status(404).render('erreur', { user: req.user, message: 'Document introuvable.' });
  res.render('document-detail', {
    user: req.user,
    doc: { ...doc, taille_lisible: tailleLisible(doc.taille) },
    gestionnaire: isGestionnaire(req.user),
    categories: CATEGORIES_DOCUMENT,
    etiquettesCategories: ETIQUETTES_CATEGORIES_DOCUMENT,
    etiquettesNiveaux: ETIQUETTES_NIVEAUX,
    tagsOptions: tagsOptions(db),
    message: req.query.message || null
  });
});

// Modification des tags : reservee au gestionnaire (spec 34).
router.post('/:id/tags', requireGestionnaire, (req, res) => {
  const db = getDb();
  const doc = docValide(req.user, req.params.id);
  if (!doc) return res.status(404).render('erreur', { user: req.user, message: 'Document introuvable.' });
  const tagIds = parseTags(db, req.body.tags);
  db.prepare('DELETE FROM document_tags WHERE document_id = ?').run(doc.id);
  const ins = db.prepare('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)');
  for (const tid of tagIds) ins.run(doc.id, tid);
  res.redirect('/documents/' + doc.id + '?message=' + encodeURIComponent('Tags mis à jour.'));
});

router.post('/:id/supprimer', requireGestionnaire, (req, res) => {
  const db = getDb();
  const doc = docValide(req.user, req.params.id);
  if (!doc) return res.status(404).render('erreur', { user: req.user, message: 'Document introuvable.' });
  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  const chemin = path.join(UPLOAD_DIR, doc.nom_stockage);
  if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
  res.redirect('/documents?message=' + encodeURIComponent(`Document « ${doc.titre} » supprimé.`));
});

// Telechargement/visualisation securisee : inline + nosniff, apres verification
// du niveau d'acces — pas d'URL publique (spec 34 + visibilite.md).
router.get('/:id/fichier', (req, res) => {
  const doc = docValide(req.user, req.params.id);
  if (!doc) return res.status(404).render('erreur', { user: req.user, message: 'Document introuvable.' });
  const chemin = path.join(UPLOAD_DIR, doc.nom_stockage);
  if (!fs.existsSync(chemin)) return res.status(404).render('erreur', { user: req.user, message: 'Fichier introuvable sur le serveur.' });
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.nom_original)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(chemin).pipe(res);
});

module.exports = router;
