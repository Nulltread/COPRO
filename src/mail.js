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

// Construit le corps du message : texte seul, ou multipart/mixed avec
// pieces jointes (attachments = [{ filename, contentType, data (Buffer) }]).
function construireCorps({ from, to, subject, text, attachments }) {
  const id = `<${crypto.randomBytes(16).toString('hex')}@copro-pinede-gardanne.fr>`;
  // normalise les fins de ligne du texte en CRLF (RFC 5322)
  text = String(text || '').replace(/\r\n|\r|\n/g, '\r\n');
  const tete = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject.replace(/[\r\n]+/g, ' ')}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0'
  ];
  const liste = (attachments || []).filter(a => a && a.data && a.data.length);
  if (liste.length === 0) {
    return tete.concat([
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text
    ]).join('\r\n');
  }
  const limite = '----=_copro_' + crypto.randomBytes(12).toString('hex');
  const parties = [
    ...tete,
    `Content-Type: multipart/mixed; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text
  ];
  for (const a of liste) {
    parties.push(
      `--${limite}`,
      `Content-Type: ${a.contentType || 'application/octet-stream'}`,
      `Content-Disposition: attachment; filename="${String(a.filename || 'piece-jointe').replace(/[\r\n"]+/g, '_')}"`,
      'Content-Transfer-Encoding: base64',
      '',
      a.data.toString('base64').replace(/(.{76})/g, '$1\r\n')
    );
  }
  parties.push(`--${limite}--`, '');
  return parties.join('\r\n');
}

function smtpSend({ to, subject, text, attachments }) {
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
      const body = construireCorps({ from, to, subject, text, attachments });
      // dot-stuffing : une ligne commençant par un point est préfixée d'un point.
      check(await send(body.replace(/(^|\r\n)\./g, '$1..') + '\r\n.'), [250]);
      await send('QUIT').catch(() => {});
      socket.end();
      resolve();
    })().catch(reject);
  });
}

// Envoi en arrière-plan : un échec ne bloque jamais l'action appelante.
function envoyerMail({ to, subject, text, attachments }) {
  if (!config().enabled) return Promise.resolve(false);
  return smtpSend({ to, subject, text, attachments })
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
