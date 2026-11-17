const fs = require('fs');
const os = require('os');
const path = require('path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'mockups');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copro-mock-'));
  process.env.DB_PATH = path.join(dir, 'mock.db');
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  delete require.cache[require.resolve('../src/db')];
  require('../src/db/seed').seed();
  const { getDb } = require('../src/db');
  const { listeTickets, detailTicket } = require('../src/routes/tickets');
  const { ETAPES, ETIQUETTES_ETAPES } = require('../src/droits');
  const db = getDb();

  const cs = db.prepare("SELECT * FROM users WHERE email='conseil1@copro.local'").get();
  const resident = db.prepare("SELECT * FROM users WHERE email='resident1@copro.local'").get();
  const unites = db.prepare('SELECT * FROM units ORDER BY type DESC, numero').all();
  const mesUnitesResident = db.prepare(
    `SELECT u.* FROM units u JOIN unit_residents ur ON ur.unit_id = u.id WHERE ur.user_id = ? ORDER BY u.type DESC, u.numero`
  ).all(resident.id);
  const idsResident = db.prepare('SELECT unit_id FROM unit_residents WHERE user_id = ?').all(resident.id).map(r => r.unit_id);
  const idsCS = db.prepare('SELECT unit_id FROM unit_residents WHERE user_id = ?').all(cs.id).map(r => r.unit_id);
  const unitesNonCommunes = db.prepare("SELECT * FROM units WHERE type != 'communes' ORDER BY type DESC, numero").all();
  const unitesOptions = [
    { value: 'toutes', label: 'Toutes les unités' },
    ...unites.map(u => ({ value: String(u.id), label: u.label }))
  ];
  const { unitsDeUser, peutEditerTicket, peutEditerUnites, peutSupprimerTicket, peutReouvrir, estResidentConcerne, isGestionnaire, peutRedigerCR, peutAccepterRefuser, peutToggleUrgent, peutGererPhotosDescription, peutArchiver, dateArchivageAuto } = require('../src/droits');

  const pages = [];
  pages.push(['01-connexion.html', 'connexion', { user: null, erreur: null, suite: '/' }]);
  pages.push(['02-inscription.html', 'inscription', { user: null, units: unitesNonCommunes, erreur: null }]);
  pages.push(['03-liste-tickets-cs.html', 'tickets', {
    user: cs, tickets: listeTickets(cs, { unite: 'toutes' }),
    etapes: ETAPES, etiquettes: ETIQUETTES_ETAPES, unitesFiltre: unites, unitesOptions, unitesSelectionnees: ['toutes'],
    filtres: { unite: 'toutes' }, gestionnaire: true, mesUnites: idsCS, nonLues: 3
  }]);
  pages.push(['04-liste-tickets-resident.html', 'tickets', {
    user: resident, tickets: listeTickets(resident, {}),
    etapes: ETAPES, etiquettes: ETIQUETTES_ETAPES, unitesFiltre: unites, unitesOptions, unitesSelectionnees: [],
    filtres: {}, gestionnaire: false, mesUnites: idsResident, nonLues: 1
  }]);
  const d = detailTicket(cs, 1);
  pages.push(['05-detail-ticket.html', 'ticket-detail', {
    user: cs, ...d, etapes: ETAPES, etiquettes: ETIQUETTES_ETAPES, gestionnaire: true,
    mesUnites: new Set(idsCS),
    peutEditer: peutEditerTicket(cs, d.ticket),
    peutEditerUnites: peutEditerUnites(cs, d.ticket),
    peutRedigerCR: peutRedigerCR(cs, d.ticket),
    peutSupprimer: peutSupprimerTicket(cs, d.ticket),
    peutAccepterRefuser: peutAccepterRefuser(cs, d.ticket),
    peutToggleUrgent: peutToggleUrgent(cs, d.ticket),
    peutGererPhotos: peutGererPhotosDescription(cs, d.ticket),
    peutVoirCR: d.peutVoirCR,
    peutReouvrir: peutReouvrir(cs, d.ticket),
    peutArchiver: peutArchiver(cs, d.ticket),
    dateArchivageAuto: dateArchivageAuto(d.ticket),
    delaiArchivageJours: 31,
    estConcerne: estResidentConcerne(cs, d.ticket.id) || true,
    unitesModifiables: unitesNonCommunes, nonLues: 3
  }]);
  pages.push(['06-nouveau-ticket.html', 'ticket-form', {
    user: resident, unites: unitesNonCommunes, mesUnites: idsResident, ticket: null, erreur: null, nonLues: 1
  }]);
  pages.push(['07-tableau-de-bord.html', 'tableau', {
    user: cs, ouverts: 5, enConsultation: 2, urgents: 2, coutRetenu: 4200, totalFacture: 3980.5,
    recents: listeTickets(cs, { unite: 'toutes' }).slice(0, 6), etapes: ETAPES, etiquettes: ETIQUETTES_ETAPES
  }]);
  const notifs = db.prepare(
    `SELECT n.*, t.titre AS ticket_titre FROM notifications n LEFT JOIN tickets t ON t.id = n.ticket_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 10`
  ).all(cs.id);
  if (notifs.length === 0) notifs.push({ type: 'creation', message: 'Un résident a déclaré un nouveau ticket URGENT : « Fuite sous l\'évier »', lu: 0, created_at: '2026-11-06 09:12', ticket_id: 1, ticket_titre: 'Fuite sous l\'évier de la cuisine' });
  pages.push(['08-notifications.html', 'notifications', { user: cs, notifs }]);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [fichier, vue, locals] of pages) {
    let html = ejs.render(fs.readFileSync(path.join(ROOT, 'src/views', vue + '.ejs'), 'utf8'), {
      nonLues: 2,
      ...locals,
      filename: path.join(ROOT, 'src/views', vue + '.ejs')
    }, { filename: path.join(ROOT, 'src/views', vue + '.ejs') });
    html = html
      .replace(/href="\/style\.css"/g, 'href="style.css"')
            .replace(/<link rel="icon"[^>]*>/g, '')
      .replace(/<script src="\/app\.js"><\/script>/g, '')
      ;
    fs.writeFileSync(path.join(OUT, fichier), html);
  }
  fs.copyFileSync(path.join(ROOT, 'src/public/style.css'), path.join(OUT, 'style.css'));
  fs.writeFileSync(path.join(OUT, 'README.md'), `# Mock-up de l'application\n\nPages statiques rendues avec le jeu de données de démonstration (compte conseil syndical / résident).\nOuvrir les fichiers \`01-…\` à \`08-…\` directement sur GitHub (le style \`style.css\` est à côté).\n\nRégénérer avec : \`node scripts/render-mockups.js\`\n`);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`Mock-ups générés dans mockups/ : ${pages.length} pages`);
}

main().catch(e => { console.error(e); process.exit(1); });
