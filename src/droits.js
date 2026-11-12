const { getDb } = require('./db');

// Un membre du conseil syndical (CS) est un resident avec le statut
// additionnel conseil_syndical = 1, gere collegialement.
function isCS(user) {
  return !!user && user.conseil_syndical === 1;
}

// Le CS (ou l'admin) gere le cycle de vie, les devis/factures, etc.
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

// Peut editer la description / ajouter des photos : createur, residents
// concernes, CS et admin — a tout moment, meme archive.
function peutEditerTicket(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  if (isGestionnaire(user)) return true;
  if (ticket.auteur_id === user.id) return true;
  return estResidentConcerne(user, ticket.id);
}

// Suppression : le createur si le ticket n'a jamais evolue ;
// le CS/admin peut supprimer un ticket non evolue cree par un compte parti.
function peutSupprimerTicket(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  if (ticket.etape !== 'cree') return false;
  if (ticket.auteur_id === user.id) return true;
  if (!isGestionnaire(user)) return false;
  const db = getDb();
  const auteur = db.prepare('SELECT statut FROM users WHERE id = ?').get(ticket.auteur_id);
  return !!auteur && auteur.statut === 'supprime';
}

const ETAPES = ['cree', 'valide_cs', 'consultation', 'intervention_planifiee', 'travaux_acceptes', 'archive'];

const ETIQUETTES_ETAPES = {
  cree: 'Créé',
  valide_cs: 'Validé par le conseil syndical',
  consultation: 'En consultation',
  intervention_planifiee: 'Intervention planifiée',
  travaux_acceptes: 'Travaux acceptés',
  archive: 'Archivé'
};

// En v1 le conseil syndical peut passer le ticket a n'importe quel etat.
function transitionValide(etapeActuelle, etapeCible) {
  return ETAPES.includes(etapeActuelle) && ETAPES.includes(etapeCible) && etapeActuelle !== etapeCible;
}

// Reouverture (CS ou resident) : retour a l'etat d'avant la consultation.
function peutReouvrir(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  if (ticket.etape !== 'archive') return false;
  return isGestionnaire(user) || estResidentConcerne(user, ticket.id) || ticket.auteur_id === user.id;
}

// Categories de fichiers reservees au conseil syndical (devis, factures...).
const CATEGORIES_FICHIER_CS = ['devis', 'avenant', 'facture', 'decision'];

module.exports = {
  isCS, isGestionnaire, isAdmin, estActif,
  unitsDeUser, qualiteDeUnit, estUniteCommune,
  peutVoirTicket, peutChoisirUnites, estResidentConcerne, peutEditerTicket, peutSupprimerTicket,
  ETAPES, ETIQUETTES_ETAPES, transitionValide, peutReouvrir,
  CATEGORIES_FICHIER_CS
};
