const fs = require('fs');
const crypto = require('crypto');
const { getDb } = require('./index');
const { hashPassword } = require('../auth');

function creerReferentielSiVide(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM units').get().n;
  if (n > 0) return false;
  const insUnit = db.prepare('INSERT INTO units (type, numero, label) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (let i = 1; i <= 61; i++) {
      insUnit.run('villa', i, `Villa ${i}`);
      insUnit.run('garage', i, `Garage ${i}`);
    }
    insUnit.run('communes', null, 'Parties communes');
  })();
  return true;
}

function trouverUnit(db, type, numero) {
  if (type === 'communes') return db.prepare("SELECT id, type FROM units WHERE type = 'communes'").get();
  return db.prepare('SELECT id, type FROM units WHERE type = ? AND numero = ?').get(type, numero);
}

function mdpAleatoire() {
  return crypto.randomBytes(12).toString('base64url');
}

function normaliserEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function provisionnerDepuisObjet(obj, options = {}) {
  const db = getDb();
  const rapport = { referentielCree: false, crees: [], misAJour: [], mdpGeneres: [], erreurs: [] };

  const comptes = Array.isArray(obj) ? obj : (obj.comptes || []);
  const adminDecl = (!Array.isArray(obj) && obj.admin) || null;

  if (creerReferentielSiVide(db)) rapport.referentielCree = true;

  const insUser = db.prepare(
    `INSERT INTO users (email, password_hash, nom, prenom, telephone, role, conseil_syndical, statut, email_verifie)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'actif', 1)`
  );
  const updUser = db.prepare(
    'UPDATE users SET nom = ?, prenom = ?, telephone = ?, conseil_syndical = ?, statut = ? WHERE id = ?'
  );
  const setMdp = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const findUser = db.prepare("SELECT * FROM users WHERE email = ? AND statut = 'actif'");
  const findInactif = db.prepare("SELECT id, statut FROM users WHERE email = ? AND statut != 'actif'");
  const normaliserNom = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const parNom = new Map();
  for (const u of db.prepare("SELECT id, nom, prenom FROM users WHERE statut = 'actif' AND role != 'admin'").all()) {
    parNom.set(normaliserNom(`${u.nom} ${u.prenom}`), u.id);
  }
  const findSansEmail = (c) => {
    const id = parNom.get(normaliserNom(`${c.nom} ${c.prenom}`));
    return id ? db.prepare('SELECT * FROM users WHERE id = ?').get(id) : null;
  };
  const upsRat = db.prepare(
    `INSERT INTO rattachements (unit_id, user_id, qualite, statut, valide_par, valide_at)
     VALUES (?, ?, ?, 'accepte', ?, datetime('now'))
     ON CONFLICT (unit_id, user_id) DO UPDATE SET qualite = excluded.qualite, statut = 'accepte',
       valide_par = excluded.valide_par, valide_at = datetime('now')`
  );
  const upsRes = db.prepare(
    'INSERT INTO unit_residents (unit_id, user_id, qualite) VALUES (?, ?, ?) ON CONFLICT (unit_id, user_id) DO UPDATE SET qualite = excluded.qualite'
  );
  const adminExistant = db.prepare("SELECT id, email FROM users WHERE role = 'admin'").get();

  const traiter = (c, role) => {
    const email = normaliserEmail(c.email);
    if (!c.nom || !c.prenom || (!email && !c.sans_email)) {
      rapport.erreurs.push('Entrée invalide (email facultatif si "sans_email": true, nom et prénom requis) : ' + JSON.stringify(c).slice(0, 120));
      return null;
    }
    if (email && !findUser.get(email) && findInactif.get(email)) {
      rapport.erreurs.push(`${email} : un compte inactif (désactivé/supprimé) porte déjà cette adresse ; un compte désactivé est définitif — choisissez une autre adresse.`);
      return null;
    }
    const cs = c.conseil_syndical ? 1 : 0;
    let user = email ? findUser.get(email) : findSansEmail(c);
    if (user && user.role === 'admin' && role !== 'admin') {
      rapport.erreurs.push(`${email} : c'est le compte admin — ne le listez pas dans "comptes" (le statut CS ne s'applique qu'aux comptes non-admin, et l'admin n'est jamais rattaché à une unité).`);
      return null;
    }
    let genere = null;
    if (!user) {
      let mdp = c.mot_de_passe && String(c.mot_de_passe).length >= 8 ? String(c.mot_de_passe) : null;
      if (!mdp) {
        genere = mdpAleatoire();
        mdp = genere;
      }
      const id = insUser.run(email || null, hashPassword(mdp), String(c.nom).trim(), String(c.prenom || '').trim(),
        String(c.telephone || '').trim(), role, role === 'admin' ? 0 : cs).lastInsertRowid;
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      parNom.set(normaliserNom(`${user.nom} ${user.prenom}`), id);
      rapport.crees.push(email || `(sans email) ${user.prenom} ${user.nom}`);
      if (genere) rapport.mdpGeneres.push({ email: email || `(sans email) ${user.prenom} ${user.nom}`, mot_de_passe: genere });
    } else {
      updUser.run(String(c.nom).trim(), String(c.prenom || '').trim(), String(c.telephone || '').trim(), role === 'admin' ? 0 : cs, 'actif', user.id);
      if (user.role !== role && role === 'admin') setMdp.run(user.password_hash, user.id);
      rapport.misAJour.push(email || `(sans email) ${user.prenom} ${user.nom}`);
      if (c.mot_de_passe && String(c.mot_de_passe).length >= 8) setMdp.run(hashPassword(String(c.mot_de_passe)), user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }
    if (role === 'admin' && cs) {
      rapport.erreurs.push(email + ' : un compte admin ne peut pas être membre du conseil syndical (statut ignoré).');
    }
    if (role === 'admin' && (c.unites || []).length) {
      rapport.erreurs.push(email + ' : unités ignorées — le compte admin n\'est jamais rattaché à une unité (il voit tous les tickets sans condition d\'unité).');
    }
    const validePar = adminExistant ? adminExistant.id : user.id;
    for (const u of role === 'admin' ? [] : (c.unites || [])) {
      const unit = trouverUnit(db, u.type, u.numero);
      if (!unit) {
        rapport.erreurs.push(`${email} : unité introuvable type=${u.type} numero=${u.numero}`);
        continue;
      }
      const qualite = u.qualite === 'locataire' ? 'locataire' : 'proprietaire';
      if (qualite === 'proprietaire' && unit.type !== 'communes') {
        rapport.erreurs.push(`${email} : rattachement propriétaire direct interdit sur ${u.type} ${u.numero} — les propriétaires sont liés à leurs unités via leur lot (spec 35-lots) ; seuls les rattachements locataires et les parties communes sont directs.`);
        continue;
      }
      upsRat.run(unit.id, user.id, qualite, validePar);
      upsRes.run(unit.id, user.id, qualite);
    }
    return user;
  };

  db.transaction(() => {
    if (adminDecl) {
      if (adminExistant && normaliserEmail(adminDecl.email) !== normaliserEmail(adminExistant.email)) {
        rapport.erreurs.push('Un compte admin existe déjà (' + adminExistant.email + ') : déclarez-le dans "admin" ou laissez le champ vide.');
      } else {
        traiter(adminDecl, 'admin');
      }
    }
    for (const c of comptes) traiter(c, 'resident');
  })();

  const nbAdmin = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
  if (nbAdmin === 0) rapport.erreurs.push('Aucun compte admin : déclarez-le dans le champ "admin" du fichier JSON.');

  if (!options.silencieux) {
    if (rapport.referentielCree) console.log('Référentiel créé : 61 villas, 61 garages, parties communes.');
    for (const e of rapport.crees) console.log('Compte créé : ' + e);
    for (const e of rapport.misAJour) console.log('Compte mis à jour : ' + e);
    for (const g of rapport.mdpGeneres) console.log(`Mot de passe généré pour ${g.email} : ${g.mot_de_passe}`);
    for (const e of rapport.erreurs) console.error('ERREUR : ' + e);
    console.log(`Total : ${rapport.crees.length} créé(s), ${rapport.misAJour.length} mis à jour, ${rapport.erreurs.length} erreur(s).`);
  }
  return rapport;
}

function lireSource(source) {
  if (source === '-' || !source) return fs.readFileSync(0, 'utf8');
  return fs.readFileSync(source, 'utf8');
}

function main() {
  const source = process.argv[2];
  if (!source) {
    console.error('Usage : node src/db/provisionner-comptes.js <fichier.json|-> (stdin)>');
    console.error('Le fichier JSON n\'est jamais versionné (voir .gitignore) ; en production, passez-le par stdin :');
    console.error('  cat comptes-prod.json | docker compose -f docker-compose.prod.yml exec -T copro node src/db/provisionner-comptes.js -');
    process.exit(1);
  }
  let obj;
  try {
    obj = JSON.parse(lireSource(source));
  } catch (e) {
    console.error('JSON invalide : ' + e.message);
    process.exit(1);
  }
  const rapport = provisionnerDepuisObjet(obj);
  process.exit(rapport.erreurs.length ? 2 : 0);
}

if (require.main === module) main();

module.exports = { provisionnerDepuisObjet, creerReferentielSiVide };
