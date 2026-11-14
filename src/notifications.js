const { getDb } = require('./db');
const { envoyerMailNotification, config } = require('./mail');

// Envoi du canal email (option utilisateur, email vérifié uniquement),
// en complément de la notification in-app. Lien direct vers la page concernée.
function notifierParEmail(userIds, ticketId, message) {
  if (!userIds.length) return;
  const db = getDb();
  const baseUrl = config().baseUrl;
  const lien = ticketId ? `${baseUrl}/tickets/${ticketId}` : `${baseUrl}/notifications`;
  const destinataires = db.prepare(
    'SELECT id, email, prenom FROM users WHERE id IN (' + userIds.map(() => '?').join(',') + ') AND notif_email = 1 AND email_verifie = 1 AND statut = \'actif\''
  ).all(...userIds);
  for (const u of destinataires) {
    envoyerMailNotification({ to: u.email, prenom: u.prenom, subject: message, lien });
  }
}

// Canal unique en v1 : notification in-app.
// Destinataires d'un ticket : le conseil syndical et les residents
// concernes (rattaches aux unites du ticket), hors auteur de l'evenement.
function destinatairesTicket(ticketId, auteurId) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT u.id FROM users u
     JOIN unit_residents ur ON ur.user_id = u.id
     JOIN ticket_units tu ON tu.unit_id = ur.unit_id
     WHERE tu.ticket_id = ? AND u.statut = 'actif'
     UNION
     SELECT id FROM users WHERE conseil_syndical = 1 AND statut = 'actif'`
  ).all(ticketId);
  const ids = new Set(rows.map(r => r.id));
  if (auteurId) ids.delete(auteurId);
  return [...ids];
}

function creerNotification(userId, ticketId, type, message) {
  const db = getDb();
  db.prepare('INSERT INTO notifications (user_id, ticket_id, type, message) VALUES (?, ?, ?, ?)')
    .run(userId, ticketId, type, message);
}

function notifierTicket(ticket, type, message, auteurId, urgent = false) {
  const destinataires = destinatairesTicket(ticket.id, auteurId);
  for (const userId of destinataires) {
    creerNotification(userId, ticket.id, type, message);
  }
  notifierParEmail(destinataires, ticket.id, urgent ? `URGENT — ${message}` : message);
  return destinataires.length;
}

// Notifier un utilisateur precis (ex. demandeur d'un rattachement).
function notifierUser(userId, ticketId, type, message) {
  const db = getDb();
  const u = db.prepare('SELECT statut FROM users WHERE id = ?').get(userId);
  if (!u || u.statut !== 'actif') return;
  creerNotification(userId, ticketId, type, message);
  notifierParEmail([userId], ticketId, message);
}

function notifierCS(type, message, ticketId = null, auteurId = null) {
  const db = getDb();
  const cs = db.prepare("SELECT id FROM users WHERE conseil_syndical = 1 AND statut = 'actif'").all();
  const ids = [];
  for (const u of cs) {
    if (auteurId && u.id === auteurId) continue;
    creerNotification(u.id, ticketId, type, message);
    ids.push(u.id);
  }
  notifierParEmail(ids, ticketId, message);
}

function nonLues(userId) {
  return getDb().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND lu = 0').get(userId).n;
}

module.exports = { notifierTicket, notifierUser, notifierCS, creerNotification, nonLues, destinatairesTicket };
