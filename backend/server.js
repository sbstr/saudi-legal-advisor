const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { searchLaws } = require('./laws');
const auth = require('./auth');
const users = require('./users');
const support = require('./support');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4174);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 30);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const ANTHROPIC_TRANSLATE_MODEL = process.env.ANTHROPIC_TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true';
const SYSTEM_PROMPT = fs.readFileSync(path.join(ROOT, 'docs', 'system-prompt.md'), 'utf8');
const PLANS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'plans.json'), 'utf8'));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
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

function getSessionUser(req) {
  const cookies = auth.parseCookies(req);
  const payload = auth.verifySessionToken(cookies.session);
  if (!payload || !payload.userId) return null;
  return users.findById(payload.userId);
}

function requireSessionUser(req) {
  const user = getSessionUser(req);
  if (!user) throw httpError(401, 'الرجاء تسجيل الدخول أولًا.');
  return user;
}

function setSessionCookie(res, headers, token, clear = false) {
  headers['Set-Cookie'] = auth.sessionCookieHeader(token, { clear, secure: COOKIE_SECURE });
}

function sendJsonWithCookie(res, status, body, cookieHeader) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Set-Cookie': cookieHeader
  });
  res.end(payload);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleRegister(req, res) {
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  if (!EMAIL_RE.test(email)) throw httpError(400, 'البريد الإلكتروني غير صحيح.');
  if (password.length < 8) throw httpError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  if (users.findByEmail(email)) throw httpError(409, 'هذا البريد الإلكتروني مسجّل مسبقًا.');
  const user = users.createUser({ email, passwordHash: auth.hashPassword(password), name });
  const token = auth.createSessionToken(user.id);
  return sendJsonWithCookie(res, 200, { user: users.publicUser(user) }, auth.sessionCookieHeader(token, { secure: COOKIE_SECURE }));
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = users.findByEmail(email);
  if (!user || !user.passwordHash || !auth.verifyPassword(password, user.passwordHash)) {
    throw httpError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  }
  const token = auth.createSessionToken(user.id);
  return sendJsonWithCookie(res, 200, { user: users.publicUser(user) }, auth.sessionCookieHeader(token, { secure: COOKIE_SECURE }));
}

async function handleGoogleAuth(req, res) {
  const body = await readBody(req);
  let profile;
  try {
    profile = await auth.verifyGoogleIdToken(body.credential);
  } catch (error) {
    throw httpError(401, 'تعذر التحقق من حساب جوجل.', { message: error.message });
  }
  let user = users.findByGoogleId(profile.googleId) || users.findByEmail(profile.email);
  if (!user) {
    user = users.createUser({ email: profile.email, googleId: profile.googleId, name: profile.name });
  } else if (!user.googleId) {
    user = users.linkGoogleId(user.id, profile.googleId);
  }
  const token = auth.createSessionToken(user.id);
  return sendJsonWithCookie(res, 200, { user: users.publicUser(user) }, auth.sessionCookieHeader(token, { secure: COOKIE_SECURE }));
}

function handleLogout(req, res) {
  return sendJsonWithCookie(res, 200, { ok: true }, auth.sessionCookieHeader('', { clear: true, secure: COOKIE_SECURE }));
}

function handleMe(req, res) {
  const user = getSessionUser(req);
  return sendJson(res, 200, { user: user ? users.publicUser(user) : null });
}

function handlePlans(req, res) {
  return sendJson(res, 200, { plans: PLANS });
}

function handleConfig(req, res) {
  return sendJson(res, 200, { googleClientId: GOOGLE_CLIENT_ID || null });
}

async function handleSupport(req, res) {
  const body = await readBody(req);
  const name = String(body.name || '').trim().slice(0, 200);
  const email = String(body.email || '').trim().toLowerCase();
  const topic = String(body.topic || 'عام').trim().slice(0, 100);
  const message = String(body.message || '').trim().slice(0, 2000);
  if (!name) throw httpError(400, 'الرجاء إدخال الاسم.');
  if (!EMAIL_RE.test(email)) throw httpError(400, 'البريد الإلكتروني غير صحيح.');
  if (!message) throw httpError(400, 'الرجاء كتابة رسالتك.');
  const sessionUser = getSessionUser(req);
  support.createTicket({ name, email, topic, message, userId: sessionUser ? sessionUser.id : null });
  return sendJson(res, 200, { ok: true });
}

async function handleChat(req, res) {
  if (!ANTHROPIC_API_KEY) throw httpError(503, 'خدمة المستشار القانوني غير مفعّلة حاليًا.');
  const sessionUser = requireSessionUser(req);
  if (!users.canConsult(sessionUser)) {
    throw httpError(403, 'استنفدت رصيد استشاراتك. الرجاء الاشتراك في إحدى الباقات للمتابعة.');
  }
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
  const updatedUser = users.recordConsultationUsed(sessionUser.id);
  return sendJson(res, 200, { reply, user: users.publicUser(updatedUser) });
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
    if (req.method === 'POST' && url.pathname === '/api/auth/register') {
      return await handleRegister(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      return await handleLogin(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/google') {
      return await handleGoogleAuth(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      return handleLogout(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      return handleMe(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/plans') {
      return handlePlans(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return handleConfig(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/support') {
      return await handleSupport(req, res);
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
