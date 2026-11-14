const { getDb } = require('./db');
const { getParametreJours } = require('./parametres');
const { notifierAdminEtCS, notifierTicket } = require('./notifications');

// Taches periodiques (specs 19 et 20) : peremption des demandes de
// rattachement en attente et archivage automatique des tickets "travaux
// acceptes", avec notifications a J-3 et J-1. Executees au demarrage et
// toutes les heures ; chaque alerte n'est envoyee qu'une fois.

function dateSQL(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function peremptionRattachements() {
  const db = getDb();
  const jours = getParametreJours('peremption_rattachement_jours', 14);
  const maintenant = Date.now();
  const enAttente = db.prepare(
    `SELECT r.*, u.label AS unite_label, usr.prenom AS user_prenom, usr.nom AS user_nom
     FROM rattachements r JOIN units u ON u.id = r.unit_id JOIN users usr ON usr.id = r.user_id
     WHERE r.statut = 'en_attente'`
  ).all();
  for (const r of enAttente) {
    const created = new Date(r.created_at.replace(' ', 'T') + 'Z').getTime();
    const perimeDans = (created + jours * 86400000) - maintenant;
    if (perimeDans <= 0) {
      // Perimee : la demande est supprimee (une nouvelle peut etre refaite).
      db.prepare('DELETE FROM rattachements WHERE id = ?').run(r.id);
      continue;
    }
    const j3 = (jours - 3) * 86400000;
    const j1 = (jours - 1) * 86400000;
    if (perimeDans <= j3 && !r.notif_peremption_j3) {
      notifierAdminEtCS('peremption', `La demande de rattachement de ${r.user_prenom} ${r.user_nom} à « ${r.unite_label} » va périmer dans 3 jours (puis sera supprimée).`);
      db.prepare('UPDATE rattachements SET notif_peremption_j3 = 1 WHERE id = ?').run(r.id);
    }
    if (perimeDans <= j1 && !r.notif_peremption_j1) {
      notifierAdminEtCS('peremption', `La demande de rattachement de ${r.user_prenom} ${r.user_nom} à « ${r.unite_label} » va périmer demain (puis sera supprimée).`);
      db.prepare('UPDATE rattachements SET notif_peremption_j1 = 1 WHERE id = ?').run(r.id);
    }
  }
}

function archivageAuto() {
  const db = getDb();
  const jours = getParametreJours('archivage_auto_jours', 31);
  const rows = db.prepare("SELECT * FROM tickets WHERE etape = 'travaux_acceptes' AND acceptes_at IS NOT NULL").all();
  for (const t of rows) {
    const acceptes = new Date(t.acceptes_at.replace(' ', 'T') + 'Z').getTime();
    const ecoule = Date.now() - acceptes;
    const total = jours * 86400000;
    const j3 = (jours - 3) * 86400000;
    const j1 = (jours - 1) * 86400000;
    if (ecoule >= j3 && !t.notif_archive_j3) {
      notifierTicket(t, 'archivage_auto', `Le ticket « ${t.titre} » sera archivé automatiquement dans 3 jours.`, null, !!t.urgent);
      db.prepare('UPDATE tickets SET notif_archive_j3 = 1 WHERE id = ?').run(t.id);
    }
    if (ecoule >= j1 && !t.notif_archive_j1) {
      notifierTicket(t, 'archivage_auto', `Le ticket « ${t.titre} » sera archivé automatiquement demain.`, null, !!t.urgent);
      db.prepare('UPDATE tickets SET notif_archive_j1 = 1 WHERE id = ?').run(t.id);
    }
    if (ecoule >= total) {
      // Archivage automatique uniquement si au moins une facture est jointe.
      const nbFactures = db.prepare("SELECT COUNT(*) AS n FROM fichiers WHERE ticket_id = ? AND categorie = 'facture'").get(t.id).n;
      if (nbFactures > 0) {
        db.prepare("UPDATE tickets SET etape = 'archive', updated_at = datetime('now') WHERE id = ?").run(t.id);
        db.prepare("INSERT INTO ticket_events (ticket_id, type, auteur_id, contenu) VALUES (?, 'changement_etape', NULL, ?)")
          .run(t.id, `Ticket archivé automatiquement après ${jours} jours en « Travaux acceptés »`);
        const maj = db.prepare('SELECT * FROM tickets WHERE id = ?').get(t.id);
        notifierTicket(maj, 'changement_etape', `Le ticket « ${maj.titre} » est archivé automatiquement (travaux acceptés depuis ${jours} jours).`, null, !!maj.urgent);
      }
    }
  }
}

function executerTaches() {
  try {
    peremptionRattachements();
    archivageAuto();
  } catch (e) {
    console.error('Tache periodique en echec :', e.message);
  }
}

function demarrerTaches() {
  executerTaches();
  const timer = setInterval(executerTaches, 60 * 60 * 1000);
  timer.unref();
  return timer;
}

module.exports = { executerTaches, demarrerTaches };
