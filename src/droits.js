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

// Résidents concernés par un ticket (occupants de ses unités) : utilisés pour
// les droits d'acceptation/refus des travaux (spec 28) et la réouverture.
// Retourne la liste par unité avec ses résidents actifs.
function infosValidation(ticketId) {
  const db = getDb();
  const unites = unitesDuTicket(ticketId);
  const aCommunes = unites.some(u => u.type === 'communes');
  const nonCommunes = unites.filter(u => u.type !== 'communes');
  const parUnite = nonCommunes.map(u => {
    const residents = db.prepare(
      `SELECT DISTINCT u2.id, u2.nom, u2.prenom FROM users u2
       JOIN unit_residents ur ON ur.user_id = u2.id
       WHERE ur.unit_id = ? AND u2.statut = 'actif' AND u2.role != 'admin'
       ORDER BY u2.nom`
    ).all(u.id);
    return { id: u.id, label: u.label, residents };
  });
  const residents = parUnite.flatMap(u => u.residents);
  return { parUnite, residents, aCommunes };
}

// Peut accepter OU refuser les travaux en « travaux planifiés » (spec 28) :
// un occupant d'une unité concernée (propriétaire/locataire) OU un membre du CS
// — l'admin pur est exclu (jamais dans le quorum, spec 25).
function peutAccepterRefuser(user, ticket) {
  if (!estActif(user) || !ticket || ticket.etape !== 'intervention_planifiee') return false;
  if (user.role === 'admin' && !isCS(user)) return false; // admin jamais dans le quorum
  const { residents } = infosValidation(ticket.id);
  if (residents.some(r => r.id === user.id)) return true;
  return isCS(user);
}

// Reouverture (travaux acceptes -> consultation) : tout proprietaire/locataire
// concerne, ou un membre du CS pour les parties communes (admin exclu du quorum),
// dans le delai regle.
function peutReouvrir(user, ticket) {
  if (!estActif(user) || !ticket || ticket.etape !== 'travaux_acceptes') return false;
  if (!dansDelaiArchivage(ticket)) return false;
  if (user.role === 'admin' && !isCS(user)) return false;
  const { residents, aCommunes } = infosValidation(ticket.id);
  if (residents.some(r => r.id === user.id)) return true;
  return aCommunes && isCS(user);
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

// Edition du ticket (description) : createur, residents concernes,
// CS et admin — tant que le ticket n'est PAS archive (archive = fige).
function peutEditerTicket(user, ticket) {
  if (!estActif(user) || !ticket || ticket.etape === 'archive') return false;
  if (isGestionnaire(user)) return true;
  if (ticket.auteur_id === user.id) return true;
  return estResidentConcerne(user, ticket.id);
}

// Modification des unites du ticket : tant que le ticket est « cree », les
// memes regles que l'edition (createur, residents concernes, gestionnaire) ;
// une fois passe en consultation, UNIQUEMENT les membres du CS et l'admin.
// Modification des unites du ticket (spec 33) : modifiable aux etats « cree »
// et « consultation » (jusqu'au passage en « travaux planifies », exclu) par les
// memes acteurs que l'edition (createur, residents concernes, CS/admin) ;
// fige ensuite (planifies, acceptes, archive).
function peutEditerUnites(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  if (!['cree', 'consultation'].includes(ticket.etape)) return false;
  return peutEditerTicket(user, ticket);
}

// Personnes concernees pour les BILANS de l'intervention (spec 25) :
// residents des unites du ticket + membres du CS — l'admin en est exclu
// (jamais dans le quorum d'une action).
function personnesConcerneesCR(ticketId) {
  const db = getDb();
  return db.prepare(
    `SELECT DISTINCT u.id, u.nom, u.prenom, u.role, u.conseil_syndical FROM users u
     LEFT JOIN unit_residents ur ON ur.user_id = u.id
     LEFT JOIN ticket_units tu ON tu.unit_id = ur.unit_id
     WHERE u.statut = 'actif' AND u.role != 'admin'
       AND (tu.ticket_id = ? OR u.conseil_syndical = 1)
     ORDER BY u.nom`
  ).all(ticketId);
}

// Un bilan par personne concernee, modifiable UNIQUEMENT en « travaux
// planifiés » (spec 28) : dès que le ticket passe en « travaux acceptés »,
// la section bilan passe en lecture seule. Redigeable par soi-meme (resident
// concerne ou membre du CS — admin exclu), pour le cycle en cours.
function peutRedigerCR(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  if (user.role === 'admin' && !isCS(user)) return false;
  if (ticket.etape !== 'intervention_planifiee') return false;
  if (isCS(user)) return true;
  return estResidentConcerne(user, ticket.id);
}

// Section bilans visible a partir de « travaux planifies » (et archive).
function crVisibles(ticket) {
  return !!ticket && ['intervention_planifiee', 'travaux_acceptes', 'archive'].includes(ticket.etape);
}

// Le ticket a-t-il DEJA connu l'etape demandee (historique, spec 29) ?
// Les transitions sont loguees dans ticket_events avec l'etape en donnees JSON
// (secours : le contenu contient « <étiquette> »).
function aConnuEtape(ticketId, etape) {
  const etiquette = ETIQUETTES_ETAPES[etape];
  if (!etiquette) return false;
  const n = getDb().prepare(
    `SELECT COUNT(*) AS n FROM ticket_events
     WHERE ticket_id = ? AND type = 'changement_etape'
       AND (donnees LIKE ? OR contenu LIKE ?)`
  ).get(ticketId, `%"etape":"${etape}"%`, `%« ${etiquette} »%`).n;
  return n > 0;
}

// Visibilite des sections par etat (spec 29 + precision 32) : une section est
// visible si l'etat correspondant est en cours OU a deja ete atteint (historique
// ticket_events) — y compris en « archive », ou la section reste affichée en
// lecture seule. Un ticket archive directement depuis « cree » n'affiche aucune
// de ces sections.
function sectionsVisibles(ticket) {
  const e = ticket.etape;
  return {
    consultation: ['consultation', 'intervention_planifiee', 'travaux_acceptes'].includes(e)
      || aConnuEtape(ticket.id, 'consultation'),
    bilans: ['intervention_planifiee', 'travaux_acceptes'].includes(e)
      || aConnuEtape(ticket.id, 'intervention_planifiee'),
    factures: e === 'travaux_acceptes' || aConnuEtape(ticket.id, 'travaux_acceptes')
  };
}

// Visibilite de la SECTION bilans (spec 28) : UNIQUEMENT les personnes
// concernees — occupants des unites du ticket + membres du CS ; l'admin en est
// exclu. Les autres utilisateurs connectes ne voient pas la section.
function peutVoirCR(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  if (user.role === 'admin') return false; // admin exclu, meme avec le statut CS
  if (isCS(user)) return true;
  return estResidentConcerne(user, ticket.id);
}

// Toggle « urgent » (spec 31) : uniquement a l'etape « cree » (avant le passage
// en consultation), par les acteurs du ticket : occupants des unites concernees,
// membres du CS et admin.
function peutToggleUrgent(user, ticket) {
  if (!estActif(user) || !ticket || ticket.etape !== 'cree') return false;
  return isGestionnaire(user) || estResidentConcerne(user, ticket.id);
}

// Photos de la section Description (spec 31) : ajout/suppression autorises
// uniquement a l'etape « cree », par toute personne concernee (occupant d'une
// unite du ticket, membre du CS, admin).
function peutGererPhotosDescription(user, ticket) {
  if (!estActif(user) || !ticket || ticket.etape !== 'cree') return false;
  return isGestionnaire(user) || estResidentConcerne(user, ticket.id);
}

// Suppression : UNIQUEMENT si le ticket n'a jamais ete passe en consultation
// (etape 'cree'), par le createur, un membre du CS ou l'admin.
function peutSupprimerTicket(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  if (ticket.etape !== 'cree') return false;
  return ticket.auteur_id === user.id || isGestionnaire(user);
}

function nbFactures(ticketId) {
  return getDb().prepare("SELECT COUNT(*) AS n FROM fichiers WHERE ticket_id = ? AND categorie = 'facture'").get(ticketId).n;
}

// Archivage : a tout moment par un membre du CS ou l'admin (hors archivé),
// sans condition de facture (spec 24).
function peutArchiver(user, ticket) {
  if (!estActif(user) || !ticket) return false;
  return isGestionnaire(user) && ticket.etape !== 'archive';
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
  peutEditerTicket, peutEditerUnites, peutSupprimerTicket,
  personnesConcerneesCR, peutRedigerCR, crVisibles, peutVoirCR, aConnuEtape, sectionsVisibles,
  peutToggleUrgent, peutGererPhotosDescription,
  infosValidation, peutAccepterRefuser, peutReouvrir, dansDelaiArchivage, dateArchivageAuto,
  nbFactures, peutArchiver, entrepriseComplete, consultationComplete,
  ETAPES, ETIQUETTES_ETAPES,
  CATEGORIES_FICHIER_CS
};
