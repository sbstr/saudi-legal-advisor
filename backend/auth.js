'use strict';

const crypto = require('crypto');
const https = require('https');

const JWT_SECRET = process.env.JWT_SECRET || '';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// Minimal signed-token session (HMAC-SHA256), not full JWT — no external dependency
// needed for a single-server app. Payload is a small JSON object (userId, iat, exp).
function signSessionToken(payload) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token) {
  if (!JWT_SECRET || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

function createSessionToken(userId) {
  return signSessionToken({ userId, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const derived = crypto.scryptSync(password, salt, 64);
  const hashBuf = Buffer.from(hash, 'hex');
  if (hashBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(hashBuf, derived);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function sessionCookieHeader(token, { clear = false, secure = false } = {}) {
  const parts = [`session=${clear ? '' : encodeURIComponent(token)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax'];
  parts.push(clear ? 'Max-Age=0' : `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// Verifies a Google Identity Services ID token via Google's tokeninfo endpoint. This
// avoids pulling in the google-auth-library dependency for JWKS verification; Google
// documents this endpoint for exactly this purpose, with the caveat that it's rate
// limited and better suited to low/medium traffic than the client library.
function verifyGoogleIdToken(idToken) {
  return new Promise((resolve, reject) => {
    if (!GOOGLE_CLIENT_ID) return reject(new Error('GOOGLE_CLIENT_ID is not configured'));
    if (!idToken || typeof idToken !== 'string') return reject(new Error('missing credential'));
    https
      .get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(body);
          } catch (error) {
            return reject(new Error('invalid response from Google'));
          }
          if (res.statusCode !== 200) return reject(new Error(data.error_description || 'Google rejected the token'));
          if (data.aud !== GOOGLE_CLIENT_ID) return reject(new Error('token audience mismatch'));
          if (data.email_verified !== 'true' && data.email_verified !== true) {
            return reject(new Error('Google email not verified'));
          }
          resolve({ googleId: data.sub, email: data.email, name: data.name || data.email });
        });
      })
      .on('error', (error) => reject(error));
  });
}

module.exports = {
  createSessionToken,
  verifySessionToken,
  hashPassword,
  verifyPassword,
  parseCookies,
  sessionCookieHeader,
  verifyGoogleIdToken,
  isGoogleConfigured: () => Boolean(GOOGLE_CLIENT_ID)
};
