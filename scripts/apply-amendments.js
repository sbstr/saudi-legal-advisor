#!/usr/bin/env node
'use strict';

// Applies the Labor Law's "Appendix: Amendments" changelog on top of the
// base 2005 article text, so the stored article text reflects the CURRENT
// law rather than the original superseded wording. Legal accuracy depends
// on this: several articles were substantively rewritten by later decrees.

const fs = require('fs');
const path = require('path');

function loadArticleMap(lawPath) {
  const law = JSON.parse(fs.readFileSync(lawPath, 'utf8'));
  const map = new Map();
  for (const a of law.articles) map.set(a.number, a);
  return { law, map };
}

// Strip a leading "Article N" / "Article N:" header from a quoted replacement block,
// since our storage keeps the number separate from the body text.
function stripArticleHeader(text, expectedNum) {
  const m = text.match(/^Article\s+(\d+)\s*:?\s*\n?/);
  if (m) {
    return { num: parseInt(m[1], 10), body: text.slice(m[0].length).trim() };
  }
  return { num: expectedNum, body: text.trim() };
}

// Split a quoted block that may contain several "Article N" sub-headers into
// [{num, body}], for amendments that replace/add multiple articles at once.
function splitMultiArticleQuote(quote) {
  const parts = quote.split(/\n(?=Article\s+\d+\s*\n)/);
  if (parts.length <= 1) return [stripArticleHeader(quote, null)];
  return parts.map((p) => stripArticleHeader(p, null)).filter((p) => p.num !== null);
}

function extractQuote(str, startIdx) {
  // startIdx points at the opening quote character.
  const quoteChar = str[startIdx];
  if (quoteChar !== '"') return null;
  let i = startIdx + 1;
  let depth = 1;
  while (i < str.length && depth > 0) {
    if (str[i] === '"') depth--;
    i++;
  }
  return { text: str.slice(startIdx + 1, i - 1), endIdx: i };
}

// Some amendment directives that "combine" several articles wrap EACH article in its
// own "..." pair back-to-back (rather than one quote spanning all of them), e.g.:
//   "Article 229\n...".
//   Article 230\n...".
// Extract every such quoted span in order, starting the scan at fromIdx.
function extractAllQuotes(str, fromIdx) {
  const quotes = [];
  let i = str.indexOf('"', fromIdx);
  while (i !== -1) {
    const q = extractQuote(str, i);
    if (!q) break;
    quotes.push(q.text);
    i = str.indexOf('"', q.endIdx);
  }
  return quotes;
}

function applyParagraphAmendment(article, paragraphNum, newParagraphText) {
  const lines = article.text.split('\n');
  const startRe = new RegExp(`^${paragraphNum}\\.\\s`);
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) return false;
  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    if (/^\d+\.\s/.test(lines[i])) {
      endLine = i;
      break;
    }
  }
  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine);
  const cleanNew = newParagraphText.replace(/^\d+\.\s*/, '').trim();
  const replacement = `${paragraphNum}. ${cleanNew}`;
  article.text = [...before, replacement, ...after].join('\n');
  return true;
}

function main() {
  const [, , lawPath, amendmentsPath] = process.argv;
  if (!lawPath || !amendmentsPath) {
    console.error('Usage: node scripts/apply-amendments.js <law.draft.json> <amendments-raw.txt>');
    process.exit(1);
  }

  const { law, map } = loadArticleMap(lawPath);
  const text = fs.readFileSync(amendmentsPath, 'utf8');

  const applied = [];
  const skipped = [];
  let nextNumber = Math.max(...map.keys()) + 1;

  // Split into bullet items: lines that start a new directive.
  const directiveRe = /(?:^|\n)[^\S\n]*[\u{E000}-\u{F8FF}]?[^\S\n]*(Amending|Repealing|Deleting|Adding|Renumbering)\b/gu;
  const starts = [];
  let m;
  while ((m = directiveRe.exec(text)) !== null) {
    starts.push(m.index);
  }
  starts.push(text.length);

  for (let i = 0; i < starts.length - 1; i++) {
    const chunk = text.slice(starts[i], starts[i + 1]).replace(/^[\s\u{E000}-\u{F8FF}]+/u, '').trim();
    if (!chunk) continue;

    let mm;

    // Global phrase replacement.
    if ((mm = chunk.match(/replacing\s+the\s+(?:word|phrase)\s+"([^"]+)"\s+with\s+the\s+(?:word|phrase)\s+"([^"]+)"/i))) {
      const [, from, to] = mm;
      let count = 0;
      for (const a of map.values()) {
        if (a.text.includes(from)) {
          a.text = a.text.split(from).join(to);
          count++;
        }
      }
      applied.push(`Global replace "${from}" -> "${to}" (${count} articles touched)`);
      continue;
    }

    // Repealing/Deleting Article N. (trailing text after the period, e.g. the next
    // decree's date header that got swept into this chunk, is ignored.)
    if ((mm = chunk.match(/^(?:Repealing|Deleting)\s+Article\s+(\d+)\s*\./))) {
      const num = parseInt(mm[1], 10);
      if (map.has(num)) {
        map.get(num).repealed = true;
        applied.push(`Repealed Article ${num}`);
      }
      continue;
    }

    // Repealing/Deleting Articles N, M, and P. (plural, multiple targets)
    if ((mm = chunk.match(/^(?:Repealing|Deleting)\s+Articles\s+([\d, ]+and\s+\d+)\s*\./))) {
      const nums = mm[1].match(/\d+/g).map(Number);
      for (const num of nums) {
        if (map.has(num)) {
          map.get(num).repealed = true;
          applied.push(`Repealed Article ${num}`);
        }
      }
      continue;
    }

    // Renumbering Article X to be Y [and amending it] to read as follows: "..."
    if ((mm = chunk.match(/^Renumbering\s+Article\s+(\d+)\s+to\s+be\s+(\d+)/))) {
      const [, fromNum, toNum] = mm;
      const quoteStart = chunk.indexOf('"');
      if (quoteStart !== -1) {
        const q = extractQuote(chunk, quoteStart);
        if (q) {
          const { body } = stripArticleHeader(q.text, parseInt(toNum, 10));
          const target = map.get(parseInt(toNum, 10)) || { number: parseInt(toNum, 10), label: `Article ${toNum}`, chapter: (map.get(parseInt(fromNum, 10)) || {}).chapter || '' };
          target.text = body;
          map.set(parseInt(toNum, 10), target);
        }
      }
      if (map.has(parseInt(fromNum, 10)) && fromNum !== toNum) {
        map.get(parseInt(fromNum, 10)).repealed = true;
        map.get(parseInt(fromNum, 10)).renumberedTo = parseInt(toNum, 10);
      }
      applied.push(`Renumbered Article ${fromNum} -> ${toNum}`);
      continue;
    }

    // Adding a new article to be numbered N [and M ...] to read as follows: "..." [...]".
    if ((mm = chunk.match(/^Adding\s+(?:a\s+new\s+article|.*?articles?)\s+to\s+be\s+numbered\s+([\d, ]+(?:and\s+\d+)?)/i))) {
      const quoteStart = chunk.indexOf('"');
      if (quoteStart !== -1) {
        const outerNums = mm[1].match(/\d+/g).map(Number);
        const bisMatch = chunk.match(/numbered\s+(\d+)\s*bis\b/i);
        if (bisMatch) {
          skipped.push(`NEEDS MANUAL FIX (bis-numbered addition): ${chunk.slice(0, 140)}`);
          continue;
        }
        const quotes = extractAllQuotes(chunk, quoteStart);
        const pieces = quotes.map((q) => stripArticleHeader(q, null));
        let ok = true;
        pieces.forEach((p, idx) => {
          const num = p.num !== null ? p.num : outerNums[idx];
          if (num === undefined) {
            skipped.push(`NEEDS MANUAL FIX (addition piece with no number): ${chunk.slice(0, 140)}`);
            ok = false;
            return;
          }
          map.set(num, { number: num, label: `Article ${num}`, chapter: '', text: p.body });
          applied.push(`Added Article ${num}`);
        });
        if (pieces.length === 0) ok = false;
        if (ok) continue;
        continue;
      }
      skipped.push(chunk.slice(0, 120));
      continue;
    }

    // Amending Article(s) N[, M, and P] ... to read as follows: "..." [...]".
    if ((mm = chunk.match(/^Amending\s+Articles?\s+([\d, ]+(?:and\s+\d+)?)[^"]*to\s+read\s+as\s+follows\s*:/i))) {
      const quoteStart = chunk.indexOf('"');
      if (quoteStart !== -1) {
        const targetNums = mm[1].match(/\d+/g).map(Number);
        const quotes = extractAllQuotes(chunk, quoteStart);
        const pieces = quotes.map((q) => stripArticleHeader(q, null));
        pieces.forEach((p, idx) => {
          const num = p.num !== null ? p.num : targetNums[idx];
          if (num === undefined) return;
          const existing = map.get(num) || { number: num, label: `Article ${num}`, chapter: '' };
          existing.text = p.body;
          map.set(num, existing);
          applied.push(`Amended Article ${num}`);
        });
        continue;
      }
      skipped.push(chunk.slice(0, 120));
      continue;
    }

    // Amending paragraph (N) of Article M to read as follows: "..."
    if ((mm = chunk.match(/^Amending\s+paragraph\s+\((\d+)\)\s+of\s+Article\s+(\d+)/i))) {
      const [, paraNum, artNum] = mm;
      const quoteStart = chunk.indexOf('"');
      if (quoteStart !== -1) {
        const q = extractQuote(chunk, quoteStart);
        const article = map.get(parseInt(artNum, 10));
        if (q && article) {
          const ok = applyParagraphAmendment(article, parseInt(paraNum, 10), q.text);
          if (ok) {
            applied.push(`Amended Article ${artNum} paragraph ${paraNum}`);
            continue;
          }
        }
      }
      skipped.push(chunk.slice(0, 120));
      continue;
    }

    skipped.push(chunk.slice(0, 120).replace(/\n/g, ' '));
  }

  law.articles = [...map.values()]
    .filter((a) => !a.repealed)
    .sort((x, y) => x.number - y.number);
  law.amendmentsApplied = true;
  law.repealedArticles = [...map.values()].filter((a) => a.repealed).map((a) => a.number);

  fs.writeFileSync(lawPath, JSON.stringify(law, null, 2), 'utf8');

  console.log(`Applied ${applied.length} amendment directives:`);
  for (const a of applied) console.log(`  - ${a}`);
  console.log(`\nSkipped/unrecognized directives: ${skipped.length}`);
  for (const s of skipped) console.log(`  ? ${s}`);
  console.log(`\nFinal article count: ${law.articles.length}`);
}

main();
