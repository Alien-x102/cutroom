'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

let app, base;
before(async () => {
  app = createApp({ dbFile: ':memory:', env: {} });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + app.server.address().port;
});
after(() => new Promise((r) => app.server.close(r)));

function client() {
  let cookie = '';
  return async function call(method, path, body, headers) {
    const res = await fetch(base + path, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json', Cookie: cookie }, headers || {}),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-json */ }
    return { status: res.status, data, res };
  };
}

const owner = client(), clipper = client(), other = client(), anon = client();
let campId, subId;

test('sign up: first user becomes admin, second is a normal user', async () => {
  let r = await owner('POST', '/api/signup', { name: 'Alien', email: 'Owner@Example.com', password: 'longenough1' });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, 'admin');
  assert.equal(r.data.user.email, 'owner@example.com');
  assert.match(r.res.headers.get('set-cookie'), /HttpOnly/);
  r = await clipper('POST', '/api/signup', { name: 'Clip Per', email: 'clip@example.com', password: 'longenough2' });
  assert.equal(r.data.user.role, 'user');
  r = await other('POST', '/api/signup', { name: 'Third', email: 'third@example.com', password: 'longenough3' });
  assert.equal(r.status, 200);
});

test('sign up rejects bad input and duplicates', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/signup', { name: 'A', email: 'x@y.co', password: 'longenough' })).status, 400);
  assert.equal((await c('POST', '/api/signup', { name: 'Abe', email: 'nope', password: 'longenough' })).status, 400);
  assert.equal((await c('POST', '/api/signup', { name: 'Abe', email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await c('POST', '/api/signup', { name: 'Abe', email: 'CLIP@example.com', password: 'longenough' })).status, 409);
});

test('login, wrong password, logout, me', async () => {
  const c = client();
  assert.equal((await c('GET', '/api/me')).data.user, null);
  assert.equal((await c('POST', '/api/login', { email: 'clip@example.com', password: 'wrongpass1' })).status, 401);
  const ok = await c('POST', '/api/login', { email: 'clip@example.com', password: 'longenough2' });
  assert.equal(ok.status, 200);
  assert.equal((await c('GET', '/api/me')).data.user.name, 'Clip Per');
  await c('POST', '/api/logout', {});
  assert.equal((await c('GET', '/api/me')).data.user, null);
});

test('auth required for writes; cross-site origin blocked', async () => {
  assert.equal((await anon('POST', '/api/campaigns', {})).status, 401);
  assert.equal((await anon('GET', '/api/manage')).status, 401);
  const r = await owner('POST', '/api/campaigns', {}, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('create campaign validates and saves', async () => {
  const good = { title: 'Episode 12 highlights', sourceUrl: 'https://www.youtube.com/watch?v=abc', niche: 'Podcast', description: 'Hooks', rules: '15-60s', platforms: ['TikTok', 'X'], ratePer1k: 1.5, budget: 10 };
  assert.equal((await owner('POST', '/api/campaigns', Object.assign({}, good, { sourceUrl: 'http://insecure.com' }))).status, 400);
  assert.equal((await owner('POST', '/api/campaigns', Object.assign({}, good, { platforms: [] }))).status, 400);
  assert.equal((await owner('POST', '/api/campaigns', Object.assign({}, good, { ratePer1k: 0 }))).status, 400);
  const r = await owner('POST', '/api/campaigns', good);
  assert.equal(r.status, 200);
  campId = r.data.id;
});

test('campaigns are public to browse', async () => {
  const list = await anon('GET', '/api/campaigns');
  assert.equal(list.data.campaigns.length, 1);
  assert.equal(list.data.campaigns[0].ownerName, 'Alien');
  assert.equal(list.data.campaigns[0].open, true);
  const one = await anon('GET', '/api/campaigns/' + campId);
  assert.equal(one.data.canManage, false);
  assert.equal((await anon('GET', '/api/campaigns/99999')).status, 404);
});

test('submit clip: platform rules, https, duplicates', async () => {
  const p = '/api/campaigns/' + campId + '/submissions';
  assert.equal((await anon('POST', p, { url: 'https://tiktok.com/@a/video/1' })).status, 401);
  assert.equal((await clipper('POST', p, { url: 'http://tiktok.com/@a/video/1' })).status, 400);
  assert.equal((await clipper('POST', p, { url: 'https://example.com/v/1' })).status, 400);
  assert.equal((await clipper('POST', p, { url: 'https://instagram.com/reel/1' })).status, 400); // not accepted on this campaign
  const r = await clipper('POST', p, { url: 'https://www.tiktok.com/@a/video/1', note: 'part 1' });
  assert.equal(r.status, 200);
  subId = r.data.id;
  assert.equal((await other('POST', p, { url: 'https://tiktok.com/@a/video/1/' })).status, 409); // same clip, different spelling
});

test('only the owner sees and manages the review queue', async () => {
  assert.equal((await clipper('POST', '/api/submissions/' + subId + '/approve', { views: 5000 })).status, 403);
  assert.equal((await other('GET', '/api/manage')).data.submissions.length, 0);
  const m = await owner('GET', '/api/manage');
  assert.equal(m.data.submissions.length, 1);
  assert.equal(m.data.submissions[0].clipperName, 'Clip Per');
  assert.equal(m.data.submissions[0].clipperPayout, undefined); // hidden until approved
});

test('approve, earnings, payout details, budget, paid', async () => {
  await clipper('PATCH', '/api/me', { name: 'Clip Per', payoutDetails: 'GTBank 0123456789' });
  assert.equal((await owner('POST', '/api/submissions/' + subId + '/approve', { views: -3 })).status, 400);
  assert.equal((await owner('POST', '/api/submissions/' + subId + '/approve', { views: 4000 })).status, 200);
  let mine = await clipper('GET', '/api/my/submissions');
  assert.equal(mine.data.submissions[0].status, 'approved');
  assert.equal(mine.data.submissions[0].earned, 6); // 4K views * $1.50
  assert.equal(mine.data.submissions[0].clipperName, undefined);
  let m = await owner('GET', '/api/manage');
  assert.equal(m.data.submissions[0].clipperPayout, 'GTBank 0123456789');
  assert.equal(m.data.campaigns[0].claimed, 6);
  assert.equal((await owner('POST', '/api/submissions/' + subId + '/views', { views: 8000 })).status, 200); // 12.00 of 10 budget
  m = await owner('GET', '/api/manage');
  assert.equal(m.data.campaigns[0].claimed, 12);
  assert.equal(m.data.campaigns[0].open, false); // budget reached
  const blocked = await other('POST', '/api/campaigns/' + campId + '/submissions', { url: 'https://x.com/a/status/9' });
  assert.equal(blocked.status, 400);
  assert.equal((await owner('POST', '/api/submissions/' + subId + '/paid', { paid: true })).status, 200);
  mine = await clipper('GET', '/api/my/submissions');
  assert.equal(mine.data.submissions[0].paid, true);
  assert.equal((await owner('POST', '/api/submissions/' + subId + '/reject', { reason: 'x' })).status, 400); // paid clips cannot be rejected
});

test('reject needs approval first for views/paid; close and reopen campaign', async () => {
  await owner('POST', '/api/campaigns/' + campId + '/status', { status: 'open' });
  const second = await clipper('POST', '/api/campaigns/' + campId + '/submissions', { url: 'https://x.com/a/status/10' });
  assert.equal(second.status, 400); // budget still reached (claimed 12 >= 10)
  const camp2 = await owner('POST', '/api/campaigns', { title: 'Second one', sourceUrl: 'https://youtu.be/zzz', platforms: ['X'], ratePer1k: 2, budget: 100 });
  const s = await clipper('POST', '/api/campaigns/' + camp2.data.id + '/submissions', { url: 'https://x.com/a/status/11' });
  assert.equal((await owner('POST', '/api/submissions/' + s.data.id + '/views', { views: 10 })).status, 400);
  assert.equal((await owner('POST', '/api/submissions/' + s.data.id + '/paid', { paid: true })).status, 400);
  assert.equal((await owner('POST', '/api/submissions/' + s.data.id + '/reject', { reason: 'off topic' })).status, 200);
  const mine = (await clipper('GET', '/api/my/submissions')).data.submissions.find((x) => x.id === s.data.id);
  assert.equal(mine.status, 'rejected');
  assert.equal(mine.reviewNote, 'off topic');
  assert.equal((await clipper('POST', '/api/campaigns/' + camp2.data.id + '/status', { status: 'closed' })).status, 403);
  assert.equal((await owner('POST', '/api/campaigns/' + camp2.data.id + '/status', { status: 'closed' })).status, 200);
  const closed = await other('POST', '/api/campaigns/' + camp2.data.id + '/submissions', { url: 'https://x.com/a/status/12' });
  assert.equal(closed.status, 400);
});

test('static files, traversal, security headers', async () => {
  const idx = await fetch(base + '/');
  assert.equal(idx.status, 200);
  assert.match(idx.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(base + '/..%2fserver.js')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/server.js')).status, 404);
  assert.equal((await fetch(base + '/nope.html')).status, 404);
});

test('login is rate limited', async () => {
  const c = client();
  let last;
  for (let i = 0; i < 12; i++) last = await c('POST', '/api/login', { email: 'ratelimit@example.com', password: 'wrongpass1' });
  assert.equal(last.status, 429);
});
