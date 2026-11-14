const net = require('net');
const crypto = require('crypto');

// Envoi de mails via le serveur mail local (SMTP sans authentification :
// l'application tourne sur le même hôte que le serveur mail).
// Aucun paquet externe : client SMTP minimal sur le port 25 local.

function config() {
  return {
    host: process.env.SMTP_HOST || '127.0.0.1',
    port: Number(process.env.SMTP_PORT || 25),
    from: process.env.MAIL_FROM || 'noreply@copro-pinede-gardanne.fr',
    baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    enabled: process.env.MAIL_ENABLED !== 'false'
  };
}

function smtpSend({ to, subject, text }) {
  const { host, port, from } = config();
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host);
    let buf = '';
    let waiter = null;
    socket.on('data', (d) => {
      buf += d.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const m = line.match(/^(\d{3})([ -])(.*)$/);
        if (!m || m[2] === '-') continue;
        const w = waiter;
        waiter = null;
        if (w) w({ code: Number(m[1]), text: m[3] });
      }
    });
    socket.on('error', (e) => {
      if (waiter) { const w = waiter; waiter = null; w({ code: 0, text: e.message }); }
      else reject(e);
    });
    const send = (line) => new Promise((res) => { waiter = res; socket.write(line + '\r\n'); });
    const greeting = new Promise((res) => { waiter = res; });
    const check = (r, ok) => { if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code} ${r.text}`); };
    (async () => {
      check(await greeting, [220]);
      check(await send(`HELO ${host}`), [250]);
      check(await send(`MAIL FROM:<${from}>`), [250]);
      check(await send(`RCPT TO:<${to}>`), [250, 251]);
      check(await send('DATA'), [354]);
      const id = `<${crypto.randomBytes(16).toString('hex')}@copro-pinede-gardanne.fr>`;
      const body = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject.replace(/[\r\n]+/g, ' ')}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: ${id}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        text
      ].join('\r\n');
      check(await send(body + '\r\n.'), [250]);
      await send('QUIT').catch(() => {});
      socket.end();
      resolve();
    })().catch(reject);
  });
}

// Envoi en arrière-plan : un échec ne bloque jamais l'action appelante.
function envoyerMail({ to, subject, text }) {
  if (!config().enabled) return Promise.resolve(false);
  return smtpSend({ to, subject, text })
    .then(() => true)
    .catch((err) => {
      console.error(`Envoi mail vers ${to} echoue :`, err.message);
      return false;
    });
}

function creerJetonVerification(userId) {
  const { getDb } = require('./db');
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  getDb().prepare('INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expires);
  return token;
}

function envoyerMailVerification(user) {
  const token = creerJetonVerification(user.id);
  const lien = `${config().baseUrl}/verifier-email?token=${token}`;
  return envoyerMail({
    to: user.email,
    subject: 'Confirmez votre adresse email — Copro La Pinède de Gardanne',
    text: `Bonjour ${user.prenom},\n\nCliquez sur ce lien pour valider votre adresse email :\n${lien}\n\nCe lien expire dans 7 jours. Si vous n'avez pas créé de compte, ignorez ce message.\n`
  });
}

function envoyerMailNotification({ to, prenom, subject, lien }) {
  return envoyerMail({
    to,
    subject,
    text: `Bonjour ${prenom},\n\n${subject}\n\nVoir dans l'application :\n${lien}\n`
  });
}

module.exports = { envoyerMail, envoyerMailVerification, envoyerMailNotification, creerJetonVerification, config };
