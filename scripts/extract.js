#!/usr/bin/env node
'use strict';

// Extracts raw text from a PDF using pdf-parse (pdfjs under the hood). Works cleanly on
// well-encoded PDFs (e.g. the official Bureau of Experts translations); PDFs where each
// glyph is positioned individually (some scanned/legacy copies) will come out with
// letters run together or spuriously tab-separated — inspect the output before trusting it.

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const [, , srcPath, outPath] = process.argv;
if (!srcPath || !outPath) {
  console.error('Usage: node scripts/extract.js <input.pdf> <output.txt>');
  process.exit(1);
}

(async () => {
  const data = fs.readFileSync(srcPath);
  const parser = new PDFParse({ data });
  const res = await parser.getText();
  console.log('PAGES:', res.pages ? res.pages.length : res.total);
  console.log('LEN:', res.text.length);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, res.text, 'utf8');
  await parser.destroy();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
