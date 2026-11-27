const fs = require('fs');
const path = require('path');

const AIDE_DIR = path.join(__dirname, 'aide');

function normaliserTexte(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function echapperHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineMarkdown(s) {
  let t = echapperHtml(s);
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, texte, url) => {
    const href = /^\/aide\/[a-z0-9-]+$/.test(url) ? url : '/aide';
    return `<a href="${href}">${texte}</a>`;
  });
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return t;
}

function rendreMarkdown(md) {
  const lignes = String(md).replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let liste = null;
  let para = [];
  const fermerPara = () => {
    if (para.length) { html.push('<p>' + para.map(inlineMarkdown).join(' ') + '</p>'); para = []; }
  };
  const fermerListe = () => {
    if (liste) { html.push(`<${liste.type}>` + liste.items.map(i => '<li>' + inlineMarkdown(i) + '</li>').join('') + `</${liste.type}>`); liste = null; }
  };
  for (const ligne of lignes) {
    const t = ligne.trimEnd();
    const mTitre = t.match(/^(#{1,4})\s+(.*)$/);
    const mListe = t.match(/^[-*]\s+(.*)$/);
    const mListeNum = t.match(/^\d+[.)]\s+(.*)$/);
    const mCitation = t.match(/^>\s?(.*)$/);
    if (mTitre) {
      fermerPara(); fermerListe();
      const niveau = mTitre[1].length;
      html.push(`<h${niveau}>${inlineMarkdown(mTitre[2])}</h${niveau}>`);
      continue;
    }
    if (mListe || mListeNum) {
      fermerPara();
      const type = mListe ? 'ul' : 'ol';
      const item = (mListe || mListeNum)[1];
      if (!liste || liste.type !== type) { fermerListe(); liste = { type, items: [] }; }
      liste.items.push(item);
      continue;
    }
    if (mCitation) {
      fermerPara(); fermerListe();
      html.push(`<blockquote>${inlineMarkdown(mCitation[1])}</blockquote>`);
      continue;
    }
    if (!t.trim()) { fermerPara(); fermerListe(); continue; }
    fermerListe();
    para.push(t.trim());
  }
  fermerPara(); fermerListe();
  return html.join('\n');
}

function chargerPages() {
  const fichiers = fs.readdirSync(AIDE_DIR).filter(f => f.endsWith('.md'));
  const pages = fichiers.map(f => {
    const slug = f.replace(/\.md$/, '');
    const brut = fs.readFileSync(path.join(AIDE_DIR, f), 'utf8');
    const mTitre = brut.match(/^#\s+(.*)$/m);
    return { slug, titre: mTitre ? mTitre[1].trim() : slug, brut, contenu: normaliserTexte(brut) };
  });
  return pages;
}

function rechercher(pages, requete) {
  const mots = normaliserTexte(requete).split(' ').filter(Boolean);
  if (!mots.length) return [];
  const resultats = [];
  for (const p of pages) {
    if (mots.every(m => p.contenu.includes(m))) {
      const idx = p.contenu.indexOf(mots[0]);
      const debut = Math.max(0, idx - 90);
      const extrait = p.brut.replace(/\s+/g, ' ').slice(debut, debut + 260);
      resultats.push({ slug: p.slug, titre: p.titre, extrait });
    }
  }
  return resultats;
}

function surligner(texte, requete) {
  let t = echapperHtml(texte);
  for (const m of normaliserTexte(requete).split(' ').filter(Boolean)) {
    const idx = normaliserTexte(t).indexOf(m);
    if (idx !== -1 && m.length >= 2) {
      t = t.slice(0, idx) + '<mark>' + t.slice(idx, idx + m.length) + '</mark>' + t.slice(idx + m.length);
    }
  }
  return t;
}

module.exports = { rendreMarkdown, chargerPages, rechercher, surligner, normaliserTexte, AIDE_DIR };
