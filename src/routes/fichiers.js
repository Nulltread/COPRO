const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const { requireAuth } = require('../auth');
const { peutVoirTicket, isGestionnaire } = require('../droits');
const { UPLOAD_DIR } = require('../upload');

const router = express.Router();
router.use(requireAuth);

// La section documents libre disparait (spec 20) : les devis vivent dans les
// consultations, les factures dans leur section, les photos ne sont ajoutables
// qu'aux 3 moments cadres. Il ne reste ici que la lecture et la suppression
// des photos.

// Suppression d'une photo : son auteur ou le conseil syndical.
router.post('/fichiers/:id/supprimer', (req, res) => {
  const db = getDb();
  const f = db.prepare('SELECT * FROM fichiers WHERE id = ?').get(Number(req.params.id));
  if (!f) return res.status(404).render('erreur', { user: req.user, message: 'Fichier introuvable.' });
  if (f.categorie !== 'photo' || (f.auteur_id !== req.user.id && !isGestionnaire(req.user))) {
    return res.status(403).render('erreur', { user: req.user, message: 'Seul l\'auteur d\'une photo (ou le conseil syndical) peut la supprimer.' });
  }
  const chemin = path.join(UPLOAD_DIR, f.nom_stockage);
  db.prepare('DELETE FROM fichiers WHERE id = ?').run(f.id);
  if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'edition', ?, ?)")
    .run(f.ticket_id, req.user.id, `${req.user.nom} a supprimé une photo (${f.nom_original})`);
  res.redirect('/tickets/' + f.ticket_id);
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
