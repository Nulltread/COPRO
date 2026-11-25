const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('./index');
const { UPLOAD_DIR } = require('../upload');
const { synchroniserAliasCS } = require('../mailcow');

function normaliserCle(brut) {
  return String(brut || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

function decouperNomPrenom(brut) {
  const s = String(brut || '').replace(/\s+/g, ' ').trim().replace(/\s+\.$/, '');
  if (!s) return { nom: 'Inconnu', prenom: 'Inconnu' };
  const tokens = s.split(' ');
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const estNom = (t === t.toUpperCase() && /[A-ZÀ-ÖØ-Þ]/.test(t)) || ['&', '/', 'ET', 'DE'].includes(t);
    if (!estNom) break;
    i++;
  }
  if (i === 0) return { nom: s, prenom: s };
  const nom = tokens.slice(0, i).join(' ');
  const prenom = tokens.slice(i).join(' ').trim() || nom;
  return { nom, prenom };
}

// Nettoyage pre-prod : si des comptes de test existent (email en @copro.local,
// hors compte admin), on les supprime ainsi que TOUS les tickets (ce sont des
// tickets de test) avec leurs fichiers joints (lignes + disque), leurs
// rattachements/sessions/notifications (cascade), les documents qu'ils ont
// deposes, et on detache leurs lots. Les unites, le compte admin et les comptes
// reels (ex. membres du CS avec leur vrai email) ne sont PAS touches.
function nettoyerComptesTest(db, rapport) {
  const testUsers = db.prepare("SELECT id, email FROM users WHERE email LIKE '%@copro.local' AND role != 'admin'").all();
  if (!testUsers.length) return false;
  const ids = testUsers.map(u => u.id);
  const ph = ids.map(() => '?').join(',');
  const nbTickets = db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n;
  const fichiersDisk = db.prepare('SELECT nom_stockage FROM fichiers').all()
    .concat(db.prepare(`SELECT nom_stockage FROM documents WHERE auteur_id IN (${ph})`).all(...ids))
    .map(r => r.nom_stockage);
  db.transaction(() => {
    db.prepare('DELETE FROM tickets').run();
    db.prepare(`DELETE FROM documents WHERE auteur_id IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM lot_units WHERE demande_par IN (${ph}) OR valide_par IN (${ph})`).run(...ids, ...ids);
    db.prepare(`UPDATE lots SET user_id = NULL WHERE user_id IN (${ph})`).run(...ids);
    db.prepare(`UPDATE lot_events SET auteur_id = NULL WHERE auteur_id IN (${ph})`).run(...ids);
    db.prepare(`UPDATE rattachements SET valide_par = NULL WHERE valide_par IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
  })();
  for (const nom of fichiersDisk) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, nom)); } catch {}
  }
  synchroniserAliasCS();
  rapport.nettoyage = {
    comptesTestSupprimes: testUsers.map(u => u.email),
    ticketsSupprimes: nbTickets,
    fichiersSupprimes: fichiersDisk.length
  };
  return true;
}

function peuplerDepuisCCG(options = {}) {
  const db = getDb();
  const dataPath = options.fichier || path.join(__dirname, 'cle-repartition-ccg.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const lots = Array.isArray(data) ? data : (data.lots || []);
  const rapport = { lotsCrees: 0, lotsExistants: 0, lotsMisAJour: 0, lotsReassignes: 0, placeholdersSupprimes: 0, comptesCrees: [], comptesReutilises: [], nettoyage: null, erreurs: [] };
  if (options.nettoyage !== false) nettoyerComptesTest(db, rapport);
  db.transaction(() => {
    // Comptes déjà liés à des lots (référentiel déjà peuplé) : dédup par propriétaire brut.
    const mapCle = new Map();
    for (const row of db.prepare('SELECT proprietaire_brut, user_id FROM lots WHERE user_id IS NOT NULL').all()) {
      mapCle.set(normaliserCle(row.proprietaire_brut), row.user_id);
    }
    // Vieux comptes existants (actifs, hors admin) : indexés par nom + prénom
    // normalisés — un lot est rattaché à ce compte plutôt que de créer un doublon.
    const comptesExistants = new Map();
    for (const u of db.prepare("SELECT id, nom, prenom FROM users WHERE statut = 'actif' AND role != 'admin'").all()) {
      comptesExistants.set(normaliserCle(`${u.nom} ${u.prenom}`), u.id);
    }
    // Comptes indexés par email (pour les correspondances propriétaire -> email).
    const parEmail = new Map();
    for (const u of db.prepare("SELECT id, email FROM users WHERE statut = 'actif' AND email IS NOT NULL").all()) {
      parEmail.set(normaliserCle(u.email), u.id);
    }
    // Correspondances explicites (ex. représentant ERILIA) : le lot est rattaché
    // au compte portant cet email, même si le nom ne correspond pas.
    const correspondances = new Map();
    for (const c of (data.correspondances || [])) {
      if (c.proprietaire && c.email) correspondances.set(normaliserCle(c.proprietaire), normaliserCle(c.email));
    }
    for (const l of lots) {
      if (!l.numero || !l.proprietaire) {
        rapport.erreurs.push(`Entrée invalide (numero/proprietaire manquant) : ${JSON.stringify(l)}`);
        continue;
      }
      const brut = String(l.proprietaire).trim();
      const cle = normaliserCle(brut);
      const { nom, prenom } = decouperNomPrenom(brut);
      const cleNom = normaliserCle(`${nom} ${prenom}`);
      const existant = db.prepare('SELECT * FROM lots WHERE numero = ?').get(l.numero);
      const emailCorr = correspondances.get(cle);
      const corrUserId = emailCorr ? (parEmail.get(emailCorr) || null) : null;
      let userId = corrUserId || (existant && existant.user_id) || mapCle.get(cle) || comptesExistants.get(cleNom) || null;
      if (userId && !mapCle.has(cle) && !(existant && existant.user_id === userId)) rapport.comptesReutilises.push({ nom, prenom, proprietaire: brut, userId });
      if (!userId) {
        const info = db.prepare(
          "INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut) VALUES (NULL, ?, ?, ?, '', 'resident', 'actif')"
        ).run(crypto.randomBytes(24).toString('hex'), nom, prenom);
        userId = info.lastInsertRowid;
        rapport.comptesCrees.push({ nom, prenom, proprietaire: brut });
      }
      mapCle.set(cle, userId);
      comptesExistants.set(cleNom, userId);
      if (existant) {
        rapport.lotsExistants++;
        if (userId && existant.user_id !== userId) {
          // Réassignation (ex. correspondance explicite ERILIA) : le lot passe au compte trouvé.
          const ancien = db.prepare('SELECT * FROM users WHERE id = ?').get(existant.user_id);
          db.prepare('UPDATE lots SET user_id = ?, proprietaire_brut = ? WHERE id = ?').run(userId, brut, existant.id);
          rapport.lotsReassignes++;
          if (ancien && ancien.email === null) supprimerPlaceholderSiOrphelin(db, ancien.id, rapport);
        } else if (!existant.user_id && userId) {
          // Lot déjà présent mais sans propriétaire : on rattache le compte trouvé/créé.
          db.prepare('UPDATE lots SET user_id = ?, proprietaire_brut = ? WHERE id = ?').run(userId, brut, existant.id);
          rapport.lotsMisAJour++;
        }
        continue;
      }
      db.prepare(
        'INSERT INTO lots (numero, designation, type_lot, tantiemes, proprietaire_brut, user_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(l.numero, String(l.designation || ''), String(l.type_lot || ''), Number(l.valeur) || 0, brut, userId);
      rapport.lotsCrees++;
    }
  })();
  rapport.nbLots = db.prepare('SELECT COUNT(*) AS n FROM lots').get().n;
  rapport.nbComptesProprietaires = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM lots WHERE user_id IS NOT NULL').get().n;
  return rapport;
}

// Supprime un compte placeholder auto-créé (email NULL) s'il n'est plus relié à
// rien (plus de lot, d'unité, de rattachement, de ticket, de document).
function supprimerPlaceholderSiOrphelin(db, userId, rapport) {
  const refs = db.prepare(
    `SELECT (SELECT COUNT(*) FROM lots WHERE user_id = ?)
          + (SELECT COUNT(*) FROM unit_residents WHERE user_id = ?)
          + (SELECT COUNT(*) FROM rattachements WHERE user_id = ?)
          + (SELECT COUNT(*) FROM tickets WHERE auteur_id = ?)
          + (SELECT COUNT(*) FROM documents WHERE auteur_id = ?)
          + (SELECT COUNT(*) FROM lot_units WHERE demande_par = ? OR valide_par = ?) AS n`
  ).get(userId, userId, userId, userId, userId, userId, userId).n;
  if (refs > 0) return false;
  db.prepare('UPDATE lot_events SET auteur_id = NULL WHERE auteur_id = ?').run(userId);
  db.prepare('UPDATE rattachements SET valide_par = NULL WHERE valide_par = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  rapport.placeholdersSupprimes++;
  return true;
}

if (require.main === module) {
  const options = { nettoyage: !process.argv.includes('--sans-nettoyage') };
  const rapport = peuplerDepuisCCG(options);
  if (rapport.nettoyage) {
    console.log(`Nettoyage pre-prod : ${rapport.nettoyage.comptesTestSupprimes.length} compte(s) de test supprimé(s) (${rapport.nettoyage.comptesTestSupprimes.join(', ') || 'aucun email'}), ${rapport.nettoyage.ticketsSupprimes} ticket(s) et ${rapport.nettoyage.fichiersSupprimes} fichier(s) supprimés (disque inclus).`);
    console.log('Unités, compte admin et comptes réels (CS) inchangés.');
  }
  console.log(`Peuplement depuis la clé CCG : ${rapport.lotsCrees} lots créés, ${rapport.lotsExistants} déjà existants${rapport.lotsMisAJour ? `, ${rapport.lotsMisAJour} sans propriétaire rattaché(s)` : ''}${rapport.lotsReassignes ? `, ${rapport.lotsReassignes} réassigné(s) (correspondance)` : ''}${rapport.placeholdersSupprimes ? `, ${rapport.placeholdersSupprimes} compte(s) placeholder supprimé(s)` : ''} (total ${rapport.nbLots}).`);
  console.log(`${rapport.comptesCrees.length} comptes propriétaires créés (${rapport.nbComptesProprietaires} distincts au total, dont ${rapport.comptesReutilises.length} compte(s) existant(s) réutilisé(s) par nom), les nouveaux sans email.`);
  for (const c of rapport.comptesReutilises) console.log(`  ↳ lot de « ${c.proprietaire} » rattaché au compte existant #${c.userId} (${c.prenom} ${c.nom})`);
  if (rapport.comptesCrees.length) {
    console.log('Comptes créés :');
    for (const c of rapport.comptesCrees) console.log(`  - ${c.prenom} ${c.nom}  (source : « ${c.proprietaire} »)`);
  }
  if (rapport.erreurs.length) {
    console.error('Erreurs :');
    for (const e of rapport.erreurs) console.error('  - ' + e);
  }
  console.log('\nAucun lien lot → unité n\'est créé (mapping lot/unités non fourni à date) : les propriétaires ajoutent leurs unités depuis leur profil, validées par le CS/admin.');
  console.log('Les comptes sont sans email (donc inaccessibles) : renseignez un email depuis la page Comptes (CS/admin) pour envoyer automatiquement le mail de réinitialisation du mot de passe.');
}

module.exports = { peuplerDepuisCCG, decouperNomPrenom, normaliserCle };
