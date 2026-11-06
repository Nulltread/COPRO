const { getDb } = require('./db');

const ROLES_GESTION = ['syndic', 'conseil'];

function isGestionnaire(user) {
  return !!user && ROLES_GESTION.includes(user.role);
}

function isAdmin(user) {
  return !!user && user.role === 'admin';
}

function unitsDeUser(userId) {
  const db = getDb();
  return db.prepare('SELECT unit_id FROM unit_residents WHERE user_id = ?').all(userId).map(r => r.unit_id);
}

function peutVoirTicket(user, ticketId) {
  if (!user) return false;
  if (isGestionnaire(user) || isAdmin(user)) return true;
  const db = getDb();
  const row = db.prepare(
    `SELECT 1 FROM ticket_units tu JOIN unit_residents ur ON ur.unit_id = tu.unit_id
     WHERE tu.ticket_id = ? AND ur.user_id = ? LIMIT 1`
  ).get(ticketId, user.id);
  return !!row;
}

function peutGererTicket(user, ticketId) {
  return isGestionnaire(user) || (user.role === 'resident' && peutVoirTicket(user, ticketId));
}

function categoriesTicket() {
  return [
    'Plomberie', 'Électricité', 'Chauffage', 'Toiture', 'Menuiserie',
    'Serrurerie', 'Extérieurs / Jardin', 'Humidité / Infiltration', 'Autre'
  ];
}

const ETAPES = ['declaration', 'consultation', 'attribution', 'planification', 'reception', 'cloture'];

const ETIQUETTES_ETAPES = {
  declaration: 'Déclaration',
  consultation: 'Consultation des devis',
  attribution: 'Attribution',
  planification: 'Planification des travaux',
  reception: 'Réception des travaux',
  cloture: 'Clôturé'
};

function transitionValide(etapeActuelle, etapeCible) {
  const i = ETAPES.indexOf(etapeActuelle);
  const j = ETAPES.indexOf(etapeCible);
  if (i === -1 || j === -1) return false;
  if (j === i + 1) return true;
  // retour de la réception vers la planification en cas de travaux non satisfaisants
  if (etapeActuelle === 'reception' && etapeCible === 'planification') return true;
  return false;
}

module.exports = {
  isGestionnaire, isAdmin, unitsDeUser, peutVoirTicket, peutGererTicket,
  categoriesTicket, ETAPES, ETIQUETTES_ETAPES, transitionValide, ROLES_GESTION
};
