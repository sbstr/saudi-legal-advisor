#!/usr/bin/env node
'use strict';

// Hand-applies the handful of Labor Law amendment directives that the
// generic apply-amendments.js parser could not confidently automate
// (bis-numbered articles, inline phrase insertions, multi-article repeals,
// definition-line replacements). Text is taken verbatim from the official
// Bureau of Experts translation's Appendix: Amendments section.

const fs = require('fs');
const path = require('path');

const lawPath = path.join(__dirname, '..', 'data', 'laws', 'labor-law.draft.json');
const law = JSON.parse(fs.readFileSync(lawPath, 'utf8'));
const map = new Map(law.articles.map((a) => [a.number, a]));

function setArticle(number, label, chapter, text) {
  const existing = map.get(number) || { number, label, chapter: chapter || '' };
  existing.label = label;
  if (chapter) existing.chapter = chapter;
  existing.text = text.trim();
  map.set(number, existing);
}

function repeal(number) {
  if (map.has(number)) map.get(number).repealed = true;
}

function appendParagraphs(number, text) {
  const article = map.get(number);
  if (!article) return;
  article.text = `${article.text}\n${text.trim()}`;
}

function insertPhraseAfterWord(number, phrase, afterWord) {
  const article = map.get(number);
  if (!article) return;
  const idx = article.text.indexOf(afterWord);
  if (idx === -1) return;
  const insertAt = idx + afterWord.length;
  article.text = `${article.text.slice(0, insertAt)} ${phrase}${article.text.slice(insertAt)}`;
}

function replaceDefinitionLine(number, term, newText) {
  const article = map.get(number);
  if (!article) return;
  const lines = article.text.split('\n');
  const re = new RegExp(`^${term}\\s*:`);
  const idx = lines.findIndex((l) => re.test(l));
  if (idx === -1) return;
  // The old definition may wrap onto following lines; those continuation lines have to
  // go too, otherwise a dangling fragment of the superseded text is left behind. A
  // continuation line is anything up to (but not including) the next "Term:"-style
  // definition header or a numbered sub-item.
  let endIdx = idx + 1;
  while (
    endIdx < lines.length &&
    !/^[A-Z][A-Za-z][\w \-]*:/.test(lines[endIdx]) &&
    !/^\d+\./.test(lines[endIdx])
  ) {
    endIdx++;
  }
  lines.splice(idx, endIdx - idx, newText.trim());
  article.text = lines.join('\n');
}

// 1. Repealing Article 233 (2013 amendment) — later superseded by "Adding a new article
// numbered 233" (2024 amendment, applied below), so this repeal is transient; skip it
// since the final 2024 state already defines Article 233 correctly.

// 2. Adding Article 11 bis (2015 amendment).
setArticle(
  11.5,
  'Article 11 bis',
  map.get(11) ? map.get(11).chapter : '',
  'Without prejudice to the provisions of this Law and relevant regulations, the Minister may take any measures that would improve the performance of the labor market and regulate labor mobility.'
);

// 3. Repealing the provision of Article 78 and replacing it with the following (2015 amendment).
setArticle(
  78,
  'Article 78',
  map.get(78) ? map.get(78).chapter : '',
  'If notice is made by the employer, the worker shall be entitled to a paid leave of absence of a full day or eight hours per week, to seek other employment. The worker shall be entitled to determine the time of the leave of absence, provided that the employer is notified at least one day in advance. The employer may relieve the worker from attending work during the notice period without affecting the worker’s term of service or entitlements for such period.'
);

// 4. Adding Articles 234 and 235 (2018 amendment, M/14).
setArticle(
  234,
  'Article 234',
  '',
  `A. Labor courts may not hear any claim arising from this Law or from an employment contract upon the lapse of 12 months from the date of termination of the employment relation unless the claimant provides justification acceptable to the court or the defendant admits the right subject of the claim.
B. Labor suits shall be expeditiously heard.`
);
setArticle(
  235,
  'Article 235',
  '',
  'An employer may not, during the hearing of a suit before a labor court, alter employment conditions existing prior to the initiation of proceedings in a manner that undermines the interest of the worker in the suit.'
);

// 5. Amending the definition of "Worker" in Article 2 (2019 amendment, M/134).
replaceDefinitionLine(
  2,
  'Worker',
  'Worker: Any natural person - male or female - working for an employer and under his management or supervision for a wage, even if said person is not under his direct control.'
);

// 6. Repealing Article 156 (2019 amendment, M/134) — folded into amended Article 155.
repeal(156);

// 7. Adding two definitions to Article 2 (2024 amendment, M/44): Assignment, Resignation.
appendParagraphs(
  2,
  `Assignment: The service of providing a worker to work for a person other than the employer through an establishment licensed for such purpose.
Resignation: The worker’s written expression of his desire, without coercion, to terminate a fixed-term employment contract without any conditions or restrictions, and the acceptance thereof by the employer.`
);

// 8 & 9. Chapter/section title amendments (cosmetic headings, not article text) — update
// the `chapter` field on articles that fall under the renamed headings.
for (const a of map.values()) {
  if (typeof a.chapter === 'string') {
    a.chapter = a.chapter
      .replace(/Chapter 1: Employment Units/g, 'Chapter 1: Employment Channels')
      .replace(
        /Chapter 3: Private Offices for the Recruitment of Citizens and Private Offices for Recruiting\s*\n?from Abroad/g,
        'Chapter 3: Private Offices and Companies for the Recruitment of Citizens and Private Offices and Companies for Recruiting from Abroad'
      );
  }
}
// Replace "unit"/"units" -> "channels" only within Article 22-28 body text (employment
// channels chapter), matching the amendment's stated scope.
for (const num of [22, 23, 24, 25, 27, 28]) {
  const a = map.get(num);
  if (!a) continue;
  a.text = a.text.replace(/\bunits\b/g, 'channels').replace(/\bunit\b/g, 'channel');
}

// 10. Amending the beginning of Article 22 (2024 amendment) — replace the opening sentence.
{
  const a = map.get(22);
  if (a) {
    a.text = a.text.replace(
      /^The Ministry shall provide employment channels, free of charge, at locations convenient for employers[\s\S]*?undertake the following:/,
      'The Ministry shall provide employment channels, free of charge. Such channels shall undertake the following:'
    );
  }
}

// 11. Amending paragraph 3.3 of Article 22 (2024 amendment).
{
  const a = map.get(22);
  if (a) {
    a.text = a.text.replace(
      /3\.3\s*Referring workers[’']? applications to suitable vacant jobs\./,
      '3.3 Matching applications of job seekers with suitable job offers based on their qualifications.'
    );
  }
}

// 12. Amending Article 61 by adding paragraphs 4, 5, 6 (2024 amendment, M/44).
appendParagraphs(
  61,
  `4. Refrain from acts that would undermine equal opportunity or fair treatment in the workplace, whether by exclusion, favoritism, or discrimination between job applicants or employees on the basis of race, color, gender, age, disability, marital status, or any other form of discrimination.
5. Provide appropriate housing for his workers, or pay adequate cash allowance in lieu of housing to be included in their wage.
6. Provide appropriate transportation for workers to commute between their place of residence and their workplace, or pay adequate cash allowance in lieu of transportation to be included in their wage.`
);

// 13. Adding two paragraphs to Article 74 (2024 amendment): "3 bis" and "7 bis".
appendParagraphs(
  74,
  `3 bis. Resignation.
7 bis. Issuance of a decision or a final judgement by the competent court to terminate the worker's contract due to the initiation of any bankruptcy proceeding in accordance with the Bankruptcy Law.`
);

// 14. Adding Article 79 bis (2024 amendment, M/44).
setArticle(
  79.5,
  'Article 79 bis',
  map.get(79) ? map.get(79).chapter : '',
  `1. The resignation submitted shall be deemed accepted if the employer fails to respond to the resignation within 30 days from the date of submission. The employer may defer the acceptance of the resignation for a period not exceeding 60 days if work interest so requires, provided that the deferral of the acceptance is made prior to the lapse of the aforementioned 30-day period and the worker is provided with a written clarification for such deferral. The deferral period shall commence from the date the worker receives said clarification.
2. Termination of the employment contract by resignation shall become effective as of the date the employer accepts it, after the lapse of the 30-day period referred to in paragraph (1) of this Article without a response from the employer, or after the lapse of the deferral period of the acceptance of the resignation referred to in paragraph (1) of this Article.
3. The worker may withdraw his resignation within a period not exceeding seven days from the date of its submission, unless it is accepted by the employer prior to the withdrawal.
4. A resignation may not be tendered with a deferred date.
5. The employment contract shall be deemed valid during the period of tendering the resignation and the parties to the contract shall be bound to fulfill all the obligations arising therefrom during said period.
6. The worker whose contract is terminated by resignation shall be entitled to all rights provided for in this Law.`
);

// 15. Amending Article 199 by adding a phrase (2024 amendment).
insertPhraseAfterWord(199, 'and officers at the workplace', 'their agents');

// 16. Amending paragraph 5 of Article 230 by adding a phrase (2024 amendment) — applied
// directly as part of the full Article 230 text fix in #22 below (that fix also had to
// correct a separate quote-parsing bug that left Article 230 with stale/empty content).

// 17. Adding Article 229 bis (2024 amendment, M/44).
setArticle(
  229.5,
  'Article 229 bis',
  map.get(229) ? map.get(229).chapter : '',
  'Without prejudice to the provisions of Article 229 of this Law, any person who violates the provisions of Article 30(1) of this Law shall be subject to a fine not less than two hundred thousand riyals (SAR 200,000) and not more than five hundred thousand riyals (SAR 500,000).'
);

// 18. Repealing Articles 195, 197, 203, 205, 206, 207, and 208 (2024 amendment, M/44).
for (const num of [195, 197, 203, 205, 206, 207, 208]) repeal(num);

// 19. Deleting Articles 149 and 150 (2020 amendment, M/5) — verb "Deleting" wasn't
// recognized by the generic parser's directive keyword list.
repeal(149);
repeal(150);

// 21. Fix Articles 12 & 13 (2015 amendment, M/46): the auto-parser's quote extraction
// merged Article 13's text into Article 12's because both were combined in a single
// quoted block without a clean separating quote boundary.
setArticle(
  12,
  'Article 12',
  map.get(12) ? map.get(12).chapter : '',
  `1. The Ministry shall develop one or more model bylaws which shall include rules and regulations related to the conduct of work. It shall also include provisions relating to benefits, violations, and disciplinary actions.
2. The Ministry shall set rules regulating the adoption of bylaws.`
);
setArticle(
  13,
  'Article 13',
  map.get(13) ? map.get(13).chapter : '',
  `1. Every employer shall draft bylaws for his establishment in line with the Ministry's model bylaws. Exceptions to this provision may be granted by the Minister.
2. The employer may incorporate into the bylaws additional terms and conditions that do not conflict with the provisions of this Law, its Regulations, and the decisions for the implementation thereof.
3. The employer shall make the bylaws and any amendments thereto accessible to employees in a manner that ensures their knowledge of the provisions.`
);

// 22. Fix Article 230 (2015 amendment, M/46): a stray straight-quote mid-text inside
// the combined "Articles 229...241" replacement block caused the auto-parser to close
// the quote early, leaving Article 230 empty.
setArticle(
  230,
  'Article 230',
  map.get(230) ? map.get(230).chapter : '',
  `1. The Ministry may, pursuant to a decision by the Minister or his designee, impose both or either of the two penalties provided for in subparagraphs (a) and (b) of paragraph (1) of Article 229 of this Law, provided that half of the maximum limit set for each of them is not exceeded. The penalty decision may be appealed before the competent administrative court.
2. Pursuant to a decision by the Minister, a table shall be issued listing violations and the corresponding penalties that do not exceed half of the maximum limit of the two penalties provided for in subparagraphs (a) and (b) of paragraph (1) of Article 229 of this Law, taking into account that the fine shall be commensurate with the gravity of the violation.
3. Pursuant to a decision by the Minister, a table shall be issued listing violations whose penalties exceed half of the maximum limit of the two penalties provided for in subparagraphs (a) and (b) of paragraph (1) of Article 229 of this Law. Such table shall also list violations whose penalties are provided for in subparagraph (c) of paragraph (1) of Article 229.
4. If the violation warrants a penalty that exceeds half of the prescribed maximum limit, or if it warrants the permanent closure of the establishment, in accordance with the table provided for in paragraph (3) of this Article, the Ministry shall file a suit before the competent court to review the case and impose the appropriate penalty provided for in Article 229 of this Law.
5. The Ministry and the violator may agree to settle the violation by means of paying the fine assessed by the Ministry, provided that a decision to this effect is issued by the Minister or his designee.`
);

// 20. Adding a new article numbered 131 bis (2020 amendment, M/5) — the generic parser
// dropped this because the quoted replacement text has no internal "Article N" header
// to infer the number from (it came from the outer "numbered 131 bis" phrase instead).
setArticle(
  131.5,
  'Article 131 bis',
  map.get(131) ? map.get(131).chapter : '',
  'The Minister shall, pursuant to a decision issued thereby, determine the professions and jobs that are deemed dangerous or hazardous and are likely to expose the worker to extraordinary risk or harm, and shall determine categories of workers that are permanently or temporary banned from occupying said professions and jobs, or the conditions for occupying said professions and jobs, including the need to set working hours for such categories, in accordance with international agreements to which the Kingdom is a party.'
);

law.articles = [...map.values()]
  .filter((a) => !a.repealed)
  .sort((x, y) => x.number - y.number);
law.repealedArticles = [...new Set([...(law.repealedArticles || []), ...[...map.values()].filter((a) => a.repealed).map((a) => a.number)])].sort((a, b) => a - b);
law.manualPatchesApplied = true;

fs.writeFileSync(lawPath, JSON.stringify(law, null, 2), 'utf8');
console.log(`Done. Final article count: ${law.articles.length}`);
console.log('Repealed article numbers:', law.repealedArticles.join(', '));
