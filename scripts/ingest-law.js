#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function isChapterHeading(line) {
  return /^(الباب|الفصل|القسم)(\s|$)/.test(line);
}

function isArticleStart(line) {
  return /^المادة(\s|$)/.test(line);
}

function parseArticles(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const articles = [];
  let currentChapter = '';
  let current = null;
  let articleCount = 0;

  for (const line of lines) {
    if (isChapterHeading(line)) {
      currentChapter = line;
      continue;
    }
    if (isArticleStart(line)) {
      if (current) articles.push(current);
      articleCount += 1;
      const label = line.split(/[:.]/)[0].trim();
      const restOfLine = line.slice(label.length).replace(/^[:.]\s*/, '');
      current = {
        number: articleCount,
        label,
        chapter: currentChapter,
        text: restOfLine
      };
      continue;
    }
    if (current) {
      current.text = current.text ? `${current.text}\n${line}` : line;
    }
  }
  if (current) articles.push(current);

  return articles;
}

function main() {
  const [, , inputPath, lawId, nameAr, decree = '', sourceUrl = ''] = process.argv;
  if (!inputPath || !lawId || !nameAr) {
    console.error(
      'الاستخدام: node scripts/ingest-law.js <ملف-النص> <law-id> "<اسم النظام بالعربي>" ["<المرسوم>"] ["<رابط المصدر>"]'
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const articles = parseArticles(raw);

  if (!articles.length) {
    console.error('لم يتم العثور على أي مادة تبدأ بكلمة "المادة" في الملف المُدخل. تحقق من تنسيق النص.');
    process.exit(1);
  }

  const law = {
    id: lawId,
    nameAr,
    decree,
    sourceUrl,
    ingestedAt: new Date().toISOString().slice(0, 10),
    articles
  };

  const outDir = path.join(__dirname, '..', 'data', 'laws');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${lawId}.draft.json`);
  fs.writeFileSync(outPath, JSON.stringify(law, null, 2), 'utf8');

  console.log(`تم استخراج ${articles.length} مادة من "${nameAr}".`);
  console.log(`المسودة محفوظة في: ${outPath}`);
  console.log('راجع الملف يدويًا للتأكد من دقة تقسيم المواد، ثم أعد تسميته إلى ' + `${lawId}.json` + ' لتفعيله في القاعدة.');
}

main();
