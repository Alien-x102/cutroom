'use strict';
/*
 * Cutroom server. No npm dependencies: Node 22.13+ (built-in SQLite, crypto, http).
 * Env: PORT, DB_PATH, ADMIN_EMAIL, COOKIE_SECURE=1, TRUST_PROXY=1
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { open } = require('./db');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PLATFORMS = ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'X'];
const NICHES = ['Podcast', 'Livestream', 'Web3 / crypto', 'Education', 'Sports', 'Comedy', 'Other'];
const SESSION_MS = 30 * 24 * 3600 * 1000;
const CRYPTO_ASSETS = ['USDT', 'USDC'];
const CRYPTO_NETWORKS = ['TRC20', 'BEP20', 'ERC20', 'Solana', 'Polygon', 'Other'];
const XP_PER_CLIP = 5, XP_PER_1K = 1;
const TIERS = [['Bronze', 0], ['Silver', 300], ['Gold', 900], ['Platinum', 2000], ['Diamond', 4500]];
function tierInfo(xp) {
  let i = 0;
  TIERS.forEach((t, k) => { if (xp >= t[1]) i = k; });
  const cur = TIERS[i], next = TIERS[i + 1] || null;
  return { xp, tier: cur[0], level: i + 1, from: cur[1], next: next ? next[0] : null, nextAt: next ? next[1] : null,
    toNext: next ? next[1] - xp : 0, pct: next ? Math.round((xp - cur[1]) / (next[1] - cur[1]) * 100) : 100,
    tiers: TIERS.map((t) => ({ name: t[0], min: t[1] })), perClip: XP_PER_CLIP, per1k: XP_PER_1K };
}
const SUPPORT_TOPICS = ['Payments', 'My account', 'A campaign', 'A clip', 'Something else'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const round2 = (n) => Math.round(n * 100) / 100;

function detectPlatform(u) {
  try {
    const h = new URL(u).hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    if (/(^|\.)tiktok\.com$/.test(h)) return 'TikTok';
    if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram Reels';
    if (/(^|\.)youtube\.com$/.test(h) || h === 'youtu.be') return 'YouTube Shorts';
    if (/(^|\.)x\.com$/.test(h) || /(^|\.)twitter\.com$/.test(h)) return 'X';
  } catch (e) { /* not a URL */ }
  return null;
}
function normUrl(u) {
  const x = new URL(u);
  let k = x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '');
  if (/youtube/.test(x.hostname)) k += x.search;
  return k.toLowerCase();
}
function httpsUrl(v, label) {
  let u;
  try { u = new URL(String(v || '').trim()); } catch (e) { throw bad('Please paste ' + label.toLowerCase() + ' as a full link starting with https://'); }
  if (u.protocol !== 'https:') throw bad('Please paste ' + label.toLowerCase() + ' as a full link starting with https://');
  return u;
}
function text(v, label, min, max) {
  const s = String(v == null ? '' : v).trim();
  if (!s.length && min) throw bad('Please fill in ' + label.toLowerCase() + '.');
  if (s.length < min) throw bad(label + ' is a little short. Please add a bit more (at least ' + min + ' characters).');
  if (s.length > max) throw bad(label + ' is a bit too long. Please keep it under ' + max + ' characters.');
  return s;
}
function cleanPayout(p) {
  if (!p || typeof p !== 'object' || !p.type) return { type: '', fields: {} };
  if (p.type !== 'crypto') throw bad('Cutroom pays out in crypto only. Please add a wallet address.');
  const f = p.fields && typeof p.fields === 'object' ? p.fields : {};
  if (!CRYPTO_ASSETS.includes(f.asset)) throw bad('Please pick a coin.');
  if (!CRYPTO_NETWORKS.includes(f.network)) throw bad('Please pick a network.');
  const address = String(f.address || '').trim();
  if (!/^[A-Za-z0-9]{20,100}$/.test(address)) throw bad('That wallet address does not look right. Double-check it and paste it again (letters and numbers only).');
  return { type: 'crypto', fields: { asset: f.asset, network: f.network, address } };
}
function payoutSummary(type, f) {
  if (type === 'bank') return 'Bank transfer: ' + f.bankName + ', ' + f.accountNumber + ', ' + f.accountName;
  if (type === 'crypto') return f.asset + ' (' + f.network + '): ' + f.address;
  if (type === 'paypal') return 'PayPal: ' + f.email;
  if (type === 'other') return f.details;
  return '';
}
const SOCIAL_URL = {
  'TikTok': (h) => 'https://www.tiktok.com/@' + h, 'Instagram Reels': (h) => 'https://www.instagram.com/' + h,
  'YouTube Shorts': (h) => 'https://www.youtube.com/@' + h, 'X': (h) => 'https://x.com/' + h
};
function cleanSocials(arr) {
  if (!Array.isArray(arr)) throw bad('Connected accounts must be a list.');
  if (arr.length > 8) throw bad('You can connect up to 8 accounts.');
  const seen = new Set(), out = [];
  for (const a of arr) {
    const platform = a && a.platform, handle = String((a && a.handle) || '').trim().replace(/^@+/, '');
    if (!PLATFORMS.includes(platform)) throw bad('Please choose TikTok, Instagram, YouTube or X for each account.');
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(handle)) throw bad('Handles can use letters, numbers, dots, dashes and underscores (up to 40 characters).');
    const k = platform + ':' + handle.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push({ platform, handle });
  }
  return out;
}
const withUrls = (raw) => { try { return JSON.parse(raw || '[]').map((s) => ({ platform: s.platform, handle: s.handle, url: (SOCIAL_URL[s.platform] || (() => '#'))(s.handle) })); } catch (e) { return []; } };
function payoutOf(type, json, legacy) {
  if (type) { try { return { type, fields: JSON.parse(json || '{}') }; } catch (e) { return { type: '', fields: {} }; } }
  return legacy ? { type: 'other', fields: { details: legacy } } : { type: '', fields: {} };
}
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createApp(opts = {}) {
  const env = opts.env || process.env;
  const dbFile = opts.dbFile || env.DB_PATH || path.join(__dirname, 'data', 'cutroom.db');
  const db = open(dbFile);
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  const trustProxy = env.TRUST_PROXY === '1';

  /* ---------- rate limiting ---------- */
  const hits = new Map();
  function limit(key, max, windowMs) {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n++;
    if (h.n > max) throw new HttpError(429, 'You have tried a few too many times. Give it a few minutes and try again.');
  }
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (h.reset < now) hits.delete(k); run('DELETE FROM sessions WHERE expires_at < ?', now); }, 10 * 60 * 1000);
  sweep.unref();

  /* ---------- helpers ---------- */
  const XP_SQL = `COALESCE(SUM(${XP_PER_CLIP} + (s.views / 1000) * ${XP_PER_1K}), 0)`;
  const clipperXp = (id) => get(`SELECT ${XP_SQL} AS xp FROM submissions s WHERE s.clipper_id = ? AND s.status = 'approved'`, id).xp;
  function xpChanged(uid, before, selfId) {
    const after = clipperXp(uid), a = tierInfo(before), b = tierInfo(after);
    if (b.level > a.level && uid !== selfId) notify(uid, 'tier', 'You just reached ' + b.tier + '! Nice work, keep the clips coming.', 'rank');
    return after - before;
  }
  function notify(userId, kind, msg, link) {
    run('INSERT INTO notifications (user_id, kind, text, link, created_at) VALUES (?, ?, ?, ?, ?)', userId, kind, String(msg).slice(0, 240), link || '', Date.now());
  }
  const SUB_SQL = `SELECT s.*, c.title AS campaign_title, c.rate_per_1k AS rate, c.owner_id AS campaign_owner,
      u.name AS clipper_name, u.payout_details AS clipper_payout, u.payout_type AS clipper_payout_type,
      u.payout_json AS clipper_payout_json, u.socials AS clipper_socials
    FROM submissions s JOIN campaigns c ON c.id = s.campaign_id JOIN users u ON u.id = s.clipper_id`;
  const CAMP_SQL = `SELECT c.*, u.name AS owner_name,
      COALESCE((SELECT SUM(s.views / 1000.0 * c.rate_per_1k) FROM submissions s WHERE s.campaign_id = c.id AND s.status = 'approved'), 0) AS claimed,
      (SELECT COUNT(*) FROM submissions s WHERE s.campaign_id = c.id) AS clips,
      (SELECT COUNT(*) FROM submissions s WHERE s.campaign_id = c.id AND s.status = 'approved') AS approved,
      (SELECT COUNT(*) FROM submissions s WHERE s.campaign_id = c.id AND s.status = 'pending') AS pending
    FROM campaigns c JOIN users u ON u.id = c.owner_id`;

  const cJson = (r) => ({
    id: r.id, title: r.title, sourceUrl: r.source_url, niche: r.niche, description: r.description, rules: r.rules,
    platforms: JSON.parse(r.platforms), ratePer1k: r.rate_per_1k, budget: r.budget, status: r.status,
    createdAt: r.created_at, ownerId: r.owner_id, ownerName: r.owner_name, claimed: round2(r.claimed),
    clips: r.clips, approved: r.approved, pending: r.pending,
    open: r.status === 'open' && r.claimed < r.budget
  });
  const sJson = (r, withClipper) => {
    const o = {
      id: r.id, campaignId: r.campaign_id, campaignTitle: r.campaign_title, platform: r.platform, url: r.url, note: r.note,
      status: r.status, views: r.views, reviewNote: r.review_note, paid: !!r.paid, paidAt: r.paid_at,
      createdAt: r.created_at, earned: r.status === 'approved' ? round2(r.views / 1000 * r.rate) : 0
    };
    if (withClipper) {
      o.clipperName = r.clipper_name;
      o.clipperTier = tierInfo(clipperXp(r.clipper_id)).tier;
      o.clipperSocials = withUrls(r.clipper_socials);
      if (r.status === 'approved') { o.clipperPayout = r.clipper_payout; o.clipperPayoutInfo = payoutOf(r.clipper_payout_type, r.clipper_payout_json, r.clipper_payout); }
    }
    return o;
  };
  const userJson = (u) => ({ id: u.id, name: u.name, email: /\.invalid$/.test(u.email) ? '' : u.email, role: u.role, payoutDetails: u.payout_details,
    hasPassword: !u.social, payout: payoutOf(u.payout_type, u.payout_json, u.payout_details), socials: withUrls(u.socials), showOnLeaderboard: u.show_lb !== 0, createdAt: u.created_at });
  const canManage = (user, camp) => user && (user.role === 'admin' || camp.owner_id === user.id);

  function clientIp(req) {
    if (trustProxy) { const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (f) return f; }
    return req.socket.remoteAddress || 'unknown';
  }
  function secureCookie(req) {
    return env.COOKIE_SECURE === '1' || (trustProxy && req.headers['x-forwarded-proto'] === 'https');
  }
  function cookies(req) {
    const out = {};
    String(req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
    return out;
  }
  function sessionUser(req) {
    const t = cookies(req).sid;
    if (!t) return null;
    const row = get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?', sha256(t), Date.now());
    return row || null;
  }
  function startSession(req, res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, Date.now() + SESSION_MS);
    res.setHeader('Set-Cookie', 'sid=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + Math.floor(SESSION_MS / 1000) + (secureCookie(req) ? '; Secure' : ''));
  }
  function endSession(req, res) {
    const t = cookies(req).sid;
    if (t) run('DELETE FROM sessions WHERE token_hash = ?', sha256(t));
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + (secureCookie(req) ? '; Secure' : ''));
  }
  function send(res, status, body, headers) {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
    res.end(data);
  }
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > 64 * 1024) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { const b = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(b && typeof b === 'object' ? b : {}); }
        catch (e) { reject(bad('Request body must be valid JSON.')); }
      });
      req.on('error', reject);
    });
  }

  /* ---------- routes ---------- */
  const routes = [];
  function route(method, pattern, handler, auth) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([0-9]+)'; }) + '$');
    routes.push({ method, re, keys, handler, auth: !!auth });
  }
  const intParam = (v) => { const n = Number(v); if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(404, 'Not found.'); return n; };

  // ----- auth -----
  route('POST', '/api/signup', async (c) => {
    limit('signup:' + c.ip, 20, 3600 * 1000);
    const name = text(c.body.name, 'Name', 2, 60);
    const email = text(c.body.email, 'Email', 3, 200).toLowerCase();
    const pw = String(c.body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('That email address does not look right. Could you check it?');
    if (pw.length < 8) throw bad('Please use a password with at least 8 characters.');
    if (pw.length > 200) throw bad('Password is too long.');
    if (get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'There is already an account with that email. Try logging in instead.');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await scrypt(pw, salt)).toString('hex');
    const isFirst = !get('SELECT id FROM users LIMIT 1');
    const role = isFirst || (adminEmail && email === adminEmail) ? 'admin' : 'user';
    const r = run('INSERT INTO users (email, name, pass_salt, pass_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', email, name, salt, hash, role, Date.now());
    startSession(c.req, c.res, Number(r.lastInsertRowid));
    return { user: userJson(get('SELECT * FROM users WHERE id = ?', r.lastInsertRowid)) };
  });

  route('POST', '/api/login', async (c) => {
    const email = String(c.body.email || '').trim().toLowerCase();
    limit('login:' + c.ip + ':' + email, 10, 15 * 60 * 1000);
    const u = get('SELECT * FROM users WHERE email = ?', email);
    const salt = u ? u.pass_salt : 'x'.repeat(32);
    const hash = await scrypt(String(c.body.password || ''), salt);
    const ok = u && crypto.timingSafeEqual(hash, Buffer.from(u.pass_hash, 'hex'));
    if (!ok) throw new HttpError(401, 'We could not match that email and password. Please try again.');
    startSession(c.req, c.res, u.id);
    return { user: userJson(u) };
  });


  // ----- sign in with Google / X -----
  const providers = {
    google: { on: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET,
      auth: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth', token: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
      info: env.GOOGLE_INFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid email profile', col: 'google_id' },
    x: { on: !!(env.X_CLIENT_ID && env.X_CLIENT_SECRET), id: env.X_CLIENT_ID, secret: env.X_CLIENT_SECRET,
      auth: env.X_AUTH_URL || 'https://x.com/i/oauth2/authorize', token: env.X_TOKEN_URL || 'https://api.x.com/2/oauth2/token',
      info: env.X_INFO_URL || 'https://api.x.com/2/users/me?user.fields=name,username', scope: 'users.read tweet.read', col: 'x_id' }
  };
  const publicBase = (req) => (env.PUBLIC_URL || '').trim().replace(/\/+$/, '') || ((secureCookie(req) ? 'https' : 'http') + '://' + req.headers.host);
  const redirectTo = (loc, cookie) => ({ redirect: loc, cookie });
  const oasCookie = (req, v, maxAge) => 'oas=' + v + '; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=' + maxAge + (secureCookie(req) ? '; Secure' : '');
  const authFail = (req, code) => redirectTo('/?auth_error=' + code + '#login', oasCookie(req, '', 0));

  function oauthStart(c, name) {
    const p = providers[name];
    if (!p.on) return authFail(c.req, 'unavailable');
    limit('oauthstart:' + c.ip, 30, 15 * 60 * 1000);
    const state = crypto.randomBytes(16).toString('base64url'), verifier = crypto.randomBytes(32).toString('base64url');
    const q = new URLSearchParams({ response_type: 'code', client_id: p.id, redirect_uri: publicBase(c.req) + '/api/auth/' + name + '/callback', scope: p.scope, state,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    if (name === 'google') q.set('prompt', 'select_account');
    return redirectTo(p.auth + '?' + q, oasCookie(c.req, Buffer.from(name + '.' + state + '.' + verifier).toString('base64url'), 600));
  }

  async function oauthProfile(name, p, code, verifier, redirectUri) {
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier, client_id: p.id });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (name === 'x') headers.Authorization = 'Basic ' + Buffer.from(p.id + ':' + p.secret).toString('base64'); else form.set('client_secret', p.secret);
    const tr = await fetch(p.token, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(10000) });
    const tok = await tr.json();
    if (!tr.ok || !tok.access_token) throw new Error('token');
    const ir = await fetch(p.info, { headers: { Authorization: 'Bearer ' + tok.access_token, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    const info = await ir.json();
    if (!ir.ok) throw new Error('profile');
    if (name === 'google') {
      if (!info.sub) throw new Error('profile');
      return { sub: String(info.sub), email: info.email_verified === true && info.email ? String(info.email).toLowerCase() : '', name: info.name || '' };
    }
    const d = info.data || {};
    if (!d.id) throw new Error('profile');
    return { sub: String(d.id), email: '', name: d.name || d.username || '' };
  }

  function socialUser(name, p, prof) {
    let u = get('SELECT * FROM users WHERE ' + p.col + ' = ?', prof.sub);
    if (u) return u;
    if (prof.email) {
      u = get('SELECT * FROM users WHERE email = ?', prof.email);
      if (u) { run('UPDATE users SET ' + p.col + ' = ? WHERE id = ?', prof.sub, u.id); return get('SELECT * FROM users WHERE id = ?', u.id); }
    }
    const email = prof.email || (name + '-' + prof.sub + '@social.cutroom.invalid');
    let nm = String(prof.name || '').replace(/\s+/g, ' ').trim().slice(0, 60); if (nm.length < 2) nm = 'Cutroom member';
    const isFirst = !get('SELECT id FROM users LIMIT 1');
    const role = isFirst || (prof.email && adminEmail && prof.email === adminEmail) ? 'admin' : 'user';
    const r = run('INSERT INTO users (email, name, pass_salt, pass_hash, role, created_at, social, ' + p.col + ') VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      email, nm, crypto.randomBytes(16).toString('hex'), crypto.randomBytes(64).toString('hex'), role, Date.now(), prof.sub);
    return get('SELECT * FROM users WHERE id = ?', r.lastInsertRowid);
  }

  async function oauthCallback(c, name) {
    const p = providers[name];
    if (!p.on) return authFail(c.req, 'unavailable');
    limit('oauthcb:' + c.ip, 30, 15 * 60 * 1000);
    const q = new URL(c.req.url, 'http://x').searchParams;
    if (q.get('error')) return authFail(c.req, 'cancelled');
    let parts = [];
    try { parts = Buffer.from(cookies(c.req).oas || '', 'base64url').toString().split('.'); } catch (e) { /* bad cookie */ }
    const code = q.get('code') || '', st = q.get('state') || '';
    if (parts.length !== 3 || parts[0] !== name || !st || st.length !== parts[1].length || !crypto.timingSafeEqual(Buffer.from(st), Buffer.from(parts[1])) || !code) return authFail(c.req, 'failed');
    let prof;
    try { prof = await oauthProfile(name, p, code, parts[2], publicBase(c.req) + '/api/auth/' + name + '/callback'); }
    catch (e) { return authFail(c.req, 'failed'); }
    const u = socialUser(name, p, prof);
    startSession(c.req, c.res, u.id);
    return redirectTo('/#dashboard', oasCookie(c.req, '', 0));
  }
  route('GET', '/api/auth/google', (c) => oauthStart(c, 'google'));
  route('GET', '/api/auth/x', (c) => oauthStart(c, 'x'));
  route('GET', '/api/auth/google/callback', (c) => oauthCallback(c, 'google'));
  route('GET', '/api/auth/x/callback', (c) => oauthCallback(c, 'x'));

  route('POST', '/api/logout', (c) => { endSession(c.req, c.res); return { ok: true }; });
  route('GET', '/api/me', (c) => ({ user: c.user ? userJson(c.user) : null }));

  route('PATCH', '/api/me', (c) => {
    const name = text(c.body.name, 'Name', 2, 60);
    let type = c.user.payout_type, json = c.user.payout_json, summary = c.user.payout_details, socials = c.user.socials;
    if (c.body.payout !== undefined) {
      const p = cleanPayout(c.body.payout);
      type = p.type; json = JSON.stringify(p.fields); summary = payoutSummary(p.type, p.fields);
    }
    if (c.body.socials !== undefined) socials = JSON.stringify(cleanSocials(c.body.socials));
    const showLb = c.body.showOnLeaderboard === undefined ? (c.user.show_lb !== 0 ? 1 : 0) : (c.body.showOnLeaderboard ? 1 : 0);
    run('UPDATE users SET name = ?, payout_type = ?, payout_json = ?, payout_details = ?, socials = ?, show_lb = ? WHERE id = ?', name, type, json, summary, socials, showLb, c.user.id);
    return { user: userJson(get('SELECT * FROM users WHERE id = ?', c.user.id)) };
  }, true);

  route('POST', '/api/me/password', async (c) => {
    limit('pw:' + c.user.id, 10, 15 * 60 * 1000);
    const cur = String(c.body.current || ''), next = String(c.body.next || '');
    const ok = crypto.timingSafeEqual(await scrypt(cur, c.user.pass_salt), Buffer.from(c.user.pass_hash, 'hex'));
    if (!ok) throw bad('That is not your current password. Please try again.');
    if (next.length < 8) throw bad('Please use a new password with at least 8 characters.');
    if (next.length > 200) throw bad('New password is too long.');
    if (next === cur) throw bad('Please pick a new password that is different from your current one.');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await scrypt(next, salt)).toString('hex');
    run('UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?', salt, hash, c.user.id);
    run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', c.user.id, sha256(cookies(c.req).sid || ''));
    return { ok: true };
  }, true);

  // ----- campaigns -----
  route('GET', '/api/campaigns', () => ({ campaigns: all(CAMP_SQL + ' ORDER BY c.id DESC').map(cJson) }));

  route('GET', '/api/campaigns/:id', (c) => {
    const row = get(CAMP_SQL + ' WHERE c.id = ?', intParam(c.params.id));
    if (!row) throw new HttpError(404, 'Campaign not found.');
    const out = { campaign: cJson(row), canManage: !!canManage(c.user, row), mine: [] };
    if (c.user) out.mine = all(SUB_SQL + ' WHERE s.campaign_id = ? AND s.clipper_id = ? ORDER BY s.id DESC', row.id, c.user.id).map((r) => sJson(r, false));
    return out;
  });

  route('POST', '/api/campaigns', (c) => {
    limit('camp:' + c.user.id, 20, 3600 * 1000);
    const b = c.body;
    const title = text(b.title, 'Campaign name', 3, 80);
    const src = httpsUrl(b.sourceUrl, 'Source video link');
    const niche = NICHES.includes(b.niche) ? b.niche : 'Other';
    const platforms = Array.isArray(b.platforms) ? PLATFORMS.filter((p) => b.platforms.includes(p)) : [];
    if (!platforms.length) throw bad('Please pick at least one platform.');
    const rate = Number(b.ratePer1k), budget = Number(b.budget);
    if (!(rate > 0 && rate <= 1000)) throw bad('Please set a pay rate per 1K views (more than 0).');
    if (!(budget > 0 && budget <= 100000000)) throw bad('Please set a total budget (more than 0).');
    const r = run('INSERT INTO campaigns (owner_id, title, source_url, niche, description, rules, platforms, rate_per_1k, budget, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      c.user.id, title, src.href, niche, text(b.description, 'Brief', 0, 600), text(b.rules, 'Rules', 0, 800), JSON.stringify(platforms), round2(rate), round2(budget), Date.now());
    return { id: Number(r.lastInsertRowid) };
  }, true);

  route('POST', '/api/campaigns/:id/status', (c) => {
    const camp = get('SELECT * FROM campaigns WHERE id = ?', intParam(c.params.id));
    if (!camp) throw new HttpError(404, 'Campaign not found.');
    if (!canManage(c.user, camp)) throw new HttpError(403, 'Only the brand can do that one.');
    if (c.body.status !== 'open' && c.body.status !== 'closed') throw bad('Status must be open or closed.');
    run('UPDATE campaigns SET status = ? WHERE id = ?', c.body.status, camp.id);
    return { ok: true };
  }, true);

  // ----- submissions -----
  route('POST', '/api/campaigns/:id/submissions', (c) => {
    limit('sub:' + c.user.id, 40, 3600 * 1000);
    const row = get(CAMP_SQL + ' WHERE c.id = ?', intParam(c.params.id));
    if (!row) throw new HttpError(404, 'Campaign not found.');
    if (!cJson(row).open) throw bad('This campaign is not taking new clips right now.');
    const u = httpsUrl(c.body.url, 'Clip link');
    const platform = detectPlatform(u.href);
    if (!platform) throw bad('Please paste a link from TikTok, Instagram, YouTube or X.');
    const allowed = JSON.parse(row.platforms);
    if (!allowed.includes(platform)) throw bad('This campaign accepts ' + allowed.join(', ') + '. That link is from ' + platform + '.');
    const key = normUrl(u.href);
    if (get('SELECT id FROM submissions WHERE campaign_id = ? AND url_key = ?', row.id, key)) throw new HttpError(409, 'Looks like that clip is already in this campaign.');
    const r = run('INSERT INTO submissions (campaign_id, clipper_id, url, url_key, platform, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      row.id, c.user.id, u.href, key, platform, text(c.body.note, 'Note', 0, 140), Date.now());
    if (row.owner_id !== c.user.id) notify(row.owner_id, 'clip', c.user.name + ' sent a new clip to \u201c' + row.title + '\u201d. It is ready for your review.', 'manage');
    return { id: Number(r.lastInsertRowid) };
  }, true);

  route('GET', '/api/my/submissions', (c) => ({
    submissions: all(SUB_SQL + ' WHERE s.clipper_id = ? ORDER BY s.id DESC', c.user.id).map((r) => sJson(r, false))
  }), true);

  route('GET', '/api/manage', (c) => {
    const admin = c.user.role === 'admin';
    const camps = (admin ? all(CAMP_SQL + ' ORDER BY c.id DESC') : all(CAMP_SQL + ' WHERE c.owner_id = ? ORDER BY c.id DESC', c.user.id)).map(cJson);
    const subs = (admin ? all(SUB_SQL + ' ORDER BY s.id DESC') : all(SUB_SQL + ' WHERE c.owner_id = ? ORDER BY s.id DESC', c.user.id)).map((r) => sJson(r, true));
    return { campaigns: camps, submissions: subs };
  }, true);

  function manageSub(c) {
    const s = get(SUB_SQL + ' WHERE s.id = ?', intParam(c.params.id));
    if (!s) throw new HttpError(404, 'Clip not found.');
    if (!(c.user.role === 'admin' || s.campaign_owner === c.user.id)) throw new HttpError(403, 'Only the brand can do that one.');
    return s;
  }
  const views = (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 1e10) throw bad('Please enter the views as a number (0 or more).'); return n; };

  route('POST', '/api/submissions/:id/approve', (c) => {
    const s = manageSub(c);
    const v = views(c.body.views);
    const before = clipperXp(s.clipper_id);
    run("UPDATE submissions SET status = 'approved', views = ?, reviewed_at = ?, review_note = '' WHERE id = ?", v, Date.now(), s.id);
    const gained = xpChanged(s.clipper_id, before, c.user.id);
    if (s.clipper_id !== c.user.id) notify(s.clipper_id, 'approved', 'Good news: your clip in \u201c' + s.campaign_title + '\u201d was approved. That is $' + round2(v / 1000 * s.rate).toFixed(2) + ' so far' + (gained > 0 ? ' and +' + gained + ' XP.' : '.'), 'wallet');
    return { ok: true };
  }, true);
  route('POST', '/api/submissions/:id/reject', (c) => {
    const s = manageSub(c);
    if (s.paid) throw bad('This clip is already marked as paid. Undo that first and then try again.');
    const why = text(c.body.reason, 'A short reason', 3, 140);
    run("UPDATE submissions SET status = 'rejected', views = 0, review_note = ?, reviewed_at = ? WHERE id = ?", why, Date.now(), s.id);
    if (s.clipper_id !== c.user.id) notify(s.clipper_id, 'rejected', 'Your clip in \u201c' + s.campaign_title + '\u201d was not accepted this time.' + (why ? ' Note from the brand: ' + why : ''), 'clips');
    return { ok: true };
  }, true);
  route('POST', '/api/submissions/:id/views', (c) => {
    const s = manageSub(c);
    if (s.status !== 'approved') throw bad('Approve the clip first, then add its views.');
    const before = clipperXp(s.clipper_id);
    run('UPDATE submissions SET views = ? WHERE id = ?', views(c.body.views), s.id);
    xpChanged(s.clipper_id, before, c.user.id);
    return { ok: true };
  }, true);
  route('POST', '/api/submissions/:id/paid', (c) => {
    const s = manageSub(c);
    if (s.status !== 'approved') throw bad('Clips can be marked as paid once they are approved.');
    const paid = c.body.paid ? 1 : 0;
    run('UPDATE submissions SET paid = ?, paid_at = ? WHERE id = ?', paid, paid ? Date.now() : null, s.id);
    if (paid && !s.paid && s.clipper_id !== c.user.id) notify(s.clipper_id, 'paid', 'Payment sent: $' + round2(s.views / 1000 * s.rate).toFixed(2) + ' for your clip in \u201c' + s.campaign_title + '\u201d.', 'wallet');
    return { ok: true };
  }, true);

  // ----- notifications -----
  route('GET', '/api/notifications', (c) => ({
    items: all('SELECT id, kind, text, link, read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30', c.user.id)
      .map((n) => ({ id: n.id, kind: n.kind, text: n.text, link: n.link, read: !!n.read, createdAt: n.created_at })),
    unread: get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', c.user.id).n
  }), true);
  route('POST', '/api/notifications/read', (c) => {
    if (c.body.id !== undefined) run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', intParam(c.body.id), c.user.id);
    else run('UPDATE notifications SET read = 1 WHERE user_id = ?', c.user.id);
    return { ok: true };
  }, true);

  // ----- support -----
  route('GET', '/api/config', () => ({ login: { google: providers.google.on, x: providers.x.on }, support: {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL || '') ? env.SUPPORT_EMAIL : '' } }));
  route('POST', '/api/support', (c) => {
    limit('support:' + c.ip, 5, 3600 * 1000);
    const name = text(c.body.name, 'Your name', 2, 60);
    const email = text(c.body.email, 'Your email', 3, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('That email address does not look right. Could you check it?');
    const topic = SUPPORT_TOPICS.includes(c.body.topic) ? c.body.topic : 'Something else';
    const message = text(c.body.message, 'Your message', 10, 1000);
    run('INSERT INTO support_messages (user_id, name, email, topic, message, created_at) VALUES (?, ?, ?, ?, ?, ?)', c.user ? c.user.id : null, name, email, topic, message, Date.now());
    all("SELECT id FROM users WHERE role = 'admin'").forEach((a) => notify(a.id, 'support', 'New support message from ' + name + ' (' + topic + ').', 'inbox'));
    return { ok: true };
  });
  const needAdmin = (c) => { if (c.user.role !== 'admin') throw new HttpError(403, 'Only the Cutroom admin can open this.'); };
  const mJson = (m) => ({ id: m.id, name: m.name, email: m.email, topic: m.topic, message: m.message, status: m.status, reply: m.reply, repliedAt: m.replied_at, createdAt: m.created_at });
  route('GET', '/api/support', (c) => {
    needAdmin(c);
    return { items: all('SELECT * FROM support_messages ORDER BY status = \'open\' DESC, id DESC LIMIT 100').map(mJson) };
  }, true);
  route('GET', '/api/support/mine', (c) => ({ items: all('SELECT * FROM support_messages WHERE user_id = ? ORDER BY id DESC LIMIT 20', c.user.id).map((m) => ({ id: m.id, topic: m.topic, message: m.message, reply: m.reply, repliedAt: m.replied_at, createdAt: m.created_at })) }), true);
  route('POST', '/api/support/:id/reply', (c) => {
    needAdmin(c);
    const m = get('SELECT * FROM support_messages WHERE id = ?', intParam(c.params.id));
    if (!m) throw new HttpError(404, 'Message not found.');
    const reply = text(c.body.reply, 'Your reply', 2, 1000);
    run("UPDATE support_messages SET reply = ?, replied_at = ?, status = 'resolved' WHERE id = ?", reply, Date.now(), m.id);
    if (m.user_id) notify(m.user_id, 'support', 'Cutroom support replied to your message about \u201c' + m.topic + '\u201d.', 'contact');
    return { ok: true };
  }, true);
  route('POST', '/api/support/:id/resolve', (c) => {
    needAdmin(c);
    run("UPDATE support_messages SET status = ? WHERE id = ?", c.body.open ? 'open' : 'resolved', intParam(c.params.id));
    return { ok: true };
  }, true);

  // ----- leaderboard -----
  route('GET', '/api/leaderboard', (c) => {
    const week = new URL(c.req.url, 'http://x').searchParams.get('period') === 'week';
    const since = week ? Date.now() - 7 * 86400000 : 0;
    const rows = all(`SELECT u.id, u.name, u.show_lb, COUNT(*) AS clips, SUM(s.views) AS views, SUM(s.views / 1000.0 * c.rate_per_1k) AS earned, ${XP_SQL} AS xp
      FROM submissions s JOIN campaigns c ON c.id = s.campaign_id JOIN users u ON u.id = s.clipper_id
      WHERE s.status = 'approved' AND COALESCE(s.reviewed_at, s.created_at) >= ? GROUP BY u.id`, since);
    const shown = rows.filter((r) => r.show_lb !== 0).sort((a, b) => b.earned - a.earned || b.views - a.views);
    const list = shown.map((r, i) => ({ rank: i + 1, name: r.name, clips: r.clips, views: r.views, earned: round2(r.earned), tier: tierInfo(clipperXp(r.id)).tier, me: r.id === c.user.id }));
    const mine = list.find((r) => r.me) || null;
    const mineRow = rows.find((r) => r.id === c.user.id);
    return { period: week ? 'week' : 'all', top: list.slice(0, 20), total: list.length, me: mine, hidden: c.user.show_lb === 0, myStats: mineRow ? { clips: mineRow.clips, views: mineRow.views, earned: round2(mineRow.earned) } : null };
  }, true);

  // ----- stats and wallet -----
  const DAY = 86400000;
  function lastDays(n) {
    const t0 = Math.floor(Date.now() / DAY) * DAY, out = [];
    for (let i = n - 1; i >= 0; i--) out.push(t0 - i * DAY);
    return out;
  }
  route('GET', '/api/stats', (c) => {
    const days = lastDays(14), idx = (ts) => { const i = days.indexOf(Math.floor(ts / DAY) * DAY); return i; };
    const earn = (r) => round2(r.views / 1000 * r.rate);
    const rows = all(SUB_SQL + ' WHERE s.clipper_id = ? ORDER BY s.id', c.user.id);
    const clip = { lifetime: 0, paid: 0, pending: 0, inReview: 0, views: 0, total: rows.length, approved: 0, rejected: 0, days: days.map((d) => ({ date: new Date(d).toISOString().slice(0, 10), earned: 0, clips: 0 })), platforms: {}, campaigns: {} };
    const ledger = [];
    for (const r of rows) {
      const ci = idx(r.created_at); if (ci > -1) clip.days[ci].clips++;
      const p = clip.platforms[r.platform] || (clip.platforms[r.platform] = { clips: 0, earned: 0 }); p.clips++;
      if (r.status === 'pending') clip.inReview++;
      else if (r.status === 'rejected') clip.rejected++;
      else {
        const e = earn(r); clip.approved++; clip.lifetime += e; clip.views += r.views; p.earned += e;
        if (r.paid) clip.paid += e;
        const ei = idx(r.reviewed_at || r.created_at); if (ei > -1) clip.days[ei].earned += e;
        const k = clip.campaigns[r.campaign_id] || (clip.campaigns[r.campaign_id] = { title: r.campaign_title, earned: 0, views: 0, clips: 0 });
        k.earned += e; k.views += r.views; k.clips++;
        ledger.push({ id: r.id, campaignId: r.campaign_id, title: r.campaign_title, platform: r.platform, views: r.views, earned: e, paid: !!r.paid, at: r.paid ? r.paid_at : r.reviewed_at });
      }
    }
    clip.pending = round2(clip.lifetime - clip.paid); clip.lifetime = round2(clip.lifetime); clip.paid = round2(clip.paid);
    clip.days.forEach((d) => { d.earned = round2(d.earned); });
    clip.xp = tierInfo(clipperXp(c.user.id));
    clip.approvalRate = clip.approved + clip.rejected ? Math.round(clip.approved / (clip.approved + clip.rejected) * 100) : null;
    clip.platforms = Object.entries(clip.platforms).map(([name, v]) => ({ name, clips: v.clips, earned: round2(v.earned) })).sort((a, b) => b.clips - a.clips);
    clip.topCampaigns = Object.values(clip.campaigns).map((v) => ({ title: v.title, earned: round2(v.earned), views: v.views, clips: v.clips })).sort((a, b) => b.earned - a.earned).slice(0, 5);
    delete clip.campaigns;
    ledger.sort((a, b) => (b.at || 0) - (a.at || 0));

    let owner = null;
    const camps = all(CAMP_SQL + ' WHERE c.owner_id = ? ORDER BY c.id DESC', c.user.id).map(cJson);
    if (camps.length) {
      const subs = all(SUB_SQL + ' WHERE c.owner_id = ? ORDER BY s.id', c.user.id);
      owner = { campaigns: camps.length, live: camps.filter((x) => x.open).length, budget: round2(camps.reduce((a, x) => a + x.budget, 0)), committed: 0, owed: 0, paid: 0, views: 0, clips: subs.length, inReview: 0, approved: 0, rejected: 0, days: days.map((d) => ({ date: new Date(d).toISOString().slice(0, 10), clips: 0 })), top: camps.slice().sort((a, b) => b.claimed - a.claimed).slice(0, 5).map((x) => ({ title: x.title, claimed: x.claimed, budget: x.budget, clips: x.clips })) };
      for (const r of subs) {
        const i = idx(r.created_at); if (i > -1) owner.days[i].clips++;
        if (r.status === 'pending') owner.inReview++; else if (r.status === 'rejected') owner.rejected++;
        else { const e = earn(r); owner.approved++; owner.views += r.views; owner.committed += e; if (r.paid) owner.paid += e; else owner.owed += e; }
      }
      owner.committed = round2(owner.committed); owner.owed = round2(owner.owed); owner.paid = round2(owner.paid);
    }
    return { clipper: clip, ledger: ledger.slice(0, 50), owner };
  }, true);

  /* ---------- dispatch ---------- */
  async function api(req, res, url) {
    const method = req.method;
    let matched = null, pathMatch = false;
    for (const r of routes) {
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      pathMatch = true;
      if (r.method !== method) continue;
      matched = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]])) };
      break;
    }
    if (!matched) throw new HttpError(pathMatch ? 405 : 404, pathMatch ? 'Method not allowed.' : 'Not found.');
    if (method !== 'GET') {
      const origin = req.headers.origin;
      if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch (e) { /* bad origin */ } if (!ok) throw new HttpError(403, 'Cross-site requests are not allowed.'); }
    }
    const user = sessionUser(req);
    if (matched.r.auth && !user) throw new HttpError(401, 'Please log in to continue.');
    const body = method === 'GET' ? {} : await readBody(req);
    const out = await matched.r.handler({ req, res, user, body, params: matched.params, ip: clientIp(req) });
    if (out && out.redirect) {
      const set = [].concat(res.getHeader('Set-Cookie') || [], out.cookie || []);
      const h = { Location: out.redirect, 'Cache-Control': 'no-store' };
      if (set.length) h['Set-Cookie'] = set;
      res.writeHead(302, h); return res.end();
    }
    send(res, 200, out);
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, p));
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Not found.');
    let st;
    try { st = fs.statSync(file); } catch (e) { throw new HttpError(404, 'Page not found.'); }
    if (!st.isFile()) throw new HttpError(404, 'Page not found.');
    if (path.basename(file) === 'index.html') {
      const html = fs.readFileSync(file, 'utf8').split('__BASE__').join(publicBase(req));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      return res.end(req.method === 'HEAD' ? undefined : html);
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com; frame-src https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('ok'); }
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else serveStatic(req, res, url);
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) {
        if (req.url.startsWith('/api/')) send(res, e.status, { error: e.message });
        else { res.writeHead(e.status, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(e.message); }
      } else {
        console.error(e);
        send(res, 500, { error: 'Something went wrong on our side. Please try again.' });
      }
    }
  });
  server.on('close', () => { clearInterval(sweep); db.close(); });
  return { server, db };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { server } = createApp();
  server.listen(port, () => console.log('Cutroom running on http://localhost:' + port));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { createApp };
