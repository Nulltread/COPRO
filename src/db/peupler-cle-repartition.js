const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('./index');

function normaliserCle(brut) {
  return String(brut || '').replace(/\s+/g, ' ').trim().toUpperCase();
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

function peuplerDepuisCCG(options = {}) {
  const db = getDb();
  const dataPath = options.fichier || path.join(__dirname, 'cle-repartition-ccg.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const lots = Array.isArray(data) ? data : (data.lots || []);
  const rapport = { lotsCrees: 0, lotsExistants: 0, comptesCrees: [], lotsSansProprietaire: 0, erreurs: [] };
  db.transaction(() => {
    const mapCle = new Map();
    for (const row of db.prepare('SELECT proprietaire_brut, user_id FROM lots WHERE user_id IS NOT NULL').all()) {
      mapCle.set(normaliserCle(row.proprietaire_brut), row.user_id);
    }
    for (const l of lots) {
      if (!l.numero || !l.proprietaire) {
        rapport.erreurs.push(`Entrée invalide (numero/proprietaire manquant) : ${JSON.stringify(l)}`);
        continue;
      }
      const existant = db.prepare('SELECT id FROM lots WHERE numero = ?').get(l.numero);
      if (existant) { rapport.lotsExistants++; continue; }
      const cle = normaliserCle(l.proprietaire);
      let userId = mapCle.get(cle) || null;
      if (!userId) {
        const { nom, prenom } = decouperNomPrenom(l.proprietaire);
        const info = db.prepare(
          "INSERT INTO users (email, password_hash, nom, prenom, telephone, role, statut) VALUES (NULL, ?, ?, ?, '', 'resident', 'actif')"
        ).run(crypto.randomBytes(24).toString('hex'), nom, prenom);
        userId = info.lastInsertRowid;
        mapCle.set(cle, userId);
        rapport.comptesCrees.push({ nom, prenom, proprietaire: String(l.proprietaire).trim() });
      }
      db.prepare(
        'INSERT INTO lots (numero, designation, type_lot, tantiemes, proprietaire_brut, user_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(l.numero, String(l.designation || ''), String(l.type_lot || ''), Number(l.valeur) || 0, String(l.proprietaire).trim(), userId);
      rapport.lotsCrees++;
    }
  })();
  rapport.nbLots = db.prepare('SELECT COUNT(*) AS n FROM lots').get().n;
  rapport.nbComptesProprietaires = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM lots WHERE user_id IS NOT NULL').get().n;
  return rapport;
}

if (require.main === module) {
  const rapport = peuplerDepuisCCG();
  console.log(`Peuplement depuis la clé CCG : ${rapport.lotsCrees} lots créés, ${rapport.lotsExistants} déjà existants (total ${rapport.nbLots}).`);
  console.log(`${rapport.comptesCrees.length} comptes propriétaires créés (${rapport.nbComptesProprietaires} distincts au total), tous sans email.`);
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
