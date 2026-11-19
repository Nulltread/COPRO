const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const { upload, UPLOAD_DIR } = require('../upload');
const { trouverAccesValide, chargerContexte, unitesLabels, photosDescription, notifierDevisPrestataire, notifierDatesProposees, mailPrestataire } = require('../sollicitations');
const { notifierCS } = require('../notifications');

// Espace prestataire (sans compte) : version reduite du ticket via un jeton
// personnel valable 7 jours max (voir specifications/sollicitations-relances.md).
// Aucune authentification : le jeton (32 octets) fait foi, scoping a la
// consultation : titre, description, photos de la description, devis de la
// consultation uniquement.

const router = express.Router();

function nettoyerFichiers(files) {
  for (const f of files || []) { try { fs.unlinkSync(f.path); } catch (e) {} }
}

function pageErreur(req, res, status, message) {
  return res.status(status).render('erreur', { user: req.user || null, message });
}

// Valide le jeton et charge le contexte (consultation + entreprise + ticket).
function contexteValide(req, res) {
  const db = getDb();
  const acces = trouverAccesValide(db, req.params.token);
  if (!acces) {
    pageErreur(req, res, 404, 'Ce lien n’est plus valide : il expire après 7 jours. Demandez un nouvel envoi au conseil syndical.');
    return null;
  }
  const c = chargerContexte(db, acces.consultation_id);
  if (!c) {
    pageErreur(req, res, 404, 'Consultation introuvable.');
    return null;
  }
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(c.ticket_id);
  const entreprise = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(c.entreprise_id);
  return { db, acces, c, ticket, entreprise };
}

router.get('/:token', (req, res) => {
  const ctx = contexteValide(req, res);
  if (!ctx) return;
  const { db, c } = ctx;
  const unites = unitesLabels(db, c.ticket_id);
  const photos = photosDescription(db, c.ticket_id);
  const devis = db.prepare("SELECT * FROM fichiers WHERE consultation_id = ? AND categorie = 'devis' ORDER BY created_at, id").all(c.id);
  const dates = db.prepare('SELECT * FROM consultation_dates WHERE consultation_id = ? ORDER BY created_at, id').all(c.id);
  // dépôt de devis ouvert tant que la consultation est active (ticket en consultation) ;
  // proposition de dates ouverte une fois la consultation sélectionnée
  const peutDeposerDevis = c.ticket_etape === 'consultation' && !c.caduque && !c.validee;
  const peutProposerDates = c.ticket_etape === 'consultation' && !c.caduque && !!c.validee;
  res.render('consultation-publique', {
    user: req.user || null,
    token: req.params.token,
    c, unites, photos, devis, dates,
    peutDeposerDevis, peutProposerDates,
    ok: req.query.ok || null,
    erreur: req.query.erreur || null
  });
});

// Sert uniquement les photos de la description du ticket et le devis de CETTE
// consultation (jamais les autres fichiers du ticket).
router.get('/:token/fichiers/:fid', (req, res) => {
  const ctx = contexteValide(req, res);
  if (!ctx) return;
  const { db, c } = ctx;
  const f = db.prepare('SELECT * FROM fichiers WHERE id = ?').get(Number(req.params.fid));
  const autorise = !!f && f.ticket_id === c.ticket_id && (
    (f.categorie === 'photo' && (f.contexte || 'creation') === 'creation') ||
    (f.categorie === 'devis' && f.consultation_id === c.id)
  );
  if (!autorise) return pageErreur(req, res, 404, 'Fichier introuvable.');
  const chemin = path.join(UPLOAD_DIR, f.nom_stockage);
  if (!fs.existsSync(chemin)) return pageErreur(req, res, 404, 'Fichier introuvable sur le serveur.');
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.nom_original)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(chemin).pipe(res);
});

// Dépôt du devis par le prestataire : pièce jointe + montant + entreprise
// (raison sociale) modifiable facultativement. Remplace un éventuel devis
// existant (1 seul devis par consultation). Notifie les membres du CS avec un
// lien direct vers le fichier.
router.post('/:token/devis', (req, res) => {
  const ctx = contexteValide(req, res);
  if (!ctx) return;
  const { db, c, ticket, entreprise } = ctx;
  if (!(c.ticket_etape === 'consultation' && !c.caduque && !c.validee)) {
    return pageErreur(req, res, 400, 'Le dépôt de devis n’est plus ouvert pour cette consultation.');
  }
  upload.single('devis_fichiers')(req, res, (err) => {
    if (err) return pageErreur(req, res, 400, err.message);
    const montant = Number(req.body.devis_montant);
    if (!req.file || !(montant > 0)) {
      nettoyerFichiers(req.files);
      return res.redirect('/consultation/' + req.params.token + '?erreur=' + encodeURIComponent('Le devis exige une pièce jointe (PDF ou image) et un montant supérieur à 0.'));
    }
    // entreprise modifiable (facultatif) : raison sociale
    const raison = (req.body.entreprise_raison || '').trim();
    if (raison && raison !== entreprise.raison_sociale) {
      db.prepare('UPDATE entreprises SET raison_sociale = ?, updated_at = datetime(\'now\') WHERE id = ?').run(raison, entreprise.id);
    }
    // 1 seul devis par consultation : le nouveau remplace l'ancien
    const anciens = db.prepare("SELECT nom_stockage FROM fichiers WHERE consultation_id = ? AND categorie = 'devis'").all(c.id);
    for (const f of anciens) {
      const chemin = path.join(UPLOAD_DIR, f.nom_stockage);
      if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
    }
    db.prepare("DELETE FROM fichiers WHERE consultation_id = ? AND categorie = 'devis'").run(c.id);
    const info = db.prepare(
      `INSERT INTO fichiers (ticket_id, categorie, nom_original, nom_stockage, mime, taille, montant, consultation_id, auteur_id, auteur_externe)
       VALUES (?, 'devis', ?, ?, ?, ?, ?, ?, NULL, ?)`
    ).run(c.ticket_id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, montant, c.id, raison || entreprise.raison_sociale);
    const fichierId = info.lastInsertRowid;
    const raisonAffichee = raison || entreprise.raison_sociale;
    db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'devis_prestataire', NULL, ?)")
      .run(ticket.id, `Le prestataire « ${raisonAffichee} » a déposé un devis (${montant.toFixed(2)} €, ${req.file.originalname})`);
    notifierDevisPrestataire(db, ticket, entreprise, fichierId, montant, raisonAffichee);
    res.redirect('/consultation/' + req.params.token + '?ok=devis');
  });
});

// Proposition de dates d'intervention par le prestataire (plusieurs dates,
// heure facultative) — consultation sélectionnée, ticket encore en consultation.
router.post('/:token/dates', (req, res, next) => {
  // accepte aussi un corps multipart (champs texte uniquement)
  upload.none()(req, res, (err) => { if (err) return pageErreur(req, res, 400, err.message); next(); });
}, (req, res) => {
  const ctx = contexteValide(req, res);
  if (!ctx) return;
  const { db, c, ticket, entreprise } = ctx;
  if (!(c.ticket_etape === 'consultation' && !c.caduque && c.validee)) {
    return pageErreur(req, res, 400, 'La proposition de dates n’est pas ouverte pour cette consultation.');
  }
  let dates = req.body.dates || [];
  if (!Array.isArray(dates)) dates = [dates];
  let heures = req.body.heures || [];
  if (!Array.isArray(heures)) heures = [heures];
  const valides = dates
    .map((d, i) => ({ date: String(d || '').trim(), heure: String((heures[i] || '')).trim() }))
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
  if (valides.length === 0) {
    return res.redirect('/consultation/' + req.params.token + '?erreur=' + encodeURIComponent('Proposez au moins une date (format AAAA-MM-JJ).'));
  }
  const ins = db.prepare("INSERT INTO consultation_dates (consultation_id, date, heure, propose_par) VALUES (?, ?, ?, 'prestataire')");
  for (const v of valides) ins.run(c.id, v.date, v.heure || null);
  const raisonAffichee = entreprise.raison_sociale;
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'dates_proposees', NULL, ?)")
    .run(ticket.id, `Le prestataire « ${raisonAffichee} » a proposé ${valides.length} date(s) : ${valides.map(v => v.date + (v.heure ? ` à ${v.heure}` : '')).join(', ')}`);
  notifierDatesProposees(db, ticket, entreprise, raisonAffichee, valides);
  res.redirect('/consultation/' + req.params.token + '?ok=dates');
});

module.exports = router;
