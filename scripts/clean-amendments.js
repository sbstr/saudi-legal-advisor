#!/usr/bin/env node
'use strict';

// Strips page-break noise from an extracted amendments-appendix text file before
// apply-amendments.js parses it. Skipping this step lets stray "-- N of M --\n<Title>\n<page>"
// blocks land inside quoted replacement text and corrupt multi-page article amendments.

const fs = require('fs');
const path = require('path');
const { cleanText } = require('./lib/clean-text');

const [, , inputPath, outputPath, title] = process.argv;
if (!inputPath || !outputPath || !title) {
  console.error('Usage: node scripts/clean-amendments.js <raw-amendments.txt> <clean-out.txt> "<Document Title as printed on PDF pages>"');
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const cleaned = cleanText(raw, title);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, cleaned, 'utf8');
console.log(`before: ${raw.length} chars, after: ${cleaned.length} chars`);
console.log('remaining page-break markers:', (cleaned.match(/-- \d+ of \d+ --/g) || []).length);
