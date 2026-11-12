'use strict';
// Usage: node scripts/reset-password.js user@example.com "NewPassword123"
// Run on the server (same DB_PATH as the app). Signs the user out everywhere.
const crypto = require('crypto');
const { open } = require('../db');
const [email, pw] = process.argv.slice(2);
if (!email || !pw || pw.length < 8) { console.error('Usage: node scripts/reset-password.js <email> "<new password, 8+ chars>"'); process.exit(1); }
const db = open(process.env.DB_PATH || require('path').join(__dirname, '..', 'data', 'cutroom.db'));
const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
if (!u) { console.error('No user with that email.'); process.exit(1); }
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
db.prepare('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?').run(salt, hash, u.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
console.log('Password reset for ' + email + '. They are signed out everywhere.');
