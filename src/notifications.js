const { getDb } = require('./db');
const { unitsDeUser, isGestionnaire, isAdmin } = require('./droits');

let webpush = null;
try {
  webpush = require('web-push');
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails('mailto:contact@copro.local', vapidPublic, vapidPrivate);
  }
} catch (e) {
  webpush = null;
}

function destinatairesTicket(ticketId, auteurId) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT u.id, u.nom, u.role FROM users u
     JOIN unit_residents ur ON ur.user_id = u.id
     JOIN ticket_units tu ON tu.unit_id = ur.unit_id
     WHERE tu.ticket_id = ? AND u.statut = 'valide'
     UNION
     SELECT id, nom, role FROM users WHERE role IN ('syndic','conseil') AND statut = 'valide'`
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
  envoyerPush(destinataires, ticket, message, urgent);
  return destinataires.length;
}

async function envoyerPush(userIds, ticket, message, urgent) {
  if (!webpush || !process.env.VAPID_PUBLIC_KEY || userIds.length === 0) return;
  const db = getDb();
  const placeholders = userIds.map(() => '?').join(',');
  const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`).all(...userIds);
  const payload = JSON.stringify({
    titre: urgent ? `URGENT — ${ticket.titre}` : ticket.titre,
    message,
    ticketId: ticket.id,
    urgent: !!urgent
  });
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      }
    }
  }
}

function nonLues(userId) {
  return getDb().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND lu = 0').get(userId).n;
}

module.exports = { notifierTicket, creerNotification, envoyerPush, nonLues, destinatairesTicket };
