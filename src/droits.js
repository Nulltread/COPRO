const { getDb } = require('./db');
const { getParametreJours } = require('./parametres');

// Un membre du conseil syndical (CS) est un resident avec le statut
// additionnel conseil_syndical = 1, gere collegialement (spec 17 : l'admin
// ET les membres du CS peuvent ajouter/retirer ce statut).
function isCS(user) {
  return !!user && user.conseil_syndical === 1;
}

// Le CS (ou l'admin) gere le cycle de vie, les consultations, les factures...
function isGestionnaire(user) {
  return isCS(user) || isAdmin(user);
}

function isAdmin(user) {
  return !!user && user.role === 'admin';
}

function estActif(user) {
  return !!user && user.statut === 'actif';
}

// Unites validees d'un compte (rattachements acceptes).
function unitsDeUser(userId) {
  const db = getDb();
  return db.prepare('SELECT unit_id FROM unit_residents WHERE user_id = ?').all(userId).map(r => r.unit_id);
}

function qualiteDeUnit(userId, unitId) {
  const db = getDb();
  const row = db.prepare('SELECT qualite FROM unit_residents WHERE user_id = ? AND unit_id = ?').get(userId, unitId);
  return row ? row.qualite : null;
}

function estUniteCommune(unitId) {
  const db = getDb();
  const row = db.prepare("SELECT type FROM units WHERE id = ?").get(Number(unitId));
  return !!row && row.type === 'communes';
}

// Lecture ouverte aux comptes rattaches a au moins une unite ; l'admin voit
// tout. Un resident sans aucune unite validee ne voit aucun ticket.
function peutVoirTicket(user, ticketId) {
  if (!estActif(user)) return false;
  if (isAdmin(user)) return true;
  return unitsDeUser(user.id).length > 0;
}

// Peut creer/modifier les unites d'un ticket : au moins une unite validee
// parmi celles du compte ; les parties communes sont reservees au CS.
function peutChoisirUnites(user, uniteIds) {
  if (!estActif(user)) return false;
  const ids = uniteIds.map(Number);
  if (ids.length === 0) return false;
  const mesUnites = new Set(unitsDeUser(user.id));
  const auMoinsUneSienne = ids.some(id => mesUnites.has(id));
  const aCommunes = ids.some(id => estUniteCommune(id));
  if (aCommunes && !isGestionnaire(user)) return false;
  return auMoinsUneSienne || isGestionnaire(user);
}

// Resident concerne par un ticket (rattache a une de ses unites).
function estResidentConcerne(user, ticketId) {
  if (!estActif(user)) return false;
  const db = getDb();
  const row = db.prepare(
    `SELECT 1 FROM ticket_units tu JOIN unit_residents ur ON ur.unit_id = tu.unit_id
     WHERE tu.ticket_id = ? AND ur.user_id = ? LIMIT 1`
  ).get(ticketId, user.id);
  return !!row;
}

// Unites du ticket, avec leur type (pour distinguer parties communes).
function unitesDuTicket(ticketId) {
  const db = getDb();
  return db.prepare(
    'SELECT u.id, u.type, u.numero, u.label FROM units u JOIN ticket_units tu ON tu.unit_id = u.id WHERE tu.ticket_id = ?'
  ).all(ticketId);
}

// Qui doit valider les travaux (planifie -> acceptes) :
// - tous les proprietaires/locataires actifs des unites concernees
//   (garage = villa, meme process ; parties communes exclues ici) ;
// - si le ticket touche les parties communes : au moins un membre du CS.
function infosValidation(ticketId) {
  const db = getDb();
  const unites = unitesDuTicket(ticketId);
  const aCommunes = unites.some(u => u.type === 'communes');
  const nonCommunes = unites.filter(u => u.type !== 'communes').map(u => u.id);
  let residents = [];
  if (nonCommunes.length > 0) {
    residents = db.prepare(
      `SELECT DISTINCT u.id, u.nom, u.prenom FROM users u
       JOIN unit_residents ur ON ur.user_id = u.id
       WHERE ur.unit_id IN (${nonCommunes.map(() => '?').join(',')}) AND u.statut = 'actif'
       ORDER BY u.nom`
    ).all(...nonCommunes);
  }
  return { residents, besoinCS: aCommunes, aCommunes };
}

function peutValiderTravaux(user, ticket) {
  if (!estActif(user) || !ticket || ticket.etape !== 'intervention_planifiee') return false;
  const { residents, besoinCS } = infosValidation(ticket.id);
  if (residents.some(r => r.id === user.id)) return true;
  return besoinCS && isGestionnaire(user);
}

// Reouverture (travaux acceptes -> consultation) : tout proprietaire/locataire
// concerne (parties communes : au moins un membre du CS), dans le delai regle.
function peutReouvrir(user, ticket) {
  if (!estActif(user) || !ticket || ticket.etape !== 'travaux_acceptes') return false;
  if (!dansDelaiArchivage(ticket)) return false;
  const { residents, besoinCS } = infosValidation(ticket.id);
  if (residents.some(r => r.id === user.id)) return true;
  return besoinCS && isGestionnaire(user);
}

function dansDelaiArchivage(ticket) {
  if (!ticket.acceptes_at) return false;
  const jours = getParametreJours('archivage_auto_jours', 31);
  const acceptes = new Date(ticket.acceptes_at.replace(' ', 'T') + 'Z').getTime();
  return Date.now() < acceptes + jours * 86400000;
}

function dateArchivageAuto(ticket) {
  if (!ticket.acceptes_at) return null;
  const jours = getParametreJours('archivage_auto_jours', 31);
  return new Date(new Date(ticket.acceptes_at.replace(' ', 'T') + 'Z').getTime() + jours * 86400000);
}

// Edition du ticket (description, unites) : createur, residents concernes,
// CS et admin — tant que le ticket n'est PAS archive (archive = fige).
function peutEditerTicket(user, ticket) {
  if (!estActif(user) || !ticket || ticket.etape === 'archive') return false;
  if (isGestionnaire(user)) return true;
  if (ticket.auteur_id === user.id) return true;
  return estResidentConcerne(user, ticket.id);
}

// Suppression : UNIQUEMENT si le ticket n'a jamais ete passe en consultation
// (etape 'cree'), par le createur, un membre du CS ou l'admin.
function peutSupprimerTicket(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  if (ticket.etape !== 'cree') return false;
  return ticket.auteur_id === user.id || isGestionnaire(user);
}

// Archivage : a tout moment par un membre du CS ou l'admin, mais impossible
// tant qu'aucune facture n'est jointe au ticket.
function nbFactures(ticketId) {
  return getDb().prepare("SELECT COUNT(*) AS n FROM fichiers WHERE ticket_id = ? AND categorie = 'facture'").get(ticketId).n;
}

function peutArchiver(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  if (!isGestionnaire(user) || ticket.etape === 'archive') return false;
  return nbFactures(ticket.id) > 0;
}

// Une fiche entreprise est "strictement complete" si tous les champs sont remplis.
function entrepriseComplete(e) {
  return !!e && !!e.raison_sociale.trim()
    && !!(e.siren_siret || '').trim()
    && !!(e.contact_nom || '').trim()
    && !!(e.telephone || '').trim()
    && !!(e.mail || '').trim();
}

// Une consultation est complete (validable pour passer en travaux planifies) :
// entreprise strictement complete + au moins un devis (piece jointe + montant)
// + une date planifiee.
function consultationComplete(db, consultation) {
  if (!consultation) return false;
  const e = db.prepare('SELECT * FROM entreprises WHERE id = ?').get(consultation.entreprise_id);
  if (!entrepriseComplete(e)) return false;
  if (!consultation.date_planifiee) return false;
  const nbDevis = db.prepare(
    "SELECT COUNT(*) AS n FROM fichiers WHERE consultation_id = ? AND categorie = 'devis' AND montant IS NOT NULL"
  ).get(consultation.id).n;
  return nbDevis > 0;
}

const ETAPES = ['cree', 'consultation', 'intervention_planifiee', 'travaux_acceptes', 'archive'];

const ETIQUETTES_ETAPES = {
  cree: 'Créé',
  consultation: 'En consultation',
  intervention_planifiee: 'Travaux planifiés',
  travaux_acceptes: 'Travaux acceptés',
  archive: 'Archivé'
};

// Categories de fichiers gerees par le CS (devis dans les consultations,
// factures) — la section documents libre disparait (spec 20).
const CATEGORIES_FICHIER_CS = ['devis', 'facture'];

module.exports = {
  isCS, isGestionnaire, isAdmin, estActif,
  unitsDeUser, qualiteDeUnit, estUniteCommune, unitesDuTicket,
  peutVoirTicket, peutChoisirUnites, estResidentConcerne,
  peutEditerTicket, peutSupprimerTicket,
  infosValidation, peutValiderTravaux, peutReouvrir, dansDelaiArchivage, dateArchivageAuto,
  nbFactures, peutArchiver, entrepriseComplete, consultationComplete,
  ETAPES, ETIQUETTES_ETAPES,
  CATEGORIES_FICHIER_CS
};
