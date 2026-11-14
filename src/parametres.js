const { getDb } = require('./db');

// Parametres globaux (panneau d'administration, reserve a l'admin).
const DEFAUTS = {
  peremption_rattachement_jours: '14',
  archivage_auto_jours: '31'
};

function getParametre(cle) {
  const row = getDb().prepare('SELECT valeur FROM parametres WHERE cle = ?').get(cle);
  if (row) return row.valeur;
  return DEFAUTS[cle] || null;
}

function getParametreJours(cle, defaut) {
  const n = Number(getParametre(cle));
  return Number.isFinite(n) && n > 0 ? n : (defaut || Number(DEFAUTS[cle] || 0));
}

function setParametre(cle, valeur) {
  getDb().prepare('INSERT INTO parametres (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur')
    .run(cle, String(valeur));
}

module.exports = { getParametre, getParametreJours, setParametre, DEFAUTS };
