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
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'info',
      text TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sub_campaign ON submissions(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_sub_clipper ON submissions(clipper_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('payout_type')) db.exec("ALTER TABLE users ADD COLUMN payout_type TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('payout_json')) db.exec("ALTER TABLE users ADD COLUMN payout_json TEXT NOT NULL DEFAULT '{}'");
  const scols = db.prepare('PRAGMA table_info(support_messages)').all().map((c) => c.name);
  if (!scols.includes('reply')) db.exec("ALTER TABLE support_messages ADD COLUMN reply TEXT NOT NULL DEFAULT ''");
  if (!scols.includes('replied_at')) db.exec('ALTER TABLE support_messages ADD COLUMN replied_at INTEGER');
  if (!cols.includes('show_lb')) db.exec('ALTER TABLE users ADD COLUMN show_lb INTEGER NOT NULL DEFAULT 1');
  if (!cols.includes('socials')) db.exec("ALTER TABLE users ADD COLUMN socials TEXT NOT NULL DEFAULT '[]'");
  if (!cols.includes('google_id')) db.exec('ALTER TABLE users ADD COLUMN google_id TEXT');
  if (!cols.includes('x_id')) db.exec('ALTER TABLE users ADD COLUMN x_id TEXT');
  if (!cols.includes('social')) db.exec('ALTER TABLE users ADD COLUMN social INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('company')) db.exec("ALTER TABLE users ADD COLUMN company TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('phone')) db.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('brand_status')) db.exec("ALTER TABLE users ADD COLUMN brand_status TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_users_google ON users(google_id) WHERE google_id IS NOT NULL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_users_x ON users(x_id) WHERE x_id IS NOT NULL');
  return db;
}

module.exports = { open };
