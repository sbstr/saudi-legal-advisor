'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TICKETS_PATH = path.join(DATA_DIR, 'support-tickets.json');

function load() {
  if (!fs.existsSync(TICKETS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
  } catch (error) {
    console.error(`Could not read support tickets store: ${error.message}`);
    return [];
  }
}

function save(tickets) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TICKETS_PATH, JSON.stringify(tickets, null, 2), 'utf8');
}

function createTicket({ name, email, topic, message, userId }) {
  const tickets = load();
  const ticket = {
    id: crypto.randomBytes(10).toString('hex'),
    name,
    email,
    topic,
    message,
    userId: userId || null,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  tickets.push(ticket);
  save(tickets);
  return ticket;
}

module.exports = { createTicket };
