#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { cleanText } = require('./lib/clean-text');

function isPartHeading(line) {
  return /^(Part|Chapter|Section)\s+\d+/.test(line);
}

function parseArticles(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const articles = [];
  let currentChapter = '';
  let current = null;
  let expectedNext = 1;

  for (const line of lines) {
    if (!line) continue;

    if (isPartHeading(line)) {
      currentChapter = currentChapter ? `${currentChapter} > ${line}` : line;
      // Reset chapter prefix depth heuristically: if a "Part" heading recurs, restart the trail
      if (/^Part\s+\d+/.test(line)) currentChapter = line;
      continue;
    }

    const m = line.match(/^Article\s+(\d+)\b(.*)$/);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num === expectedNext) {
        if (current) articles.push(current);
        const rest = m[2].replace(/^:\s*/, '').trim();
        current = {
          number: num,
          label: `Article ${num}`,
          chapter: currentChapter,
          title: rest || null,
          text: ''
        };
        expectedNext = num + 1;
        continue;
      }
      // Number doesn't match sequence (e.g. a stray cross-reference at line start) — treat as body text.
    }

    if (current) {
      current.text = current.text ? `${current.text}\n${line}` : line;
    }
  }
  if (current) articles.push(current);
  return articles;
}

function main() {
  const [, , inputPath, lawId, nameAr, title, decree = '', sourceUrl = ''] = process.argv;
  if (!inputPath || !lawId || !nameAr || !title) {
    console.error(
      'Usage: node scripts/ingest-law-en.js <raw-text-file> <law-id> "<Arabic name>" "<Document Title as it appears on PDF pages>" ["<decree>"] ["<sourceUrl>"]'
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const cleaned = cleanText(raw, title);
  const articles = parseArticles(cleaned);

  if (!articles.length) {
    console.error('No articles extracted. Check the title parameter matches the PDF page header exactly.');
    process.exit(1);
  }

  const numbers = articles.map((a) => a.number);
  const gaps = [];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] !== numbers[i - 1] + 1) gaps.push(`${numbers[i - 1]} -> ${numbers[i]}`);
  }

  const law = {
    id: lawId,
    nameAr,
    language: 'en',
    governingTextNote:
      'This is the official Bureau of Experts English translation. Per the source document, the governing (authoritative) text is the Arabic original.',
    decree,
    sourceUrl,
    ingestedAt: new Date().toISOString().slice(0, 10),
    articles: articles.map((a) => ({
      number: a.number,
      label: a.title ? `Article ${a.number}: ${a.title}` : `Article ${a.number}`,
      chapter: a.chapter,
      text: a.text.trim()
    }))
  };

  const outDir = path.join(__dirname, '..', 'data', 'laws');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${lawId}.draft.json`);
  fs.writeFileSync(outPath, JSON.stringify(law, null, 2), 'utf8');

  console.log(`Extracted ${articles.length} articles (Article ${numbers[0]}..${numbers[numbers.length - 1]}).`);
  if (gaps.length) {
    console.log(`WARNING: numbering gaps detected: ${gaps.join(', ')}`);
  } else {
    console.log('Numbering is fully sequential, no gaps.');
  }
  console.log(`Draft written to: ${outPath}`);
}

main();
