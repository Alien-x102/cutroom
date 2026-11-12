'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      pass_salt TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      payout_details TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      niche TEXT NOT NULL DEFAULT 'Other',
      description TEXT NOT NULL DEFAULT '',
      rules TEXT NOT NULL DEFAULT '',
      platforms TEXT NOT NULL,
      rate_per_1k REAL NOT NULL,
      budget REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      clipper_id INTEGER NOT NULL REFERENCES users(id),
      url TEXT NOT NULL,
      url_key TEXT NOT NULL,
      platform TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      views INTEGER NOT NULL DEFAULT 0,
      review_note TEXT NOT NULL DEFAULT '',
      paid INTEGER NOT NULL DEFAULT 0,
      paid_at INTEGER,
      created_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      UNIQUE (campaign_id, url_key)
    );
    CREATE INDEX IF NOT EXISTS idx_sub_campaign ON submissions(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_sub_clipper ON submissions(clipper_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  return db;
}

module.exports = { open };
