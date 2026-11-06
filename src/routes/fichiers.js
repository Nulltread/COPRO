const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const { peutVoirTicket, isGestionnaire } = require('../droits');
const { notifierTicket } = require('../notifications');
const { upload, enregistrerFichiers, UPLOAD_DIR } = require('../upload');

const router = express.Router();
router.use(requireAuth);

router.post('/tickets/:id/fichiers', (req, res) => {
  const id = Number(req.params.id);
  if (!peutVoirTicket(req.user, id)) return res.status(403).render('erreur', { user: req.user, message: 'Ticket introuvable.' });
  upload.array('fichiers', 10)(req, res, (err) => {
    if (err) return res.status(400).render('erreur', { user: req.user, message: err.message });
    const db = getDb();
    const { categorie, montant, entreprise, delai } = req.body;
    const catsValides = ['photo', 'devis', 'avenant', 'facture', 'decision', 'compte_rendu'];
    const montantValide = montant !== undefined && montant !== null && montant !== '' ? Number(montant) : null;
    if (!catsValides.includes(categorie) || (montantValide !== null && Number.isNaN(montantValide))) {
      for (const f of req.files || []) fs.unlinkSync(f.path);
      return res.status(400).render('erreur', { user: req.user, message: 'Catégorie ou montant invalide.' });
    }
    enregistrerFichiers(db, id, categorie, req.files, {
      montant: montantValide,
      entreprise: (entreprise || '').trim() || null,
      delai: (delai || '').trim() || null
    }, req.user.id);
    if ((req.files || []).length > 0) {
      db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'fichier', ?, ?)")
        .run(id, req.user.id, `${req.user.nom} a ajouté ${req.files.length} fichier(s) (${categorie})`);
      const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
      notifierTicket(t, 'fichier', `${req.user.nom} a ajouté un document (${categorie}) sur « ${t.titre} »`, req.user.id, !!t.urgent);
    }
    res.redirect('/tickets/' + id);
  });
});

router.get('/fichiers/:id', (req, res) => {
  const db = getDb();
  const f = db.prepare('SELECT * FROM fichiers WHERE id = ?').get(Number(req.params.id));
  if (!f) return res.status(404).render('erreur', { user: req.user, message: 'Fichier introuvable.' });
  if (!peutVoirTicket(req.user, f.ticket_id)) {
    return res.status(403).render('erreur', { user: req.user, message: 'Ce document ne vous concerne pas.' });
  }
  const chemin = path.join(UPLOAD_DIR, f.nom_stockage);
  if (!fs.existsSync(chemin)) return res.status(404).render('erreur', { user: req.user, message: 'Fichier introuvable sur le serveur.' });
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.nom_original)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(chemin).pipe(res);
});

module.exports = router;
