const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { searchLaws } = require('./laws');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4174);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 30);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const ANTHROPIC_TRANSLATE_MODEL = process.env.ANTHROPIC_TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';
const SYSTEM_PROMPT = fs.readFileSync(path.join(ROOT, 'docs', 'system-prompt.md'), 'utf8');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const rateBuckets = new Map();

function requestIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').split(',')[0].trim();
}

function enforceRateLimit(req) {
  if (req.method === 'OPTIONS') return;
  const key = `${requestIp(req)}:${req.url.split('?')[0]}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > RATE_LIMIT_MAX) {
    throw httpError(429, 'طلبات كثيرة خلال وقت قصير. جرّب بعد دقيقة.');
  }
}

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...extra
  };
}

function httpError(status, message, details = null) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 200_000) {
        reject(httpError(413, 'حجم الطلب كبير جدًا.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(httpError(400, 'صيغة JSON غير صحيحة.'));
      }
    });
  });
}

function requestAnthropic(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      method: 'POST',
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        let data = {};
        try {
          data = responseBody ? JSON.parse(responseBody) : {};
        } catch (error) {
          return reject(httpError(502, 'رد خدمة الذكاء الاصطناعي غير مفهوم.', { responseBody }));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(httpError(502, 'خدمة الذكاء الاصطناعي رفضت الطلب.', data));
        }
        return resolve(data);
      });
    });
    req.on('error', (error) => reject(httpError(502, 'تعذر الاتصال بخدمة الذكاء الاصطناعي.', { message: error.message })));
    req.write(body);
    req.end();
  });
}

// The ingested law articles are stored in English (official Bureau of Experts
// translations), but users ask in Arabic. Local keyword search can't match an Arabic
// query against English article text, so translate the query into English legal
// search terms first. Falls back to the original query if translation fails, so a
// transient error here degrades search quality rather than breaking the chat.
async function translateQueryToEnglish(query) {
  try {
    const response = await requestAnthropic({
      model: ANTHROPIC_TRANSLATE_MODEL,
      max_tokens: 100,
      system:
        'Extract 3-8 short English legal search keywords/phrases capturing the topic of the user message below, which may be in Arabic or English and may be a Saudi legal question. Reply with ONLY the keywords, space-separated, no punctuation, no explanation.',
      messages: [{ role: 'user', content: query.slice(0, 1000) }]
    });
    const text = (response.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim();
    return text || query;
  } catch (error) {
    return query;
  }
}

async function handleChat(req, res) {
  if (!ANTHROPIC_API_KEY) throw httpError(503, 'خدمة المستشار القانوني غير مفعّلة حاليًا.');
  const body = await readBody(req);
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (!incoming.length) throw httpError(400, 'أرسل استفسارك القانوني أولًا.');
  if (incoming.length > 20) throw httpError(400, 'المحادثة طويلة جدًا، ابدأ محادثة جديدة من فضلك.');
  const messages = incoming
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content || '').slice(0, 4000).trim()
    }))
    .filter((item) => item.content);
  if (!messages.length) throw httpError(400, 'أرسل استفسارك القانوني أولًا.');

  const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
  const searchQuery = lastUserMessage ? await translateQueryToEnglish(lastUserMessage.content) : '';
  const matches = searchQuery ? searchLaws(searchQuery, 5) : [];
  const lawContext = matches.length
    ? '\n\nمواد نظامية قد تكون ذات صلة بسؤال المستخدم (النص أدناه هو الترجمة الإنجليزية الرسمية الصادرة عن هيئة الخبراء بمجلس الوزراء — استخدمه إن كان ملائمًا، وترجمه بدقة إلى العربية عند الاستشهاد، مع التنبيه أن النص العربي الأصلي هو النص الحاكم قانونًا؛ وتجاهل المادة إن لم تكن ذات صلة):\n' +
      matches
        .map((match) => `- ${match.lawName} - ${match.label}${match.chapter ? ` (${match.chapter})` : ''}:\n${match.text}`)
        .join('\n\n')
    : '';

  const response = await requestAnthropic({
    model: ANTHROPIC_MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT + lawContext,
    messages
  });

  const reply = (response.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!reply) throw httpError(502, 'تعذر الحصول على رد من المستشار القانوني، حاول مرة أخرى.');
  return sendJson(res, 200, { reply });
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const requested = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.resolve(ROOT, `.${requested}`);
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(req.url);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, securityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('الصفحة غير موجودة.');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, securityHeaders({ 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' }));
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    enforceRateLimit(req);
    if (req.method === 'OPTIONS') return sendJson(res, 204, {});
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, service: 'Saudi Legal Advisor API' });
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      return await handleChat(req, res);
    }
    return serveStatic(req, res);
  } catch (error) {
    const status = error.status || 500;
    return sendJson(res, status, {
      error: {
        message: error.message || 'حدث خطأ غير متوقع.',
        details: error.details || null
      }
    });
  }
});

server.listen(PORT, () => {
  console.log(`Saudi Legal Advisor is running on http://localhost:${PORT}`);
});
