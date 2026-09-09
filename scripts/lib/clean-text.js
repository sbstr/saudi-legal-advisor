'use strict';

// Strips the repeating page-break noise that pdf-parse leaves in place of real page
// breaks in these BOE PDFs: "-- N of M --" followed by the document title and the page
// number. Shared between ingest-law-en.js (main body) and apply-amendments.js
// (amendments appendix) so both operate on identically cleaned text.
function cleanText(raw, title) {
  const titleEsc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pageBreak = new RegExp(`\\n*--\\s*\\d+\\s*of\\s*\\d+\\s*--\\n+${titleEsc}\\n\\d+\\n*`, 'g');
  let cleaned = raw.replace(pageBreak, '\n');
  cleaned = cleaned.replace(/\n*--\s*\d+\s*of\s*\d+\s*--\s*$/, '\n');
  return cleaned;
}

module.exports = { cleanText };
