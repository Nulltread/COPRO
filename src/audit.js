const { getDb } = require('./db');

// Mesure de l'usage (spec 38) : journal d'activite + connexions + pages vues.
// Le contenu de audit_log ne contient jamais le nom de l'auteur (joint par
// auteur_id) : a la suppression du compte, auteur_id passe a NULL.

const TYPES_AUDIT = [
  'ticket_cree', 'ticket_modifie', 'ticket_etape', 'ticket_supprime',
  'fichier_ajoute', 'fichier_supprime',
  'document_ajoute', 'document_modifie', 'document_supprime'
];

const ETIQUETTES_AUDIT = {
  ticket_cree: 'Ticket créé',
  ticket_modifie: 'Ticket modifié',
  ticket_etape: 'Changement d’étape',
  ticket_supprime: 'Ticket supprimé',
  fichier_ajoute: 'Fichier ajouté',
  fichier_supprime: 'Fichier supprimé',
  document_ajoute: 'Document ajouté',
  document_modifie: 'Document modifié',
  document_supprime: 'Document supprimé'
};

function enregistrerAction(type, auteurId, entite, entiteId, contenu) {
  getDb().prepare('INSERT INTO audit_log (type, auteur_id, entite, entite_id, contenu) VALUES (?, ?, ?, ?, ?)')
    .run(type, auteurId || null, entite || '', entiteId || null, String(contenu || ''));
}

function enregistrerConnexion(userId) {
  getDb().prepare('INSERT INTO connexions (user_id) VALUES (?)').run(userId);
}

function enregistrerPageVue(userId, chemin) {
  getDb().prepare('INSERT INTO page_views (user_id, chemin) VALUES (?, ?)').run(userId, chemin);
}

// Chemins non tracés comme "pages" : racine (redirection), téléchargements de
// fichiers et export RGPD (ce sont des fichiers, pas des pages HTML).
function cheminTrace(chemin) {
  if (chemin === '/') return false;
  if (chemin.startsWith('/fichiers/')) return false;
  if (/^\/documents\/\d+\/fichier$/.test(chemin)) return false;
  if (chemin === '/profil/export') return false;
  return true;
}

module.exports = { enregistrerAction, enregistrerConnexion, enregistrerPageVue, cheminTrace, TYPES_AUDIT, ETIQUETTES_AUDIT };
