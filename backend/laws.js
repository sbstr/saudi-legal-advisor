'use strict';

const fs = require('fs');
const path = require('path');

const LAWS_DIR = path.join(__dirname, '..', 'data', 'laws');

let cache = null;

function normalizeArabic(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[^؀-ۿ\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadLaws() {
  if (cache) return cache;
  cache = [];
  if (!fs.existsSync(LAWS_DIR)) return cache;
  for (const file of fs.readdirSync(LAWS_DIR)) {
    if (!file.endsWith('.json') || file.endsWith('.draft.json')) continue;
    try {
      const law = JSON.parse(fs.readFileSync(path.join(LAWS_DIR, file), 'utf8'));
      for (const article of law.articles || []) {
        article.searchText = normalizeArabic(
          `${law.nameAr} ${article.label} ${article.chapter || ''} ${article.text}`
        );
      }
      cache.push(law);
    } catch (error) {
      console.error(`تعذرت قراءة ملف النظام ${file}: ${error.message}`);
    }
  }
  return cache;
}

function searchLaws(query, limit = 5) {
  const laws = loadLaws();
  const terms = normalizeArabic(query)
    .split(' ')
    .filter((term) => term.length > 1);
  if (!terms.length) return [];

  const scored = [];
  for (const law of laws) {
    for (const article of law.articles || []) {
      let score = 0;
      for (const term of terms) {
        if (article.searchText.includes(term)) score += 1;
      }
      if (score > 0) {
        scored.push({ law, article, score });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ law, article }) => ({
    lawName: law.nameAr,
    label: article.label,
    chapter: article.chapter,
    text: article.text
  }));
}

module.exports = { loadLaws, searchLaws };
