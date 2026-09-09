# قاعدة بيانات الأنظمة (data/laws)

الأنظمة الأربعة الحالية (`labor-law`, `companies-law`, `enforcement-law`, `civil-procedure-law`) مبنية من
**الترجمة الإنجليزية الرسمية** الصادرة عن شعبة الترجمة الرسمية بهيئة الخبراء بمجلس الوزراء (BOE). كل ملف
PDF يذكر صراحةً: *"This translation is provided for guidance. The governing text is the Arabic text."*
لذلك عند الإجابة، يجب على النموذج ترجمة النص إلى العربية بدقة والتنبيه أن النص العربي الأصلي هو الحاكم قانونًا
(هذا التنبيه مضمّن في السياق الذي يُحقن في كل طلب دردشة تلقائيًا، راجع `backend/server.js`).

## صيغة الملف

```json
{
  "id": "labor-law",
  "nameAr": "نظام العمل",
  "language": "en",
  "governingTextNote": "...",
  "decree": "Royal Decree No. M/51",
  "sourceUrl": "https://laws.boe.gov.sa",
  "ingestedAt": "2026-09-09",
  "amendmentsApplied": true,
  "repealedArticles": [149, 150, ...],
  "articles": [
    {
      "number": 98,
      "label": "Article 98",
      "chapter": "Part 6: Work Conditions and Circumstances > Chapter 2: Working Hours",
      "text": "A worker may not actually work for more than..."
    }
  ]
}
```

- `number`: قد يكون عشريًا (مثل `11.5`) للمواد المضافة لاحقًا بصيغة "Article 11 bis" — يبقى الترتيب صحيحًا بذلك.
- `label`: يطابق نص "Article N" أو "Article N: Title" كما يظهر في المصدر — هذا ما يُستخدم في الاستشهاد.
- `text`: النص الإنجليزي الكامل للمادة **بعد تطبيق كل التعديلات اللاحقة** (وليس النص الأصلي التاريخي فقط).
- `repealedArticles`: أرقام المواد الملغاة (تُستبعد من `articles` لكن تبقى مسجّلة هنا للمرجعية).

## خط أنابيب الاستيراد (Labor Law نموذجًا — فيه ملحق تعديلات، بقية الأنظمة نسخة واحدة بدون ملحق)

1. **الاستخراج الخام**: `node scripts/extract.js "<path.pdf>" out.txt` (يحتاج تثبيت `pdf-parse` — موجودة في
   `devDependencies`؛ شغّل `npm install` أولًا). ملفات BOE الرسمية نصّها نظيف تمامًا (بخلاف بعض نسخ PDF الممسوحة/سيئة
   الترميز التي تنتج حروفًا مبعثرة حرفًا حرفًا — إن حدث هذا توقف ولا تكمل الاستيراد آليًا).
2. **تقسيم المواد**: `node scripts/ingest-law-en.js <raw.txt> <law-id> "<اسم عربي>" "<Title as printed on PDF pages>" "<decree>" "<sourceUrl>"`
   يقسّم النص على حدود "Article N" مع تحقق تسلسلي (يرفض أي تطابق لا يوافق الرقم التالي المتوقع، لتفادي التقاط
   إشارات عابرة مثل "in accordance with Article 178 of this Law" كحد فاصل خاطئ). يطلع ملف `<law-id>.draft.json`.
3. **تطبيق التعديلات** (فقط إن وُجد ملحق "Appendix: Amendments" كما في نظام العمل): افصل نص الملحق عن المتن
   الأساسي عند أول ظهور لعنوان "Appendix"، نظّفه من فواصل الصفحات بنفس دالة `cleanText` المستخدمة في الخطوة 2،
   ثم شغّل `node scripts/apply-amendments.js <law-id>.draft.json <amendments-clean.txt>`. يتعرّف على أنماط:
   "Amending Article(s) N to read as follows", "Repealing/Deleting Article(s) N", "Renumbering Article X to be Y",
   "Adding a new article numbered N", واستبدال عبارة عامة "replacing the phrase X with Y wherever mentioned".
   **راجع دائمًا قائمة "Skipped/unrecognized directives" في المخرجات** — هذه تعديلات جزئية (فقرة واحدة، أو صياغة
   غير مألوفة) تحتاج تدخّلًا يدويًا.
4. **الرقعات اليدوية**: التعديلات التي لا يستطيع السكربت العام تطبيقها بثقة (مواد "bis"، إدراج عبارة داخل نص متصل،
   تعديل تعريف واحد داخل مادة تعريفات، مواد "combining" تتقاسم اقتباسًا واحدًا بلا فاصل واضح) تُكتب يدويًا في سكربت
   مخصص لكل نظام (انظر `scripts/manual-patches-labor-law.js` كمثال) باستخدام النص الحرفي من نفس المستند.
5. **فحص الجودة قبل التفعيل**: قبل إعادة تسمية `.draft.json` إلى `.json`، تحقق من: (أ) لا توجد مادة بنص فارغ،
   (ب) لا توجد مادة يحتوي نصها على `\nArticle N\n` (علامة تلوّث ناتجة عن دمج خاطئ لمادتين)، (ج) عدد المواد
   النهائي منطقي، (د) عيّنة عشوائية من المواد المعدَّلة تطابق النص المصدر حرفيًا.

## ملاحظة على البحث

`backend/laws.js` يبحث بالكلمات المفتاحية الإنجليزية (تطبيع بسيط + ترجيح حسب التكرار وتغطية عدد الكلمات
المطابقة، مع وزن إضافي لتطابق عنوان الباب/الفصل). بما أن أسئلة المستخدم عربية والمحتوى إنجليزي، `backend/server.js`
يستدعي نموذجًا صغيرًا (`ANTHROPIC_TRANSLATE_MODEL`) لاستخراج كلمات بحث إنجليزية من السؤال العربي قبل البحث —
بدون هذه الخطوة يفشل البحث تمامًا (صفر تطابق).
