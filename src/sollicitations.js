const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');
const { envoyerMail, config } = require('./mail');
const { UPLOAD_DIR } = require('./upload');
const { notifierCS } = require('./notifications');

// Sollicitations / relances des prestataires et espace prestataire (lien a
// duree de vie limitee) — voir specifications/sollicitations-relances.md.

const DUREE_JETON_JOURS = 7;
const NB_MAX_PHOTOS = 10;          // photos de la description jointes au mail
const TAILLE_MAX_PIECES = 20 * 1024 * 1024; // total des pieces jointes (Mo)

// Cree un jeton d'acces externe pour une consultation (lien public, 7 jours max).
function creerJetonAcces(db, consultationId, type = 'devis') {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + DUREE_JETON_JOURS * 86400000).toISOString();
  db.prepare('INSERT INTO acces_externes (consultation_id, token, type, expires_at) VALUES (?, ?, ?, ?)')
    .run(consultationId, token, type, expires);
  return { token, expires_at: expires, lien: `${config().baseUrl}/consultation/${token}` };
}

// Jeton valide (existe et non expire) -> ligne acces_externes, sinon null.
function trouverAccesValide(db, token) {
  if (!token) return null;
  const a = db.prepare('SELECT * FROM acces_externes WHERE token = ?').get(String(token));
  if (!a) return null;
  if (new Date(a.expires_at) < new Date()) return null;
  return a;
}

function chargerContexte(db, consultationId) {
  return db.prepare(
    `SELECT c.*, e.raison_sociale, e.siren_siret, e.contact_nom, e.telephone AS ent_telephone, e.mail AS ent_mail,
            t.id AS ticket_id, t.titre, t.description, t.etape AS ticket_etape, t.urgent AS ticket_urgent
     FROM consultations c
     JOIN entreprises e ON e.id = c.entreprise_id
     JOIN tickets t ON t.id = c.ticket_id
     WHERE c.id = ?`
  ).get(consultationId);
}

function unitesLabels(db, ticketId) {
  return db.prepare(
    'SELECT u.label FROM units u JOIN ticket_units tu ON tu.unit_id = u.id WHERE tu.ticket_id = ? ORDER BY u.type DESC, u.numero'
  ).all(ticketId).map(r => r.label);
}

function photosDescription(db, ticketId) {
  return db.prepare(
    "SELECT * FROM fichiers WHERE ticket_id = ? AND categorie = 'photo' AND contexte = 'creation' ORDER BY created_at, id"
  ).all(ticketId);
}

// Photos de la description en pieces jointes du mail (plafonnees).
function piecesJointesPhotos(photos) {
  const out = [];
  let total = 0;
  for (const p of (photos || []).slice(0, NB_MAX_PHOTOS)) {
    let data;
    try { data = fs.readFileSync(path.join(UPLOAD_DIR, p.nom_stockage)); } catch (e) { continue; }
    if (total + data.length > TAILLE_MAX_PIECES) break;
    total += data.length;
    out.push({ filename: p.nom_original, contentType: p.mime, data });
  }
  return out;
}

function salutation(ent) {
  return `Bonjour ${ent.contact_nom ? `${ent.contact_nom} (${ent.raison_sociale})` : ent.raison_sociale},`;
}

function pied() {
  return `Merci d'avance,\nLe conseil syndical de la copropriété La Pinède de Notre Dame`;
}

function texteSollicitation({ ent, ticket, unites, lien, relance, dernierEnvoi, nbPhotos, nbJointes }) {
  const base = `${salutation(ent)}

Dans le cadre du ticket « ${ticket.titre} » (${unites.join(', ')}) de la copropriété La Pinède de Notre Dame, nous vous sollicitons pour un devis.

${ticket.description ? `Description : ${ticket.description}\n` : ''}${nbPhotos > 0 ? `\n${nbJointes} photo(s) de la situation sont jointes à ce message${nbJointes < nbPhotos ? ` (sur ${nbPhotos} au total, les autres sont visibles via le lien ci-dessous)` : ''}.\n` : ''}
Vous pouvez déposer votre devis (fichier PDF ou image + montant en €) directement en ligne via ce lien personnel :
${lien}

Ce lien est valable ${DUREE_JETON_JOURS} jours.

${pied()}`;
  if (!relance) return base;
  return `${salutation(ent)}

Nous vous avions déjà sollicité${dernierEnvoi ? ` le ${dernierEnvoi}` : ''} pour le ticket « ${ticket.titre} » (${unites.join(', ')}) et n'avons pas encore reçu de devis. Nous vous remercions de bien vouloir déposer votre proposition via ce lien personnel (valable ${DUREE_JETON_JOURS} jours) :
${lien}

${ticket.description ? `Rappel de la description : ${ticket.description}\n` : ''}${nbPhotos > 0 ? `\n${nbJointes} photo(s) jointes à ce message.\n` : ''}
${pied()}`;
}

function texteDatesSelection({ ent, ticket, unites, lien }) {
  return `${salutation(ent)}

Votre devis pour le ticket « ${ticket.titre} » (${unites.join(', ')}) a été retenu par le conseil syndical de la copropriété La Pinède de Notre Dame.

Merci de nous proposer vos dates d'intervention (une ou plusieurs, l'heure est facultative) directement en ligne via ce lien personnel :
${lien}

Ce lien est valable ${DUREE_JETON_JOURS} jours. Une fois vos dates envoyées, l'une d'elles sera validée par le conseil syndical ou l'occupant concerné.

${pied()}`;
}

function texteAccuseDevis({ ent, ticket, montant }) {
  return `${salutation(ent)}

Nous avons bien reçu votre devis de ${montant.toFixed(2)} € pour le ticket « ${ticket.titre} ». Le conseil syndical va l'étudier.

${pied()}`;
}

function texteAccuseDates({ ent, ticket, dates }) {
  return `${salutation(ent)}

Vos dates d'intervention pour le ticket « ${ticket.titre} » ont bien été envoyées :
${dates.map(d => `- ${d.date}${d.heure ? ` à ${d.heure}` : ''}`).join('\n')}

L'une d'elles sera validée par le conseil syndical ou l'occupant concerné.

${pied()}`;
}

function texteDateRetenue({ ent, ticket, date, heure }) {
  return `${salutation(ent)}

La date du ${date}${heure ? ` à ${heure}` : ''} que vous avez proposée pour le ticket « ${ticket.titre} » a été retenue.

${pied()}`;
}

// Envoi d'un mail au prestataire (adresse de la fiche entreprise).
function mailPrestataire(ent, subject, text) {
  const to = (ent.mail || '').trim();
  if (!to) return Promise.resolve(false);
  return envoyerMail({ to, subject, text });
}

// Sollicite (ou relance) une consultation par email. Retourne { ok, raison }.
function solliciterConsultation(db, ticket, consultation, auteur) {
  const ent = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(consultation.entreprise_id);
  if (!ent || !(ent.mail || '').trim()) return { ok: false, raison: 'email_manquant' };
  const nbDevis = db.prepare("SELECT COUNT(*) AS n FROM fichiers WHERE consultation_id = ? AND categorie = 'devis'").get(consultation.id).n;
  if (nbDevis > 0) return { ok: false, raison: 'devis_deja_depose' };
  const nbPrecedent = db.prepare('SELECT COUNT(*) AS n FROM sollicitations WHERE consultation_id = ?').get(consultation.id).n;
  const dernier = db.prepare('SELECT created_at FROM sollicitations WHERE consultation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(consultation.id);
  const type = nbPrecedent > 0 ? 'relance' : 'sollicitation';
  db.prepare('INSERT INTO sollicitations (consultation_id, auteur_id, type) VALUES (?, ?, ?)').run(consultation.id, auteur ? auteur.id : null, type);
  const { lien } = creerJetonAcces(db, consultation.id, 'devis');
  const unites = unitesLabels(db, ticket.id);
  const photos = photosDescription(db, ticket.id);
  const attachments = piecesJointesPhotos(photos);
  const text = texteSollicitation({
    ent, ticket, unites, lien, relance: type === 'relance',
    dernierEnvoi: dernier ? dernier.created_at : null,
    nbPhotos: photos.length, nbJointes: attachments.length
  });
  const subject = `${type === 'relance' ? 'Relance — ' : ''}Sollicitation de devis — « ${ticket.titre} » — Copro La Pinède de Notre Dame`;
  envoyerMail({ to: ent.mail.trim(), subject, text, attachments });
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'sollicitation', ?, ?)")
    .run(ticket.id, auteur ? auteur.id : null,
      `${auteur ? auteur.nom : 'Le conseil syndical'} a ${type === 'relance' ? 'relancé' : 'sollicité'} par email « ${ent.raison_sociale} » (${ent.mail.trim()})${dernier ? ` — première sollicitation le ${dernier.created_at}` : ''}`);
  return { ok: true, type, ent };
}

// A la selection : mail au prestataire pour completer les dates (lien 7 jours).
function envoyerMailDatesSelection(db, ticket, consultation, auteur) {
  const ent = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(consultation.entreprise_id);
  if (!ent || !(ent.mail || '').trim()) return { ok: false, raison: 'email_manquant' };
  const { lien } = creerJetonAcces(db, consultation.id, 'dates');
  const unites = unitesLabels(db, ticket.id);
  mailPrestataire(ent, `Vos dates d'intervention — « ${ticket.titre} » — Copro La Pinède de Notre Dame`,
    texteDatesSelection({ ent, ticket, unites, lien }));
  db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'selection', ?, ?)")
    .run(ticket.id, auteur ? auteur.id : null,
      `${auteur ? auteur.nom : 'Le conseil syndical'} a sélectionné la consultation « ${ent.raison_sociale} » et envoyé un mail de planification des dates (${ent.mail.trim()})`);
  return { ok: true };
}

// Devis depose par le prestataire : notification aux membres du CS avec lien
// direct vers le fichier (in-app + email selon leurs preferences) + accuse au
// prestataire par email.
function notifierDevisPrestataire(db, ticket, ent, fichierId, montant, raisonAffichee) {
  const baseUrl = config().baseUrl;
  const message = `Le prestataire « ${raisonAffichee} » a déposé un devis (${montant.toFixed(2)} €) sur le ticket « ${ticket.titre} »`;
  notifierCS('devis_prestataire', message, ticket.id, null, { fichier_id: fichierId }, `${baseUrl}/fichiers/${fichierId}`);
  mailPrestataire(ent, `Votre devis a bien été reçu — « ${ticket.titre} »`, texteAccuseDevis({ ent, ticket, montant }));
}

function notifierDatesProposees(db, ticket, ent, raisonAffichee, dates) {
  const liste = dates.map(d => `${d.date}${d.heure ? ` à ${d.heure}` : ''}`).join(', ');
  notifierCS('dates_proposees', `Le prestataire « ${raisonAffichee} » a proposé des dates (${liste}) pour le ticket « ${ticket.titre} »`, ticket.id, null);
  mailPrestataire(ent, `Vos dates ont bien été envoyées — « ${ticket.titre} »`, texteAccuseDates({ ent, ticket, dates }));
}

function notifierDateRetenue(db, ticket, ent, date, heure, auteurId = null) {
  notifierCS('date_validee', `La date du ${date}${heure ? ` à ${heure}` : ''} a été retenue pour le ticket « ${ticket.titre} »`, ticket.id, auteurId);
  mailPrestataire(ent, `Date retenue — « ${ticket.titre} »`, texteDateRetenue({ ent, ticket, date, heure }));
}

module.exports = {
  DUREE_JETON_JOURS,
  creerJetonAcces, trouverAccesValide, chargerContexte, unitesLabels, photosDescription,
  solliciterConsultation, envoyerMailDatesSelection,
  notifierDevisPrestataire, notifierDatesProposees, notifierDateRetenue,
  mailPrestataire
};
