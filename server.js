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
  try { u = new URL(String(v || '').trim()); } catch (e) { throw bad(label + ' must be a full link starting with https://'); }
  if (u.protocol !== 'https:') throw bad(label + ' must be a full link starting with https://');
  return u;
}
function text(v, label, min, max) {
  const s = String(v == null ? '' : v).trim();
  if (s.length < min) throw bad(label + (min ? ' is required.' : ' is invalid.'));
  if (s.length > max) throw bad(label + ' is too long (max ' + max + ' characters).');
  return s;
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
    if (h.n > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  }
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (h.reset < now) hits.delete(k); run('DELETE FROM sessions WHERE expires_at < ?', now); }, 10 * 60 * 1000);
  sweep.unref();

  /* ---------- helpers ---------- */
  const SUB_SQL = `SELECT s.*, c.title AS campaign_title, c.rate_per_1k AS rate, c.owner_id AS campaign_owner,
      u.name AS clipper_name, u.payout_details AS clipper_payout
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
      if (r.status === 'approved') o.clipperPayout = r.clipper_payout;
    }
    return o;
  };
  const userJson = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, payoutDetails: u.payout_details });
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email address.');
    if (pw.length < 8) throw bad('Password must be at least 8 characters.');
    if (pw.length > 200) throw bad('Password is too long.');
    if (get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with that email already exists. Try logging in.');
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
    if (!ok) throw new HttpError(401, 'Email or password is incorrect.');
    startSession(c.req, c.res, u.id);
    return { user: userJson(u) };
  });

  route('POST', '/api/logout', (c) => { endSession(c.req, c.res); return { ok: true }; });
  route('GET', '/api/me', (c) => ({ user: c.user ? userJson(c.user) : null }));

  route('PATCH', '/api/me', (c) => {
    const name = text(c.body.name, 'Name', 2, 60);
    const payout = text(c.body.payoutDetails, 'Payout details', 0, 300);
    run('UPDATE users SET name = ?, payout_details = ? WHERE id = ?', name, payout, c.user.id);
    return { user: userJson(get('SELECT * FROM users WHERE id = ?', c.user.id)) };
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
    if (!platforms.length) throw bad('Pick at least one platform.');
    const rate = Number(b.ratePer1k), budget = Number(b.budget);
    if (!(rate > 0 && rate <= 1000)) throw bad('Enter a pay rate per 1K views greater than 0.');
    if (!(budget > 0 && budget <= 100000000)) throw bad('Enter a total budget greater than 0.');
    const r = run('INSERT INTO campaigns (owner_id, title, source_url, niche, description, rules, platforms, rate_per_1k, budget, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      c.user.id, title, src.href, niche, text(b.description, 'Brief', 0, 600), text(b.rules, 'Rules', 0, 800), JSON.stringify(platforms), round2(rate), round2(budget), Date.now());
    return { id: Number(r.lastInsertRowid) };
  }, true);

  route('POST', '/api/campaigns/:id/status', (c) => {
    const camp = get('SELECT * FROM campaigns WHERE id = ?', intParam(c.params.id));
    if (!camp) throw new HttpError(404, 'Campaign not found.');
    if (!canManage(c.user, camp)) throw new HttpError(403, 'Only the campaign owner can do that.');
    if (c.body.status !== 'open' && c.body.status !== 'closed') throw bad('Status must be open or closed.');
    run('UPDATE campaigns SET status = ? WHERE id = ?', c.body.status, camp.id);
    return { ok: true };
  }, true);

  // ----- submissions -----
  route('POST', '/api/campaigns/:id/submissions', (c) => {
    limit('sub:' + c.user.id, 40, 3600 * 1000);
    const row = get(CAMP_SQL + ' WHERE c.id = ?', intParam(c.params.id));
    if (!row) throw new HttpError(404, 'Campaign not found.');
    if (!cJson(row).open) throw bad('This campaign is not accepting new clips.');
    const u = httpsUrl(c.body.url, 'Clip link');
    const platform = detectPlatform(u.href);
    if (!platform) throw bad('Use a link from TikTok, Instagram, YouTube or X.');
    const allowed = JSON.parse(row.platforms);
    if (!allowed.includes(platform)) throw bad('This campaign accepts ' + allowed.join(', ') + '. That link is from ' + platform + '.');
    const key = normUrl(u.href);
    if (get('SELECT id FROM submissions WHERE campaign_id = ? AND url_key = ?', row.id, key)) throw new HttpError(409, 'That clip has already been submitted to this campaign.');
    const r = run('INSERT INTO submissions (campaign_id, clipper_id, url, url_key, platform, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      row.id, c.user.id, u.href, key, platform, text(c.body.note, 'Note', 0, 140), Date.now());
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
    if (!(c.user.role === 'admin' || s.campaign_owner === c.user.id)) throw new HttpError(403, 'Only the campaign owner can do that.');
    return s;
  }
  const views = (v) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 1e10) throw bad('Views must be a number, 0 or more.'); return n; };

  route('POST', '/api/submissions/:id/approve', (c) => {
    const s = manageSub(c);
    run("UPDATE submissions SET status = 'approved', views = ?, reviewed_at = ?, review_note = '' WHERE id = ?", views(c.body.views), Date.now(), s.id);
    return { ok: true };
  }, true);
  route('POST', '/api/submissions/:id/reject', (c) => {
    const s = manageSub(c);
    if (s.paid) throw bad('This clip is already marked as paid. Undo that first.');
    run("UPDATE submissions SET status = 'rejected', views = 0, review_note = ?, reviewed_at = ? WHERE id = ?", text(c.body.reason, 'Reason', 0, 140), Date.now(), s.id);
    return { ok: true };
  }, true);
  route('POST', '/api/submissions/:id/views', (c) => {
    const s = manageSub(c);
    if (s.status !== 'approved') throw bad('Approve the clip before entering views.');
    run('UPDATE submissions SET views = ? WHERE id = ?', views(c.body.views), s.id);
    return { ok: true };
  }, true);
  route('POST', '/api/submissions/:id/paid', (c) => {
    const s = manageSub(c);
    if (s.status !== 'approved') throw bad('Only approved clips can be marked as paid.');
    const paid = c.body.paid ? 1 : 0;
    run('UPDATE submissions SET paid = ?, paid_at = ? WHERE id = ?', paid, paid ? Date.now() : null, s.id);
    return { ok: true };
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
    if (matched.r.auth && !user) throw new HttpError(401, 'Log in to continue.');
    const body = method === 'GET' ? {} : await readBody(req);
    const out = await matched.r.handler({ req, res, user, body, params: matched.params, ip: clientIp(req) });
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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
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
