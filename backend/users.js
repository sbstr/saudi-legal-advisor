'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const FREE_TRIAL_CONSULTATIONS = Number(process.env.FREE_TRIAL_CONSULTATIONS || 1);

function load() {
  if (!fs.existsSync(USERS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
  } catch (error) {
    console.error(`Could not read users store: ${error.message}`);
    return [];
  }
}

function save(users) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    consultationsUsed: user.consultationsUsed,
    consultationsRemaining: consultationsRemaining(user),
    planExpiresAt: user.planExpiresAt || null,
    createdAt: user.createdAt
  };
}

function consultationsRemaining(user) {
  if (user.plan && user.plan !== 'free') {
    if (user.plan === 'unlimited') return Infinity;
    const limit = Number(user.planConsultationLimit || 0);
    return Math.max(0, limit - (user.consultationsUsed || 0));
  }
  return Math.max(0, FREE_TRIAL_CONSULTATIONS - (user.consultationsUsed || 0));
}

function canConsult(user) {
  const remaining = consultationsRemaining(user);
  return remaining === Infinity || remaining > 0;
}

function findByEmail(email) {
  const users = load();
  return users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase()) || null;
}

function findById(id) {
  const users = load();
  return users.find((u) => u.id === id) || null;
}

function findByGoogleId(googleId) {
  const users = load();
  return users.find((u) => u.googleId === googleId) || null;
}

function createUser({ email, passwordHash, googleId, name }) {
  const users = load();
  const user = {
    id: crypto.randomBytes(12).toString('hex'),
    email: String(email).trim().toLowerCase(),
    passwordHash: passwordHash || null,
    googleId: googleId || null,
    name: String(name || email).trim(),
    plan: 'free',
    planConsultationLimit: 0,
    planExpiresAt: null,
    consultationsUsed: 0,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  users.push(user);
  save(users);
  return user;
}

function linkGoogleId(userId, googleId) {
  const users = load();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  user.googleId = googleId;
  user.updatedAt = nowIso();
  save(users);
  return user;
}

function recordConsultationUsed(userId) {
  const users = load();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  user.consultationsUsed = (user.consultationsUsed || 0) + 1;
  user.updatedAt = nowIso();
  save(users);
  return user;
}

module.exports = {
  findByEmail,
  findById,
  findByGoogleId,
  createUser,
  linkGoogleId,
  recordConsultationUsed,
  publicUser,
  canConsult,
  consultationsRemaining,
  FREE_TRIAL_CONSULTATIONS
};
