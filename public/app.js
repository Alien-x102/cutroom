(function () {
'use strict';
var app = document.getElementById('app');
var PLATFORMS = ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'X'];
var NICHES = ['Podcast', 'Livestream', 'Web3 / crypto', 'Education', 'Sports', 'Comedy', 'Other'];

var me = null, token = 0, platformFilter = 'All', manageTab = 'review', afterLogin = '';
var route = parseRoute();

/* ---------- helpers ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function fmt(n) { n = Number(n) || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }); }
function kviews(n) { n = Number(n) || 0; if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K'; return String(n); }
function ago(ts) { if (!ts) return ''; var s = Math.max(1, Math.round((Date.now() - ts) / 1000)); if (s < 60) return 'just now'; var m = Math.round(s / 60); if (m < 60) return m + 'm ago'; var h = Math.round(m / 60); if (h < 24) return h + 'h ago'; var d = Math.round(h / 24); if (d < 30) return d + 'd ago'; return new Date(ts).toLocaleDateString(); }
function safeUrl(u) { try { var x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : '#'; } catch (e) { return '#'; } }
function detect(u) {
  try {
    var h = new URL(u).hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    if (/(^|\.)tiktok\.com$/.test(h)) return 'TikTok';
    if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram Reels';
    if (/(^|\.)youtube\.com$/.test(h) || h === 'youtu.be') return 'YouTube Shorts';
    if (/(^|\.)x\.com$/.test(h) || /(^|\.)twitter\.com$/.test(h)) return 'X';
  } catch (e) { /* not a url */ }
  return null;
}
function initials(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function pill(k, t) { return '<span class="pill ' + k + '">' + esc(t) + '</span>'; }
function head(t, p) { return '<div class="head"><h1>' + esc(t) + '</h1>' + (p ? '<p>' + esc(p) + '</p>' : '') + '</div>'; }
function empty(t, p, action) { return '<div class="empty"><h3>' + esc(t) + '</h3><p>' + esc(p) + '</p>' + (action || '') + '</div>'; }
var tt;
function toast(m, bad) { var t = document.getElementById('toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, 3800); }

var inflight = 0;
function busy(d) { inflight = Math.max(0, inflight + d); document.body.classList.toggle('busy', inflight > 0); }

async function api(path, opts) {
  opts = opts || {};
  var init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  var res;
  busy(1);
  try { res = await fetch('/api' + path, init); } catch (e) { busy(-1); throw { message: 'We could not reach the server. Please check your connection and try again.' }; }
  busy(-1);
  var data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) throw { status: res.status, message: (data && data.error) || 'Something went wrong on our side. Please try again.' };
  return data;
}

function parseRoute() {
  var h = location.hash.replace(/^#/, '');
  if (/^c-\d+$/.test(h)) return { name: 'campaign', id: h.slice(2) };
  if (h === 'profile') return { name: 'settings' };
  if (h === 'home' && me) return { name: 'dashboard' };
  if (['login', 'signup', 'clips', 'manage', 'new', 'settings', 'terms', 'privacy', 'home', 'campaigns', 'dashboard', 'wallet', 'analytics', 'leaderboard', 'guide', 'rank', 'contact', 'inbox'].indexOf(h) > -1) return { name: h };
  return { name: me ? 'dashboard' : 'home' };
}
function needAuth(what) {
  afterLogin = location.hash.replace(/^#/, '');
  return head(what, '') + empty('Let\u2019s get you signed in', 'Log in or create a free account and you will land right back here.',
    '<div class="row" style="justify-content:center"><a class="btn primary" href="#login">Log in</a><a class="btn" href="#signup">Create account</a></div>');
}

/* ---------- chrome ---------- */
var ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  chart: '<path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 7V6a2 2 0 0 1 2-2h11"/><circle cx="16" cy="13.5" r="1"/>',
  inbox: '<path d="M4 13l2-8h12l2 8v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  logout: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9-4.3-4.1 5.9-.8z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>'
};
function ico(n) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }
var LOGO = '<svg class="logo" width="30" height="30" aria-hidden="true"><use href="#logo-mark"/></svg><span class="brand-t">Cutroom</span>';
var chrome = { pending: 0, bal: 0, unread: 0 }, notifs = [], notifOpen = false;

function navKey() {
  var n = route.name;
  return n === 'campaign' ? 'campaigns' : n;
}
function setChrome() {
  var cur = navKey();
  document.body.classList.toggle('has-side', !!me);
  document.body.classList.toggle('is-home', route.name === 'home');
  [].forEach.call(document.querySelectorAll('.brand'), function (b) { b.setAttribute('href', me ? '#dashboard' : '#home'); });
  var hbr = document.querySelector('.site-head .brand'); if (hbr) { hbr.setAttribute('aria-label', 'Open menu'); hbr.setAttribute('aria-controls', 'side'); }
  var auth = document.getElementById('auth'), menu = document.getElementById('menu');
  document.body.classList.toggle('guest', !me);
  if (!me) {
    auth.innerHTML = '<a class="btn sm" href="#login">Log in</a><a class="btn sm primary" href="#signup">Sign up</a>';
    var G = function (href, icon, label, scroll, key) {
      return '<a class="navl" href="' + href + '"' + (scroll ? ' data-scroll="' + scroll + '"' : '') + (key && cur === key && !scroll ? ' aria-current="page"' : '') + '>' + ico(icon) + '<span>' + label + '</span></a>'; };
    var links = route.name === 'home'
      ? G('#home', 'book', 'How it works', 'lp-how') + G('#home', 'chart', 'Estimate earnings', 'lp-calc') + G('#campaigns', 'compass', 'Campaigns', '', 'campaigns') + G('#guide', 'star', 'Clipper guide', '', 'guide') + G('#contact', 'help', 'Contact', '', 'contact')
      : G('#campaigns', 'compass', 'Campaigns', '', 'campaigns') + G('#guide', 'book', 'Clipper guide', '', 'guide') + G('#contact', 'help', 'Contact', '', 'contact') + G('#home', 'home', 'How it works', '', 'home');
    menu.innerHTML = route.name === 'home'
      ? '<a href="#home" data-scroll="lp-how">How it works</a><a href="#home" data-scroll="lp-calc">Estimate earnings</a><a href="#campaigns">Campaigns</a>'
      : [['campaigns', 'Campaigns'], ['guide', 'Clipper guide'], ['contact', 'Contact'], ['home', 'How it works']].map(function (i) {
        return '<a href="#' + i[0] + '"' + (cur === i[0] ? ' aria-current="page"' : '') + '>' + i[1] + '</a>'; }).join('');
    document.getElementById('side').innerHTML =
      '<div class="side-top"><a class="brand" href="#home">' + LOGO + '</a><button type="button" class="icon-btn side-x" data-act="navclose" aria-label="Close menu">' + ico('x') + '</button></div>'
      + '<div class="navg">Explore</div>' + links
      + '<div class="side-bottom guest-cta"><a class="btn primary" href="#signup">Create free account</a><a class="btn" href="#login">Log in</a></div>';
    return;
  }
  menu.innerHTML = '';
  auth.innerHTML = '<a class="bal" href="#wallet" aria-label="Balance ' + esc(fmt(chrome.bal)) + '"><span>Balance</span><b>' + esc(fmt(chrome.bal)) + '</b></a>'
    + '<button type="button" class="icon-btn" data-act="bell" aria-label="Notifications' + (chrome.unread ? ', ' + chrome.unread + ' new' : '') + '" aria-expanded="' + notifOpen + '">' + ico('bell')
    + (chrome.unread ? '<span class="dot">' + (chrome.unread > 9 ? '9+' : chrome.unread) + '</span>' : '') + '</button>'
    + '<a class="avatar" href="#settings" data-tab="profile" title="Settings" aria-label="Settings for ' + esc(me.name) + '">' + esc(initials(me.name)) + '</a>';
  var L = function (key, icon, label, extra, cls) {
    return '<a class="navl' + (cls ? ' ' + cls : '') + '" href="#' + key + '"' + (cur === key ? ' aria-current="page"' : '') + '>' + ico(icon) + '<span>' + label + '</span>' + (extra || '') + '</a>'; };
  document.getElementById('side').innerHTML =
    '<div class="side-top"><a class="brand" href="#dashboard">' + LOGO + '</a><button type="button" class="icon-btn side-x" data-act="navclose" aria-label="Close menu">' + ico('x') + '</button></div>'
    + '<a class="sidecard" href="#settings" data-tab="profile"><span class="avatar">' + esc(initials(me.name)) + '</span><div><b>' + esc(me.name) + '</b><small>' + (me.role === 'admin' ? 'Admin' : 'Clipper and brand') + '</small></div></a>'
    + '<div class="navg">Overview</div>' + L('dashboard', 'home', 'Home') + L('analytics', 'chart', 'Analytics')
    + '<div class="navg">Clip</div>' + L('campaigns', 'compass', 'Campaigns') + L('clips', 'film', 'My clips') + L('wallet', 'wallet', 'Wallet') + L('rank', 'star', 'My rank') + L('leaderboard', 'trophy', 'Leaderboard') + L('guide', 'book', 'Clipper guide')
    + '<div class="navg">Your campaigns</div>' + L('manage', 'inbox', 'Manage', chrome.pending ? '<span class="badge">' + (chrome.pending > 99 ? '99+' : chrome.pending) + '</span>' : '') + L('new', 'plus', 'Post a campaign', '', 'cta')
    + '<div class="navg">Account</div>' + L('settings', 'sliders', 'Settings') + L('contact', 'help', 'Help and contact') + (me.role === 'admin' ? L('inbox', 'inbox', 'Support inbox') : '')
    + '<div class="side-bottom"><button type="button" class="navl out" data-act="logout">' + ico('logout') + '<span>Log out</span></button></div>';
}
var statsAt = 0, statsP = null;
function getStats(force) {
  if (!force && statsP && Date.now() - statsAt < 4000) return statsP;
  statsAt = Date.now();
  statsP = api('/stats');
  statsP.catch(function () { statsAt = 0; });
  return statsP;
}
async function refreshBadge() {
  if (!me) { chrome = { pending: 0, bal: 0, unread: 0 }; notifs = []; return setChrome(); }
  var r = await Promise.all([api('/campaigns').catch(function () { return null; }), getStats().catch(function () { return null; }), api('/notifications').catch(function () { return null; })]);
  if (!me) return;
  if (r[0]) { var n = 0; r[0].campaigns.forEach(function (c) { if (me.role === 'admin' || c.ownerId === me.id) n += c.pending; }); chrome.pending = n; }
  if (r[1]) chrome.bal = r[1].clipper.pending;
  if (r[2]) { notifs = r[2].items; chrome.unread = r[2].unread; }
  setChrome();
  if (notifOpen) renderNotif();
}
function nIcon(k) { return { clip: 'film', approved: 'check', rejected: 'x', paid: 'wallet', tier: 'trophy', support: 'inbox' }[k] || 'bell'; }
function renderNotif() {
  var el = document.getElementById('notif');
  el.innerHTML = '<div class="n-head"><b>Notifications</b>' + (chrome.unread ? '<button type="button" class="linkbtn" data-act="nreadall">Mark all as read</button>' : '') + '</div><div class="n-list">'
    + (notifs.length ? notifs.map(function (n) {
      return '<button type="button" class="nitem' + (n.read ? '' : ' unread') + '" data-act="nopen" data-id="' + n.id + '" data-link="' + esc(n.link) + '"><span class="n-ico ' + esc(n.kind) + '">' + ico(nIcon(n.kind)) + '</span><div><p>' + esc(n.text) + '</p><small>' + ago(n.createdAt) + '</small></div></button>'; }).join('')
      : '<div class="n-empty"><b>You are all caught up</b>Updates about your clips and payments will show up here.</div>') + '</div>';
}
function closeNotif() { notifOpen = false; var el = document.getElementById('notif'); if (el) el.hidden = true; var b = document.querySelector('[data-act=bell]'); if (b) b.setAttribute('aria-expanded', 'false'); }
function setNav(open) {
  document.body.classList.toggle('nav-open', open);
  document.getElementById('scrim').hidden = !open;
  document.getElementById('burger').setAttribute('aria-expanded', String(open));
}

/* ---------- charts ---------- */
function niceMax(m) { if (m <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(m))), f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function shortDate(iso) { return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
function barChart(days, key, money, label, emptyMsg) {
  var W = 640, H = 220, L = 58, R = 8, T = 12, B = 30, iw = W - L - R, ih = H - T - B, n = days.length;
  var vals = days.map(function (d) { return d[key] || 0; }), total = vals.reduce(function (a, b) { return a + b; }, 0);
  var max = niceMax(Math.max.apply(null, vals));
  var fv = function (v) { return money ? '$' + (v >= 1000 ? (v / 1000) + 'K' : v) : String(v); };
  var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';
  [0, 0.5, 1].forEach(function (t) { var y = T + ih - ih * t; s += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 7) + '" y="' + (y + 5) + '" text-anchor="end">' + fv(+(max * t).toFixed(2)) + '</text>'; });
  var bw = iw / n, w = bw * 0.62;
  vals.forEach(function (v, i) {
    var x = (L + i * bw + (bw - w) / 2).toFixed(1);
    if (v > 0) { var h = Math.max(3, v / max * ih); s += '<rect class="bar" x="' + x + '" y="' + (T + ih - h).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"><title>' + shortDate(days[i].date) + ': ' + (money ? fmt(v) : v) + '</title></rect>'; }
    else s += '<rect class="bar z" x="' + x + '" y="' + (T + ih - 2) + '" width="' + w.toFixed(1) + '" height="2" rx="1"/>';
  });
  [0, Math.floor(n / 2), n - 1].forEach(function (i) { s += '<text x="' + (L + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + shortDate(days[i].date) + '</text>'; });
  return s + '</svg>' + (total === 0 ? '<p class="chart-note">' + esc(emptyMsg) + '</p>' : '');
}
function hbars(rows, fmtRight) {
  if (!rows.length) return '<p class="note">Nothing to show yet.</p>';
  var max = Math.max.apply(null, rows.map(function (r) { return r.v; })) || 1;
  return '<div class="hb">' + rows.map(function (r) {
    return '<div class="hb-row"><div class="hb-top"><span>' + esc(r.name) + '</span><span>' + esc(fmtRight(r)) + '</span></div><div class="hb-bar"><i style="width:' + Math.max(3, r.v / max * 100).toFixed(1) + '%"></i></div></div>'; }).join('') + '</div>';
}

/* ---------- views ---------- */
function ytId(u) {
  try { var x = new URL(u), h = x.hostname.replace(/^(www|m)\./, ''), m;
    if (h === 'youtube.com') { m = x.pathname.match(/^\/shorts\/([\w-]{6,})/); var id = m ? m[1] : x.searchParams.get('v'); return id && /^[\w-]{6,}$/.test(id) ? id : ''; }
    if (h === 'youtu.be') { m = x.pathname.match(/^\/([\w-]{6,})/); return m ? m[1] : ''; }
  } catch (e) { /* not a link */ }
  return '';
}
function hue(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return 255 + (h % 70); }
function brandAv(name, size) {
  var h = hue(name || '?');
  return '<span class="bav' + (size ? ' ' + size : '') + '" style="background:linear-gradient(135deg,hsl(' + h + ' 70% 58%),hsl(' + (h + 28) + ' 65% 38%))" aria-hidden="true">' + esc(initials(name)) + '</span>';
}
function media(c) {
  var id = ytId(c.sourceUrl), h = hue(c.title);
  return '<div class="camp-media" style="background:linear-gradient(135deg,hsl(' + h + ' 55% 26%),hsl(' + (h + 30) + ' 60% 12%))">'
    + (id ? '<img src="https://i.ytimg.com/vi/' + id + '/mqdefault.jpg" alt="" loading="lazy">' : '<span class="media-mark">' + esc(initials(c.title)) + '</span>') + '</div>';
}
function platLine(list) { return list.length >= PLATFORMS.length ? 'All platforms' : list.join(' · '); }
function campCard(c) {
  var pct = c.budget ? Math.min(100, c.claimed / c.budget * 100) : 0;
  var st = c.status === 'closed' ? 'Closed' : (c.open ? '' : 'Budget reached');
  return '<a class="card camp' + (c.open ? '' : ' is-closed') + '" href="#c-' + c.id + '">'
    + '<div class="media-wrap">' + media(c) + '<div class="camp-top"><span class="tag on-media">' + esc(c.niche) + '</span>' + (st ? pill('closed', st) : '') + '</div></div>'
    + '<div class="by">' + brandAv(c.ownerName, 'sm') + '<span>' + esc(c.ownerName) + '</span></div>'
    + '<h3>' + esc(c.title) + '</h3>'
    + '<div class="rate"><b>' + fmt(c.ratePer1k) + '</b><span>per 1K views</span></div>'
    + '<div class="track" role="img" aria-label="' + Math.round(pct) + ' percent of budget claimed"><i style="width:' + pct.toFixed(1) + '%"></i></div>'
    + '<div class="camp-meta"><span>' + fmt(Math.max(0, c.budget - c.claimed)) + ' left</span><span>' + c.clips + (c.clips === 1 ? ' clip' : ' clips') + '</span></div>'
    + '<p class="plat-line">' + esc(platLine(c.platforms)) + '</p></a>';
}

async function vCampaigns() {
  var d = await api('/campaigns');
  var list = d.campaigns.slice().sort(function (a, b) { return (b.open - a.open) || (b.createdAt - a.createdAt); });
  var out = '';
  if (!me) {
    out += head('Campaigns', 'Find one you like, cut clips from the source video, post them, and earn for every 1K approved views.')
      + '<div class="act" style="margin-bottom:18px"><a class="btn primary" href="#signup">Create free account</a><a class="btn" href="#login">Log in</a></div>';
  } else {
    out += '<div class="title-row" style="margin-bottom:6px"><div class="head" style="margin:0"><h1>Campaigns</h1></div><a class="btn primary" href="#new">Post a campaign</a></div>'
      + '<p class="muted" style="margin-bottom:16px">Find one you enjoy clipping. You earn for every 1K approved views.</p>';
  }
  if (!list.length) return out + empty('Nothing here just yet', me ? 'Why not start the first one? Add a source video, a rate per 1K views and a budget.' : 'New campaigns will show up here as soon as they are posted.', me ? '<a class="btn primary" href="#new">Post a campaign</a>' : '');
  campData = list;
  out += '<div class="searchrow"><input id="cSearch" type="search" placeholder="Search campaigns" aria-label="Search campaigns" autocomplete="off" value="' + esc(campQ) + '">'
    + '<select id="cSort" aria-label="Sort campaigns">' + [['new', 'Newest'], ['rate', 'Highest rate'], ['left', 'Most budget left'], ['clips', 'Most clips']].map(function (o) { return '<option value="' + o[0] + '"' + (campSort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
  out += '<div class="chips" role="group" aria-label="Filter by platform">' + ['All'].concat(PLATFORMS).map(function (p) {
    return '<button type="button" class="chip' + (platformFilter === p ? ' on' : '') + '" data-act="filter" data-v="' + esc(p) + '">' + esc(p) + '</button>'; }).join('') + '</div>';
  return out + '<div id="campGrid">' + campGridHtml() + '</div>';
}
var campQ = '', campSort = 'new', campData = [];
function campGridHtml() {
  var q = campQ.trim().toLowerCase(), l = campData.filter(function (c) {
    return (platformFilter === 'All' || c.platforms.indexOf(platformFilter) > -1) && (!q || (c.title + ' ' + c.niche + ' ' + (c.ownerName || '')).toLowerCase().indexOf(q) > -1); });
  l.sort(function (a, b) {
    var o = (b.open ? 1 : 0) - (a.open ? 1 : 0); if (o) return o;
    if (campSort === 'rate') return b.ratePer1k - a.ratePer1k;
    if (campSort === 'left') return (b.budget - b.claimed) - (a.budget - a.claimed);
    if (campSort === 'clips') return b.clips - a.clips;
    return b.createdAt - a.createdAt; });
  if (!l.length) return q ? empty('No matches for \u201c' + campQ.trim() + '\u201d', 'Try a different word, or clear the search.', '<button type="button" class="btn" data-act="clearq">Clear search</button>')
    : empty('No ' + platformFilter + ' campaigns right now', 'Try another platform and see what else is out there.', '<button type="button" class="btn" data-act="filter" data-v="All">Show all</button>');
  return '<div class="grid">' + l.map(campCard).join('') + '</div>';
}

function clipRow(s, showCamp) {
  return '<article class="card clip"><div class="row"><a class="clip-link" href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(s.platform) + ' clip ↗</a>'
    + '<span>' + (s.status === 'approved' && s.paid ? pill('paid', 'Paid') : pill(s.status, s.status === 'approved' ? 'Approved' : s.status === 'rejected' ? 'Rejected' : 'In review')) + '</span></div>'
    + '<div class="clip-meta">' + (showCamp ? '<a href="#c-' + s.campaignId + '">' + esc(s.campaignTitle) + '</a>' : '') + '<span>' + ago(s.createdAt) + '</span>'
    + (s.status === 'approved' ? '<span class="mono">' + kviews(s.views) + ' views</span><span class="mono">' + fmt(s.earned) + '</span>' : '') + '</div>'
    + (s.note ? '<p class="muted">' + esc(s.note) + '</p>' : '')
    + (s.status === 'rejected' ? '<div class="why"><b>Why it was declined</b><p>' + esc(s.reviewNote || 'The brand did not leave a reason.') + '</p><a href="#guide">See how to get clips approved</a></div>' : '') + '</article>';
}

async function vCampaign(id) {
  var d = await api('/campaigns/' + id), c = d.campaign;
  var left = Math.max(0, c.budget - c.claimed), pct = c.budget ? Math.min(100, c.claimed / c.budget * 100) : 0;
  var st = c.status === 'closed' ? ['closed', 'Closed'] : (c.open ? ['open', 'Open'] : ['closed', 'Budget reached']);
  var out = '<a class="back" href="#campaigns">← Campaigns</a><div class="detail-media">' + media(c) + '</div>'
    + '<div class="title-row"><h1>' + esc(c.title) + '</h1>' + pill(st[0], st[1]) + '</div>'
    + '<section class="slate"><div class="clapper" aria-hidden="true"></div><div class="slate-grid">'
    + '<div><label>Rate</label><b>' + fmt(c.ratePer1k) + ' / 1K</b></div><div><label>Budget left</label><b>' + fmt(left) + '</b></div>'
    + '<div><label>Approved clips</label><b>' + c.approved + '</b></div><div><label>Posted by</label><b>' + esc(c.ownerName) + '</b></div></div></section>'
    + '<div class="track" style="margin-top:10px" role="img" aria-label="' + Math.round(pct) + ' percent of budget claimed"><i style="width:' + pct.toFixed(1) + '%"></i></div>'
    + '<p class="muted mono" style="font-size:.8125rem;margin-top:6px">' + fmt(c.claimed) + ' of ' + fmt(c.budget) + ' claimed</p>';
  if (c.description) out += '<h2 class="sec">Brief</h2><p class="prose">' + esc(c.description) + '</p>';
  if (c.rules) out += '<h2 class="sec">Rules</h2><p class="prose">' + esc(c.rules) + '</p>';
  out += '<h2 class="sec">Source video</h2><a class="btn" href="' + esc(safeUrl(c.sourceUrl)) + '" target="_blank" rel="noopener noreferrer">Open source video ↗</a>'
    + '<p class="hint" style="margin-top:8px">Accepted on: ' + esc(c.platforms.join(', ')) + '</p><h2 class="sec">Send in a clip</h2><p class="note" style="margin-bottom:10px">New to this? <a href="#guide">Read the quick guide</a> before you send your first clip.</p>';
  if (!me) out += '<div class="banner"><a href="#login" data-after="c-' + c.id + '"><b>Log in</b></a> or <a href="#signup" data-after="c-' + c.id + '"><b>create a free account</b></a> to send in your clips.</div>';
  else if (!c.open) out += '<div class="banner">This campaign is taking a break and is not accepting new clips right now.</div>';
  else out += '<form id="clipForm" class="card form" data-cid="' + c.id + '" novalidate>'
    + '<div><label for="clipUrl">Link to your clip</label><input id="clipUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://www.tiktok.com/@you/video/…"><p class="hint" id="clipDet"></p></div>'
    + '<div><label for="clipNote">Note (optional)</label><input id="clipNote" type="text" maxlength="140" placeholder="e.g. Part 2 of the debate"></div>'
    + '<p class="err" id="clipErr" hidden></p><button class="btn primary" type="submit">Send clip</button></form>';
  if (d.mine.length) out += '<h2 class="sec">Your clips here</h2><div class="list">' + d.mine.map(function (s) { return clipRow(s, false); }).join('') + '</div>';
  if (d.canManage) out += '<h2 class="sec">Brand tools</h2><div class="card"><div class="row"><span>' + c.pending + ' waiting for review · ' + c.approved + ' approved</span>'
    + '<span class="act"><a class="btn sm" href="#manage">Review clips</a><button type="button" class="btn sm" data-act="' + (c.status === 'closed' ? 'reopen' : 'close') + '" data-id="' + c.id + '">' + (c.status === 'closed' ? 'Reopen' : 'Close campaign') + '</button></span></div></div>';
  return out;
}

async function vClips() {
  if (!me) return needAuth('My clips');
  var d = await api('/my/submissions'), my = d.submissions, tot = 0, paid = 0;
  my.forEach(function (s) { tot += s.earned; if (s.paid) paid += s.earned; });
  var out = head('My clips', 'Everything you have sent in, plus views and earnings once a clip is approved.');
  if (!my.length) return out + empty('No clips yet', 'When you are ready, pick a campaign, cut a clip from the source video and share the link here.', '<a class="btn primary" href="#campaigns">Browse campaigns</a>');
  if (!me.payout || !me.payout.type) out += '<div class="banner">Quick one: add your crypto wallet in <a href="#settings" data-tab="payout"><b>Settings</b></a> so brands know where to send your money.</div>';
  out += '<div class="stats"><div><label>Earned</label><b>' + fmt(tot) + '</b></div><div><label>Paid</label><b>' + fmt(paid) + '</b></div><div><label>Owed</label><b>' + fmt(tot - paid) + '</b></div></div>';
  return out + '<h2 class="sec">Submissions</h2><div class="list">' + my.map(function (s) { return clipRow(s, true); }).join('') + '</div>';
}

function vNew() {
  if (!me) return needAuth('New campaign');
  return '<a class="back" href="#campaigns">← Campaigns</a>' + head('Start a campaign', 'Share the source video, say what you will pay per 1K views, and set a budget. Clippers take it from there.')
    + '<form id="campForm" class="card form" novalidate>'
    + '<div><label for="cTitle">Campaign name</label><input id="cTitle" type="text" maxlength="80" placeholder="Podcast episode 12 highlights"></div>'
    + '<div><label for="cSource">Source video link</label><input id="cSource" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…"></div>'
    + '<div><label for="cNiche">Niche</label><select id="cNiche">' + NICHES.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') + '</select></div>'
    + '<div><label for="cBrief">Brief</label><textarea id="cBrief" rows="3" maxlength="600" placeholder="What should clippers pull out? Hooks, quotable moments, debates."></textarea></div>'
    + '<div><label for="cRules">Rules</label><textarea id="cRules" rows="4" maxlength="800" placeholder="15 to 60 seconds. Vertical 9:16. Burn in captions. Credit the source in the caption."></textarea></div>'
    + '<div><span class="lbl">Accepted platforms</span><div class="chips" style="flex-wrap:wrap;overflow:visible;margin:0">'
    + PLATFORMS.map(function (p, i) { return '<label class="chip" for="cP' + i + '"><input id="cP' + i + '" type="checkbox" checked>' + esc(p) + '</label>'; }).join('') + '</div></div>'
    + '<div class="two"><div><label for="cRate">Pay per 1K views ($)</label><input id="cRate" type="number" inputmode="decimal" min="0" step="0.01" placeholder="1.50"></div>'
    + '<div><label for="cBudget">Total budget ($)</label><input id="cBudget" type="number" inputmode="decimal" min="0" step="1" placeholder="500"></div></div>'
    + '<p class="hint" id="cHint"></p><p class="err" id="cErr" hidden></p><button class="btn primary" type="submit">Post campaign</button></form>';
}

var REASONS = ['Does not follow the rules', 'Wrong source video', 'Quality is too low', 'Too similar to another clip', 'Post is private or deleted'];
function embedFor(u) {
  try {
    var x = new URL(u), h = x.hostname.replace(/^(www|m)\./, ''), m;
    if (h === 'youtube.com') { m = x.pathname.match(/^\/shorts\/([\w-]{6,})/); var id = m ? m[1] : x.searchParams.get('v'); if (id && /^[\w-]{6,}$/.test(id)) return { src: 'https://www.youtube-nocookie.com/embed/' + id, wide: !m }; }
    if (h === 'youtu.be') { m = x.pathname.match(/^\/([\w-]{6,})/); if (m) return { src: 'https://www.youtube-nocookie.com/embed/' + m[1], wide: true }; }
    if (h === 'tiktok.com') { m = x.pathname.match(/\/video\/(\d+)/); if (m) return { src: 'https://www.tiktok.com/embed/v2/' + m[1] }; }
    if (h === 'instagram.com') { m = x.pathname.match(/\/(reel|reels|p)\/([\w-]+)/); if (m) return { src: 'https://www.instagram.com/' + (m[1] === 'reels' ? 'reel' : m[1]) + '/' + m[2] + '/embed' }; }
  } catch (e) { /* not a link we can embed */ }
  return null;
}
function previewBtn(u) { var e = embedFor(u); return e ? '<button type="button" class="btn sm" data-act="preview" data-src="' + esc(e.src) + '"' + (e.wide ? ' data-wide="1"' : '') + '>Preview here</button>' : ''; }
function socLine(s) {
  var l = s.clipperSocials || [];
  if (!l.length) return '';
  return '<p class="soc muted">Accounts: ' + l.map(function (a) { return '<a href="' + esc(safeUrl(a.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(a.platform) + ' @' + esc(a.handle) + '</a>'; }).join(' · ') + '</p>';
}
async function vManage() {
  if (!me) return needAuth('Manage');
  var d = await api('/manage'), camps = d.campaigns, subs = d.submissions;
  var pend = subs.filter(function (s) { return s.status === 'pending'; });
  var appr = subs.filter(function (s) { return s.status === 'approved'; }).sort(function (a, b) { return (a.paid ? 1 : 0) - (b.paid ? 1 : 0) || b.createdAt - a.createdAt; });
  var owed = 0, unpaid = 0; appr.forEach(function (s) { if (!s.paid) { owed += s.earned; unpaid++; } });
  var out = '<div class="head"><div class="title-row" style="margin:0"><h1>Manage</h1><a class="btn primary" href="#new">New campaign</a></div>'
    + '<p class="mono" style="margin-top:10px;font-size:.8125rem">' + pend.length + ' to review · ' + fmt(owed) + ' unpaid · ' + camps.length + (camps.length === 1 ? ' campaign' : ' campaigns') + '</p></div>';
  if (!camps.length) return out + empty('No campaigns yet', 'Start one and clips will land here for you to review.', '<a class="btn primary" href="#new">Post a campaign</a>');
  out += '<div class="seg" role="tablist">' + [['review', 'Review (' + pend.length + ')'], ['payouts', 'Payouts (' + unpaid + ')'], ['campaigns', 'Campaigns']].map(function (t) {
    return '<button type="button" role="tab" class="' + (manageTab === t[0] ? 'on' : '') + '" data-act="mtab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
  if (manageTab === 'review') {
    if (!pend.length) return out + empty('Nothing to review right now', 'New clips from your campaigns will show up here.', '');
    return out + '<div class="list">' + pend.map(function (s) {
      return '<article class="card clip" data-id="' + s.id + '"><div class="row"><b>' + esc(s.clipperName) + ' ' + tierBadge(s.clipperTier) + '</b><span class="muted" style="font-size:.8125rem">' + ago(s.createdAt) + '</span></div>'
        + '<div class="clip-meta"><a href="#c-' + s.campaignId + '">' + esc(s.campaignTitle) + '</a><span>' + esc(s.platform) + '</span></div>'
        + '<div class="row" style="justify-content:flex-start;gap:12px;flex-wrap:wrap"><a class="clip-link" href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer">Open clip ↗</a>' + previewBtn(s.url) + '</div><div class="pv" hidden></div>' + (s.note ? '<p class="muted">' + esc(s.note) + '</p>' : '') + socLine(s)
        + '<div class="act"><div class="grow"><label class="lbl" for="v-' + s.id + '">Views now</label><input id="v-' + s.id + '" name="views" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></div>'
        + '<button type="button" class="btn primary sm" data-act="approve" data-id="' + s.id + '">Approve</button></div>'
        + '<div class="reasons" role="group" aria-label="Quick reasons">' + REASONS.map(function (r) { return '<button type="button" class="chip" data-act="reasonchip" data-v="' + esc(r) + '">' + esc(r) + '</button>'; }).join('') + '</div>'
        + '<div class="act"><div class="grow"><label class="lbl" for="n-' + s.id + '">Reason for declining (the clipper will see this)</label><input id="n-' + s.id + '" name="reason" type="text" maxlength="140" placeholder="Pick one above or write your own"></div>'
        + '<button type="button" class="btn danger sm" data-act="reject" data-id="' + s.id + '">Decline</button></div></article>'; }).join('') + '</div>';
  }
  if (manageTab === 'payouts') {
    if (!appr.length) return out + empty('No approved clips yet', 'Once you approve a clip and add its views, you will see what you owe here.', '');
    return out + '<div class="list">' + appr.map(function (s) {
      return '<article class="card clip" data-id="' + s.id + '"><div class="row"><b>' + esc(s.clipperName) + '</b>' + (s.paid ? pill('paid', 'Paid') : pill('pending', 'Unpaid')) + '</div>'
        + '<div class="clip-meta"><a href="#c-' + s.campaignId + '">' + esc(s.campaignTitle) + '</a><a href="' + esc(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(s.platform) + ' ↗</a></div>'
        + (s.clipperPayoutInfo && s.clipperPayoutInfo.type ? '<div class="payout"><b>Pay to</b>' + payList(s.clipperPayoutInfo) + '</div>' : '<div class="payout">' + (s.clipperPayout ? '<b>Pay to:</b> ' + esc(s.clipperPayout) : 'No payout method yet. Ask this clipper to add one in Settings.') + '</div>') + socLine(s)
        + '<div class="act"><div class="grow"><label class="lbl" for="v-' + s.id + '">Views</label><input id="v-' + s.id + '" name="views" type="number" inputmode="numeric" min="0" step="1" value="' + s.views + '"></div>'
        + '<button type="button" class="btn sm" data-act="views" data-id="' + s.id + '">Save views</button></div>'
        + '<div class="row"><span class="num">' + fmt(s.earned) + '</span><button type="button" class="btn sm' + (s.paid ? '' : ' primary') + '" data-act="' + (s.paid ? 'unpay' : 'pay') + '" data-id="' + s.id + '">' + (s.paid ? 'Undo paid' : 'Mark paid') + '</button></div></article>'; }).join('') + '</div>';
  }
  return out + '<div class="list">' + camps.map(function (c) {
    var st = c.status === 'closed' ? ['closed', 'Closed'] : (c.open ? ['open', 'Open'] : ['closed', 'Budget reached']);
    return '<article class="card clip"><div class="row"><a class="clip-link" href="#c-' + c.id + '">' + esc(c.title) + '</a>' + pill(st[0], st[1]) + '</div>'
      + '<div class="clip-meta"><span class="mono">' + fmt(c.claimed) + ' of ' + fmt(c.budget) + ' claimed</span><span>' + c.clips + (c.clips === 1 ? ' clip' : ' clips') + '</span><span>' + fmt(c.ratePer1k) + ' per 1K</span></div>'
      + '<div><button type="button" class="btn sm" data-act="' + (c.status === 'closed' ? 'reopen' : 'close') + '" data-id="' + c.id + '">' + (c.status === 'closed' ? 'Reopen' : 'Close campaign') + '</button></div></article>'; }).join('') + '</div>';
}

/* ---------- auth, settings, legal ---------- */
var settingsTab = 'profile';
var COINS = ['USDT', 'USDC'], NETS = ['TRC20', 'BEP20', 'ERC20', 'Solana', 'Polygon', 'Other'];
var SOC_PLATFORMS = ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'X'];

function pwField(id, label, auto, extra) {
  return '<div><label for="' + id + '">' + label + '</label><div class="pw"><input id="' + id + '" type="password" autocomplete="' + auto + '">'
    + '<button type="button" class="pw-t" data-act="pwt" aria-label="Show password">Show</button></div>' + (extra || '') + '</div>';
}
function pwScore(p) {
  var s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return p.length ? Math.max(1, s) : 0;
}
var loginOpts = { google: false, x: false };
var AUTH_ERRORS = { cancelled: 'Sign-in was cancelled. You can try again whenever you like.', failed: 'We could not finish signing you in. Please try again.', unavailable: 'That sign-in option is not available right now.' };
function oauthBlock() {
  if (!loginOpts.google && !loginOpts.x) return '';
  return '<div class="oauth">'
    + (loginOpts.google ? '<a class="obtn" href="/api/auth/google"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Continue with Google</a>' : '')
    + (loginOpts.x ? '<a class="obtn" href="/api/auth/x"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>Continue with X</a>' : '')
    + '<p class="hint" style="text-align:center;margin:2px 0 0">By continuing you agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p></div><div class="or"><span>or use your email</span></div>';
}
function vLogin() {
  if (me) { location.hash = 'dashboard'; return ''; }
  return '<div class="auth-wrap"><div class="auth-side"><h1>Welcome back to the cutroom.</h1>'
    + '<p class="muted">Log in to track your clips, review submissions and see what you are owed.</p>'
    + '<ul class="ticks"><li>See every clip and its status in one place</li><li>Approve clips and track payouts as a brand</li><li>Your payout details stay private</li></ul></div>'
    + '<form id="loginForm" class="card form auth-card" novalidate><h2 class="card-h">Log in</h2>'
    + oauthBlock()
    + '<div><label for="lEmail">Email</label><input id="lEmail" type="email" autocomplete="email" inputmode="email"></div>'
    + pwField('lPass', 'Password', 'current-password')
    + '<div class="forgot"><button type="button" class="linkbtn" data-act="forgot">Forgot password?</button></div>'
    + '<p class="banner" id="forgotMsg" hidden>Password reset by email is not available yet. Contact the Cutroom admin and they can reset it for you.</p>'
    + '<p class="err" id="lErr" hidden></p><button class="btn primary lg" type="submit">Log in</button>'
    + '<p class="switch">New here? <a href="#signup"><b>Create an account</b></a></p></form></div>';
}
function vSignup() {
  if (me) { location.hash = 'dashboard'; return ''; }
  return '<div class="auth-wrap"><div class="auth-side"><h1>Create your Cutroom account.</h1>'
    + '<p class="muted">Free to join. Clip for pay, or post campaigns of your own. One account does both.</p>'
    + '<ul class="ticks"><li>Earn per 1K approved views</li><li>Post a campaign with your own rate and budget</li><li>Add your wallet once, share it only after approval</li></ul></div>'
    + '<form id="signupForm" class="card form auth-card" novalidate><h2 class="card-h">Sign up</h2>'
    + oauthBlock()
    + '<fieldset class="intent"><legend>What brings you here?</legend>'
    + '<label class="opt" for="iClip"><input id="iClip" type="radio" name="intent" value="clipper" checked><span><b>I want to clip and earn</b><small>Browse campaigns and submit clips</small></span></label>'
    + '<label class="opt" for="iBrand"><input id="iBrand" type="radio" name="intent" value="brand"><span><b>I want to post a campaign</b><small>Brand or creator looking for clippers</small></span></label></fieldset>'
    + '<div><label for="sName">Name</label><input id="sName" type="text" autocomplete="name" maxlength="60"></div>'
    + '<div><label for="sEmail">Email</label><input id="sEmail" type="email" autocomplete="email" inputmode="email"></div>'
    + pwField('sPass', 'Password', 'new-password', '<div class="meter" aria-hidden="true"><i id="sMeter" data-s="0"></i></div><p class="hint" id="sMeterTxt">At least 8 characters.</p>')
    + '<label class="check" for="sTerms"><input id="sTerms" type="checkbox"><span>I agree to the <a href="#terms" target="_blank" rel="noopener">Terms</a> and <a href="#privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>'
    + '<p class="err" id="sErr" hidden></p><button class="btn primary lg" type="submit">Create account</button>'
    + '<p class="switch">Already have an account? <a href="#login"><b>Log in</b></a></p></form></div>';
}

function payRows(p) {
  var f = p.fields || {};
  if (p.type === 'crypto') return [['Coin', f.asset], ['Network', f.network], ['Address', f.address]];
  if (p.type === 'other') return [['Details', f.details]]; // old saved entries only
  return [];
}
function payList(p) {
  return '<dl class="pay">' + payRows(p).map(function (r) {
    return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd><button type="button" class="copy" data-act="copy" data-v="' + esc(r[1]) + '">Copy</button></div>'; }).join('') + '</dl>';
}
function payFields(type, f) {
  f = f || {};
  var sel = function (id, label, opts, v) { return '<div><label for="' + id + '">' + label + '</label><select id="' + id + '">' + opts.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></div>'; };
  return '<div class="two">' + sel('pCoin', 'Coin', COINS, f.asset) + sel('pNet', 'Network', NETS, f.network) + '</div>'
    + '<div><label for="pAddr">Wallet address</label><input id="pAddr" type="text" value="' + esc(f.address || '') + '" placeholder="Paste your wallet address" autocomplete="off" autocapitalize="off" spellcheck="false"></div>'
    + '<p class="hint">Double-check the network and address. Crypto sent to the wrong network cannot be recovered.</p>';
}
function socRow(a) {
  a = a || {};
  return '<div class="srow"><select aria-label="Platform">' + SOC_PLATFORMS.map(function (p) { return '<option' + (p === a.platform ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select>'
    + '<input type="text" aria-label="Handle" maxlength="41" placeholder="username (no @)" value="' + esc(a.handle || '') + '" autocomplete="off" autocapitalize="off">'
    + '<button type="button" class="btn sm" data-act="delsoc" aria-label="Remove account">Remove</button></div>';
}
function vSettings() {
  if (!me) return needAuth('Settings');
  var tabs = [['profile', 'Profile'], ['payout', 'Wallet'], ['accounts', 'Accounts'], ['security', 'Security']];
  var out = head('Settings', 'Make Cutroom yours: your details, how you get paid, and where you post.')
    + '<div class="seg" role="tablist" aria-label="Settings sections">' + tabs.map(function (t) {
      return '<button type="button" role="tab" aria-selected="' + (settingsTab === t[0]) + '" class="' + (settingsTab === t[0] ? 'on' : '') + '" data-act="stab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
  var p = me.payout || { type: '', fields: {} };
  if (settingsTab === 'profile') {
    out += '<form id="profileForm" class="card form narrow" novalidate><h2 class="card-h">Profile</h2>'
      + '<div><label for="pName">Display name</label><input id="pName" type="text" maxlength="60" value="' + esc(me.name) + '" autocomplete="name"></div>'
      + '<div><label>Email</label><p class="readonly">' + esc(me.email || 'Not shared by your sign-in') + '</p></div>'
      + '<label class="check" for="pLb"><input id="pLb" type="checkbox"' + (me.showOnLeaderboard !== false ? ' checked' : '') + '><span>Show my name and earnings on the leaderboard</span></label>'
      + '<div><label>Role</label><p class="readonly">' + (me.role === 'admin' ? 'Admin' : 'Member (clip and post campaigns)') + '</p></div>'
      + '<p class="err" id="pErr" hidden></p><button class="btn primary" type="submit">Save profile</button></form>';
  } else if (settingsTab === 'payout') {
    out += '<div class="settings-wrap">';
    var isCrypto = p.type === 'crypto', f0 = isCrypto ? p.fields : {};
    if (isCrypto) out += '<div class="card"><h2 class="card-h">Your wallet</h2><p class="hint" style="margin-bottom:10px">Brands see this only after approving one of your clips.</p>' + payList(p) + '</div>';
    out += '<form id="payoutForm" class="card form" novalidate><h2 class="card-h">' + (isCrypto ? 'Change wallet' : 'Add your crypto wallet') + '</h2>'
      + '<p class="hint">You get paid in crypto. Cutroom does not move money: brands send it straight to this address.</p>'
      + payFields('crypto', f0)
      + '<p class="err" id="payErr" hidden></p><div class="act"><button class="btn primary" type="submit">Save wallet</button>'
      + (p.type ? '<button type="button" class="btn danger" data-act="delpay">Remove</button>' : '') + '</div></form></div>';
  } else if (settingsTab === 'accounts') {
    var socials = me.socials && me.socials.length ? me.socials : [];
    out += '<form id="socialsForm" class="card form narrow" novalidate><h2 class="card-h">Connected accounts</h2>'
      + '<p class="hint">Add the accounts you post clips from. Brands see these with your submissions so they can check where clips came from. Cutroom does not log in to these accounts.</p>'
      + '<div class="srows" id="socRows">' + socials.map(socRow).join('') + '</div>'
      + '<button type="button" class="btn sm" data-act="addsoc">+ Add account</button>'
      + '<p class="err" id="socErr" hidden></p><button class="btn primary" type="submit">Save accounts</button></form>';
  } else {
    out += '<div class="settings-wrap">' + (me.hasPassword === false ? '<div class="card"><h2 class="card-h">Password</h2><p class="hint">You sign in with Google or X, so there is no password to manage here.</p></div>' : '<form id="passwordForm" class="card form" novalidate><h2 class="card-h">Change password</h2>'
      + pwField('wCur', 'Current password', 'current-password')
      + pwField('wNew', 'New password', 'new-password', '<p class="hint">At least 8 characters.</p>')
      + pwField('wNew2', 'Confirm new password', 'new-password')
      + '<p class="err" id="wErr" hidden></p><button class="btn primary" type="submit">Update password</button>'
      + '<p class="hint">Changing your password signs you out on other devices.</p></form>')
      + '<div class="card"><div class="row"><div><b>Log out</b><p class="hint">End your session on this device.</p></div><button type="button" class="btn" data-act="logout">Log out</button></div></div></div>';
  }
  return out;
}

var LEGAL_DATE = 'November 2026';
function vTerms() {
  return '<div class="legal"><p class="stamp">Last updated ' + LEGAL_DATE + '</p><h1>Terms of Service</h1>'
    + '<p>These terms cover your use of Cutroom, a marketplace where brands post clipping campaigns and clippers submit clips to earn per approved views. By creating an account you agree to them.</p>'
    + '<h2>1. What Cutroom is</h2><p>Cutroom connects brands and clippers and keeps a record of campaigns, clips, approved views and amounts owed. Cutroom does not hold, move or guarantee money. Payments are made directly from brands to clippers.</p>'
    + '<h2>2. Accounts</h2><ul><li>You must give accurate information and keep your password secret.</li><li>You are responsible for activity on your account.</li><li>You must be old enough to form a binding contract where you live.</li></ul>'
    + '<h2>3. Campaigns and owners</h2><ul><li>Brands set the rate, budget and rules, and must only post content they have the right to have clipped.</li><li>Brands review clips and enter approved view counts honestly.</li><li>Brands are responsible for paying clippers what the campaign states for approved clips, and for marking payments accurately.</li></ul>'
    + '<h2>4. Clips and clippers</h2><ul><li>Only submit clips you made and that follow the campaign rules and the rules of the platform you post on.</li><li>Do not submit the same clip twice, buy fake views or otherwise manipulate view counts.</li><li>A brand may reject a clip that breaks the rules. Earnings apply only to approved clips.</li></ul>'
    + '<h2>5. Content and conduct</h2><p>Do not use Cutroom for anything unlawful, misleading or abusive, or to infringe anyone&rsquo;s rights. We may remove content or suspend accounts that break these terms.</p>'
    + '<h2>6. Disputes between users</h2><p>Disagreements about approvals, view counts or payment are between the brand and the clipper. Cutroom may help by sharing its records but is not responsible for resolving or paying them.</p>'
    + '<h2>7. No warranty and liability</h2><p>Cutroom is provided &ldquo;as is&rdquo;. To the extent the law allows, we are not liable for lost earnings, unpaid amounts or other losses arising from use of the service.</p>'
    + '<h2>8. Changes</h2><p>We may update these terms. Continued use after an update means you accept it.</p></div>';
}
function vPrivacy() {
  return '<div class="legal"><p class="stamp">Last updated ' + LEGAL_DATE + '</p><h1>Privacy Policy</h1>'
    + '<p>This explains what Cutroom collects and how it is used.</p>'
    + '<h2>What we collect</h2><ul><li>Account details: name, email and a hashed password (we never store your password in plain text).</li><li>Optional details you add: payout method and connected social accounts.</li><li>Activity: campaigns you post, clips you submit, views and payment status.</li></ul>'
    + '<h2>How it is used</h2><ul><li>To run the service: show campaigns, review clips and track what is owed.</li><li>Your payout details are shown only to the brand behind a campaign after they approve one of your clips there.</li><li>Your connected accounts are shown to brands alongside your submissions.</li></ul>'
    + '<h2>What we do not do</h2><ul><li>We do not sell your personal information.</li><li>We do not hold your money or ask for card details.</li></ul>'
    + '<h2>Cookies</h2><p>Cutroom uses one essential cookie to keep you logged in. It is not used for advertising.</p>'
    + '<h2>Messages you send us</h2><p>If you use the contact form, we store your name, email and message so we can reply.</p><h2>Your choices</h2><p>You can edit or remove your payout method and connected accounts at any time in Settings. To delete your account, contact the Cutroom admin.</p>'
    + '<h2>Security</h2><p>Passwords are hashed, sessions are protected, and sign-in attempts are rate limited. No system is perfectly secure, so use a strong, unique password.</p>'
    + '<h2>Changes</h2><p>We may update this policy and will change the date above when we do.</p></div>';
}

/* ---------- dashboard, wallet, analytics ---------- */
var anaTab = 'clipper';
function moneyCards(c) {
  return '<div class="kpis k4"><a class="kpi hero" href="#wallet"><label>Balance</label><b>' + fmt(c.pending) + '</b><small>Approved and waiting for the brand to pay you</small></a>'
    + '<a class="kpi" href="#clips"><label>Pending</label><b>' + c.inReview + '</b><small>' + (c.inReview === 1 ? 'clip' : 'clips') + ' in review. Earnings appear once approved.</small></a>'
    + '<a class="kpi" href="#wallet"><label>Lifetime earnings</label><b>' + fmt(c.lifetime) + '</b><small>Everything your approved clips have earned</small></a>'
    + '<a class="kpi" href="#wallet"><label>Paid to you</label><b>' + fmt(c.paid) + '</b><small>Already sent by brands</small></a></div>';
}
async function vDashboard() {
  if (!me) return needAuth('Home');
  var res = await Promise.all([getStats(true), api('/campaigns')]);
  var clip = res[0].clipper, camps = res[1].campaigns;
  var hr = new Date().getHours(), greet = hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  var out = '<div class="welcome"><h1>' + greet + ', ' + esc(me.name.split(' ')[0]) + '</h1><p>Here is how things are looking today.</p></div>' + moneyCards(clip);
  out += rankCard(clip.xp);
  var review = 0; camps.forEach(function (c) { if (me.role === 'admin' || c.ownerId === me.id) review += c.pending; });
  if (review) out += '<a class="panel sec-gap" href="#manage" style="display:flex;align-items:center;justify-content:space-between;gap:12px;text-decoration:none"><div><b>' + review + (review === 1 ? ' clip is' : ' clips are') + ' waiting for you</b><p class="note">Take a look and approve the good ones so clippers can get paid.</p></div><span class="btn sm primary">Review</span></a>';
  var steps = [
    ['Add your crypto wallet', 'So brands know where to send your money', !!(me.payout && me.payout.type), '#settings', 'payout'],
    ['Connect the accounts you post from', 'TikTok, Instagram, YouTube or X', !!(me.socials && me.socials.length), '#settings', 'accounts'],
    ['Send in your first clip', 'Pick a campaign you like and share the link', clip.total > 0, '#campaigns', ''],
    ['Get a clip approved', 'This is where the earning starts', clip.approved > 0, '#clips', '']
  ];
  var done = steps.filter(function (s) { return s[2]; }).length;
  out += '<div class="cols2 sec-gap">';
  out += '<section class="panel"><div class="panel-h"><h2>' + (done === steps.length ? 'You are all set up' : 'Getting started') + '</h2><span class="note">' + done + ' of ' + steps.length + ' done</span></div><div class="prog" role="img" aria-label="' + done + ' of ' + steps.length + ' steps done"><i style="width:' + (done / steps.length * 100) + '%"></i></div><div class="todo">'
    + steps.map(function (s) {
      return '<a class="' + (s[2] ? 'done' : '') + '" href="' + s[3] + '"' + (s[4] ? ' data-tab="' + s[4] + '"' : '') + '><span class="tick">' + ico('check') + '</span><div><b>' + s[0] + '</b><small>' + s[1] + '</small></div></a>'; }).join('') + '</div></section>';
  out += '<section class="panel"><div class="panel-h"><h2>Earnings, last 14 days</h2><a href="#analytics">More stats</a></div>' + barChart(clip.days, 'earned', true, 'Earnings per day for the last 14 days', 'Nothing here yet. Your first approved clip will show up on this chart.') + '</section></div>';
  var open = camps.filter(function (c) { return c.open; }).sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 3);
  out += '<div class="panel-h sec-gap"><h2 class="sec" style="margin:0">Campaigns you can jump into</h2><a class="btn sm" href="#campaigns">See all</a></div>';
  out += open.length ? '<div class="grid">' + open.map(campCard).join('') + '</div>' : empty('No open campaigns just yet', 'Check back soon, or start one yourself.', '<a class="btn primary" href="#new">Post a campaign</a>');
  return out;
}

async function vWallet() {
  if (!me) return needAuth('Wallet');
  var st = await getStats(true), c = st.clipper, led = st.ledger;
  var out = head('Wallet', 'Your earnings, what is waiting to be paid, and what has already landed.') + moneyCards(c);
  var p = me.payout || { type: '', fields: {} };
  out += '<div class="cols2 sec-gap"><section class="panel"><div class="panel-h"><h2>Recent activity</h2></div>';
  if (!led.length) out += '<p class="note">No earnings yet. When a brand approves one of your clips, it will show up here.</p>';
  else out += '<div class="ledger">' + led.slice(0, 12).map(function (r) {
    return '<div class="lrow"><div><b><a href="#c-' + r.campaignId + '" style="text-decoration:none">' + esc(r.title) + '</a></b><small>' + esc(r.platform) + ' · ' + kviews(r.views) + ' views · ' + ago(r.at) + '</small></div>'
      + '<div class="amt">' + fmt(r.earned) + '<small style="color:var(--' + (r.paid ? 'good' : 'warn') + ')">' + (r.paid ? 'Paid' : 'Waiting for payment') + '</small></div></div>'; }).join('') + '</div>';
  out += '</section><div class="stack"><section class="panel"><div class="panel-h"><h2>Where you get paid</h2><a href="#settings" data-tab="payout">' + (p.type ? 'Change' : 'Add') + '</a></div>'
    + (p.type ? payList(p) : '<p class="note">You have not added a crypto wallet yet. Add one so brands know where to send your money.</p><a class="btn primary sm" style="margin-top:12px" href="#settings" data-tab="payout">Add wallet</a>')
    + '</section><section class="panel"><div class="panel-h"><h2>How payment works</h2></div><p class="note">Cutroom keeps the record of what you have earned. Brands send the money to you directly, then mark each clip as paid, and you will get a notification when they do.</p></section></div></div>';
  return out;
}

async function vAnalytics() {
  if (!me) return needAuth('Analytics');
  var st = await getStats(true), c = st.clipper, o = st.owner;
  if (!o) anaTab = 'clipper';
  var out = head('Analytics', 'A closer look at how your clips and campaigns are doing.');
  if (o) out += '<div class="seg" role="tablist">' + [['clipper', 'As a clipper'], ['owner', 'As a brand']].map(function (t) {
    return '<button type="button" role="tab" aria-selected="' + (anaTab === t[0]) + '" class="' + (anaTab === t[0] ? 'on' : '') + '" data-act="atab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
  if (anaTab === 'owner' && o) {
    out += '<div class="kpis k4"><div class="kpi"><label>Live campaigns</label><b>' + o.live + '</b><small>of ' + o.campaigns + ' in total</small></div>'
      + '<div class="kpi"><label>Budget used</label><b>' + fmt(o.committed) + '</b><small>of ' + fmt(o.budget) + ' across your campaigns</small></div>'
      + '<div class="kpi"><label>Owed to clippers</label><b>' + fmt(o.owed) + '</b><small>' + fmt(o.paid) + ' already paid</small></div>'
      + '<div class="kpi"><label>Views delivered</label><b>' + kviews(o.views) + '</b><small>From ' + o.approved + ' approved ' + (o.approved === 1 ? 'clip' : 'clips') + '</small></div></div>';
    out += '<section class="panel sec-gap"><div class="panel-h"><h2>Clips received, last 14 days</h2></div>' + barChart(o.days, 'clips', false, 'Clips received per day for the last 14 days', 'No clips have come in recently.') + '</section>';
    out += '<div class="cols2 sec-gap"><section class="panel"><div class="panel-h"><h2>Campaign budgets</h2></div>' + hbars(o.top.map(function (t) { return { name: t.title, v: t.claimed, claimed: t.claimed, budget: t.budget }; }), function (r) { return fmt(r.claimed) + ' of ' + fmt(r.budget); }) + '</section>'
      + '<section class="panel"><div class="panel-h"><h2>Clip status</h2></div>' + hbars([{ name: 'In review', v: o.inReview }, { name: 'Approved', v: o.approved }, { name: 'Declined', v: o.rejected }], function (r) { return String(r.v); }) + '</section></div>';
    return out;
  }
  out += '<div class="kpis k4"><div class="kpi"><label>Lifetime earnings</label><b>' + fmt(c.lifetime) + '</b><small>' + fmt(c.pending) + ' still waiting to be paid</small></div>'
    + '<div class="kpi"><label>Approved views</label><b>' + kviews(c.views) + '</b><small>Across all your approved clips</small></div>'
    + '<div class="kpi"><label>Approval rate</label><b>' + (c.approvalRate == null ? '-' : c.approvalRate + '%') + '</b><small>' + (c.approvalRate == null ? 'Shows up after your first review' : 'Of the clips that have been reviewed') + '</small></div>'
    + '<div class="kpi"><label>Clips sent</label><b>' + c.total + '</b><small>' + c.inReview + ' in review right now</small></div></div>';
  out += '<div class="cols2 sec-gap"><section class="panel"><div class="panel-h"><h2>Earnings, last 14 days</h2></div>' + barChart(c.days, 'earned', true, 'Earnings per day for the last 14 days', 'No earnings in this period yet.') + '</section>'
    + '<section class="panel"><div class="panel-h"><h2>Clips sent, last 14 days</h2></div>' + barChart(c.days, 'clips', false, 'Clips sent per day for the last 14 days', 'You have not sent any clips in this period.') + '</section></div>';
  out += '<div class="cols2 sec-gap"><section class="panel"><div class="panel-h"><h2>By platform</h2></div>' + hbars(c.platforms.map(function (p) { return { name: p.name, v: p.clips, clips: p.clips, earned: p.earned }; }), function (r) { return r.clips + (r.clips === 1 ? ' clip' : ' clips') + ' · ' + fmt(r.earned); }) + '</section>'
    + '<section class="panel"><div class="panel-h"><h2>Top campaigns</h2></div>' + hbars(c.topCampaigns.map(function (t) { return { name: t.title, v: t.earned, earned: t.earned, views: t.views }; }), function (r) { return fmt(r.earned) + ' · ' + kviews(r.views) + ' views'; }) + '</section></div>';
  if (!c.total) out += '<div class="banner sec-gap">No clips yet, so these charts are quiet for now. <a href="#campaigns"><b>Find a campaign</b></a> and send your first clip.</div>';
  return out;
}

/* ---------- rank, contact, support inbox ---------- */
function tierBadge(t) { return t ? '<span class="tier t-' + esc(String(t).toLowerCase()) + '">' + esc(t) + '</span>' : ''; }
function emblem(level, tier, size) {
  return '<span class="emb t-' + esc(tier.toLowerCase()) + '" style="width:' + size + 'px;height:' + Math.round(size * 1.08) + 'px"><svg viewBox="0 0 48 52" aria-hidden="true"><path d="M24 2l19 7v15c0 12-8 21-19 26C13 45 5 36 5 24V9z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><text x="24" y="33" text-anchor="middle">' + level + '</text></svg></span>';
}
function rankCard(x) {
  return '<a class="panel sec-gap rankcard t-' + x.tier.toLowerCase() + '" href="#rank">' + emblem(x.level, x.tier, 54)
    + '<div class="rk-body"><div class="rk-top"><b>' + x.tier + '</b><span>' + x.xp + ' XP</span></div><div class="prog" role="img" aria-label="' + x.pct + ' percent to the next rank"><i style="width:' + x.pct + '%"></i></div>'
    + '<small>' + (x.next ? x.toNext + ' XP to ' + x.next : 'You are at the top rank. Legend.') + '</small></div></a>';
}
async function vRank() {
  if (!me) return needAuth('My rank');
  var x = (await getStats(true)).clipper.xp;
  var out = head('My rank', 'Every approved clip earns you XP. Collect enough and you move up.')
    + '<section class="panel rank-hero t-' + x.tier.toLowerCase() + '">' + emblem(x.level, x.tier, 84)
    + '<div class="rk-body"><p class="rk-kicker">Your rank</p><h2>' + x.tier + '</h2><div class="rk-top"><span>' + x.xp + ' XP</span>' + (x.next ? '<span>' + x.nextAt + ' XP for ' + x.next + '</span>' : '') + '</div>'
    + '<div class="prog" role="img" aria-label="' + x.pct + ' percent to the next rank"><i style="width:' + x.pct + '%"></i></div>'
    + '<small>' + (x.next ? x.toNext + ' XP to go until ' + x.next + '.' : 'You have reached the top rank.') + '</small></div></section>';
  out += '<div class="cols2 sec-gap"><section class="panel"><div class="panel-h"><h2>The ranks</h2></div><div class="ladder">'
    + x.tiers.map(function (t, i) {
      var st = i + 1 < x.level ? 'done' : i + 1 === x.level ? 'now' : 'lock';
      return '<div class="lad ' + st + ' t-' + t.name.toLowerCase() + '">' + emblem(i + 1, t.name, 34) + '<div><b>' + t.name + '</b><small>' + (t.min ? t.min + ' XP' : 'Where everyone starts') + '</small></div>' + (st === 'now' ? '<span class="you">You</span>' : st === 'done' ? '<span class="ok">' + ico('check') + '</span>' : '') + '</div>'; }).join('') + '</div></section>'
    + '<section class="panel"><div class="panel-h"><h2>How to earn XP</h2></div><ul class="xp-list"><li><b>+' + x.perClip + ' XP</b> for every clip a brand approves</li><li><b>+' + x.per1k + ' XP</b> for every 1,000 approved views on your clips</li><li>Declined clips do not earn XP</li></ul>'
    + '<p class="note">Example: a clip that reaches 20K approved views earns ' + (x.perClip + 20 * x.per1k) + ' XP. Brands see your rank next to your name, and it shows on the leaderboard.</p><a class="btn primary" style="margin-top:12px" href="#campaigns">Find a campaign</a></section></div>';
  return out;
}

var ctSent = '';
async function vContact() {
  var res = await Promise.all([api('/config').catch(function () { return { support: {} }; }), me ? api('/support/mine').catch(function () { return { items: [] }; }) : Promise.resolve({ items: [] })]);
  var sp = res[0].support || {}, mine = res[1].items;
  var out = head('Help and contact', 'Stuck, waiting on a payment, or just have a question? Send us a message here and we will get back to you.');
  if (sp.email) out += '<p class="note" style="margin:-8px 0 14px">Prefer email? Write to <a href="mailto:' + esc(sp.email) + '"><b>' + esc(sp.email) + '</b></a>.</p>';
  if (me && mine.length) out += '<section class="panel sec-gap" style="margin-bottom:14px"><div class="panel-h"><h2>Your messages</h2></div><div class="stack">' + mine.map(function (m) {
    return '<div class="msg"><div class="row"><b>' + esc(m.topic) + '</b><span class="muted" style="font-size:.8125rem">' + ago(m.createdAt) + '</span></div><p>' + esc(m.message) + '</p>'
      + (m.reply ? '<div class="reply"><b>Reply from Cutroom</b><p>' + esc(m.reply) + '</p></div>' : '<p class="note">Waiting for a reply. We will notify you here when we answer.</p>') + '</div>'; }).join('') + '</div></section>';
  if (ctSent) return out + '<div class="card narrow sec-gap" style="padding:22px"><h2 class="card-h">Thanks, we got your message</h2><p class="muted">' + (me ? 'We will reply right here and send you a notification.' : 'We will reply to <b>' + esc(ctSent) + '</b> as soon as we can.') + ' If it is about a payment, have the clip link handy.</p><div class="act" style="margin-top:14px"><button type="button" class="btn" data-act="ctagain">Send another message</button></div></div>';
  var topics = ['Payments', 'My account', 'A campaign', 'A clip', 'Something else'];
  return out + '<form id="contactForm" class="card form narrow sec-gap" novalidate><h2 class="card-h">Send us a message</h2>'
    + '<div><label for="ctName">Your name</label><input id="ctName" type="text" maxlength="60" autocomplete="name" value="' + esc(me ? me.name : '') + '"></div>'
    + '<div><label for="ctEmail">Your email</label><input id="ctEmail" type="email" autocomplete="email" inputmode="email" value="' + esc(me ? me.email : '') + '"></div>'
    + '<div><label for="ctTopic">What is it about?</label><select id="ctTopic">' + topics.map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>'
    + '<div><label for="ctMsg">Message</label><textarea id="ctMsg" rows="5" maxlength="1000" placeholder="Tell us what happened. Include the campaign name or clip link if you can."></textarea></div>'
    + '<p class="err" id="ctErr" hidden></p><button class="btn primary" type="submit">Send message</button></form>';
}
async function vInbox() {
  if (!me) return needAuth('Support inbox');
  if (me.role !== 'admin') return empty('This page is for the Cutroom admin', 'If you need help, use the contact page.', '<a class="btn primary" href="#contact">Help and contact</a>');
  var items = (await api('/support')).items, open = items.filter(function (m) { return m.status === 'open'; }).length;
  var out = head('Support inbox', open ? open + ' open ' + (open === 1 ? 'message' : 'messages') + '. Replies stay in the site and the person is notified.' : 'All caught up. Nothing waiting.');
  if (!items.length) return out + empty('No messages yet', 'When someone uses the contact form, it will show up here.', '');
  return out + '<div class="list">' + items.map(function (m) {
    return '<article class="card clip" data-id="' + m.id + '"><div class="row"><b>' + esc(m.name) + '</b>' + pill(m.status === 'open' ? 'pending' : 'approved', m.status === 'open' ? 'Open' : 'Replied') + '</div>'
      + '<div class="clip-meta"><span>' + esc(m.topic) + '</span><span>' + ago(m.createdAt) + '</span><a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a></div>'
      + '<p style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(m.message) + '</p>'
      + (m.reply ? '<div class="reply"><b>Your reply</b><p>' + esc(m.reply) + '</p></div>' : '')
      + '<div class="act"><div class="grow"><label class="lbl" for="rp-' + m.id + '">' + (m.reply ? 'Send another reply' : 'Your reply') + '</label><textarea id="rp-' + m.id + '" name="reply" rows="2" maxlength="1000" placeholder="Write your answer here"></textarea></div>'
      + '<button type="button" class="btn primary sm" data-act="sendreply" data-id="' + m.id + '">Send reply</button></div>'
      + '<div class="act"><button type="button" class="btn sm" data-act="resolve" data-id="' + m.id + '" data-open="' + (m.status === 'open' ? '0' : '1') + '">' + (m.status === 'open' ? 'Mark as done' : 'Reopen') + '</button></div></article>'; }).join('') + '</div>';
}

/* ---------- leaderboard, guide ---------- */
var lbPeriod = 'week';
async function vLeaderboard() {
  if (!me) return needAuth('Leaderboard');
  var d = await api('/leaderboard?period=' + lbPeriod);
  var out = head('Leaderboard', 'The clippers earning the most on Cutroom. Climb it one approved clip at a time.')
    + '<div class="seg" role="tablist">' + [['week', 'This week'], ['all', 'All time']].map(function (t) {
      return '<button type="button" role="tab" aria-selected="' + (lbPeriod === t[0]) + '" class="' + (lbPeriod === t[0] ? 'on' : '') + '" data-act="lbtab" data-v="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
  if (d.hidden) out += '<div class="banner">You are hidden from the leaderboard. You can switch that back on in <a href="#settings" data-tab="profile"><b>Settings</b></a>.</div>';
  else if (!d.me) out += '<div class="banner">You are not on the board yet. Get a clip approved ' + (lbPeriod === 'week' ? 'this week ' : '') + 'and you will show up here.</div>';
  if (!d.top.length) return out + empty('No one is on the board yet', 'Get a clip approved and you could be the first name here.', '<a class="btn primary" href="#campaigns">Find a campaign</a>');
  var row = function (r) {
    return '<div class="lb-row' + (r.me ? ' me' : '') + (r.rank <= 3 ? ' top' + r.rank : '') + '"><span class="lb-rank">' + (r.rank <= 3 ? ico('trophy') : '') + '<b>' + r.rank + '</b></span><span class="avatar">' + esc(initials(r.name)) + '</span>'
      + '<div class="lb-who"><b>' + esc(r.name) + (r.me ? ' <em>you</em>' : '') + '</b><small>' + tierBadge(r.tier) + ' ' + r.clips + (r.clips === 1 ? ' clip' : ' clips') + ' · ' + kviews(r.views) + ' views</small></div><span class="lb-amt">' + fmt(r.earned) + '</span></div>'; };
  out += '<div class="lb">' + d.top.map(row).join('') + '</div>';
  if (d.me && d.me.rank > d.top.length) out += '<p class="note sec-gap">Your position</p><div class="lb">' + row(d.me) + '</div>';
  return out + '<p class="note sec-gap">' + d.total + (d.total === 1 ? ' clipper has' : ' clippers have') + ' earned ' + (lbPeriod === 'week' ? 'this week' : 'so far') + '. You can hide yourself in Settings any time.</p>';
}
function vGuide() {
  var sec = function (n, t, body) { return '<section class="gstep"><span class="gnum">' + n + '</span><div><h2>' + t + '</h2>' + body + '</div></section>'; };
  var ul = function (a) { return '<ul>' + a.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; };
  return '<div class="legal guide"><p class="stamp">Clipper guide</p><h1>How to get your clips approved</h1>'
    + '<p>Brands approve clips that look good, follow the brief and bring real views. Here is how to make that happen more often.</p>'
    + sec(1, 'Pick the right campaign', ul(['Check the rate per 1K views and how much budget is left. A big rate means little if the budget is almost gone.', 'Read the brief and rules first. It tells you exactly what the brand wants.', 'Make sure you can post on one of the accepted platforms.']))
    + sec(2, 'Cut a clip people will watch', ul(['Open with a hook in the first two seconds: a bold line, a surprise or a question.', 'Keep it short, around 15 to 60 seconds, with one clear idea.', 'Go vertical (9:16), add captions, and make sure the audio is clean.']))
    + sec(3, 'Follow the brief', ul(['Credit the source the way the rules ask.', 'Use any required hashtags or captions.', 'Do not send the same clip twice, and do not copy another clipper.']))
    + sec(4, 'Post it publicly and keep it up', ul(['Post to your own account and keep the post public until it is approved and paid.', 'Do not delete it or switch it to private. Brands cannot review what they cannot open.']))
    + sec(5, 'Send in the link', ul(['Paste the link to your post (not to the source video) on the campaign page.', 'Connect your accounts in Settings so brands can see where your clips come from.', 'Add your crypto wallet in Settings so you can be paid as soon as you are approved.']))
    + sec(6, 'Why clips get declined', ul(['It breaks the rules or the brief.', 'It uses the wrong source video.', 'The quality is too low or it is too similar to another clip.', 'The post is private, deleted or the link does not open.', 'The views look fake. Buying views gets you removed.']) + '<p>If a clip is declined, the brand leaves a reason. Fix it and send a new clip.</p>')
    + sec(7, 'How you get paid', ul(['A brand approves your clip and enters its views.', 'You earn views divided by 1,000, times the campaign rate.', 'The brand sends the crypto to your wallet and marks the clip as paid. You get a notification.']))
    + '<div class="act" style="margin-top:26px"><a class="btn primary lg" href="#campaigns">Find a campaign</a>' + (me ? '' : '<a class="btn lg" href="#signup">Create free account</a>') + '</div></div>';
}

/* ---------- landing page ---------- */
var lpAud = 'clipper', lpMode = 'clipper';
async function vHome() {
  var live = [];
  try { live = (await api('/campaigns')).campaigns.filter(function (c) { return c.open; }).sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 3); } catch (e) { live = []; }
  var steps = function (list) {
    return '<div class="lp-steps">' + list.map(function (s, i) {
      return '<div class="lp-step"><b>0' + (i + 1) + '</b><h3>' + s[0] + '</h3><p>' + s[1] + '</p></div>'; }).join('') + '</div>';
  };
  var points = function (list) {
    return '<div class="lp-points">' + list.map(function (p) { return '<div class="lp-point"><b>' + p[0] + '</b><span>' + p[1] + '</span></div>'; }).join('') + '</div>';
  };
  var out = '<div class="lp">'
    + '<section class="lp-hero"><div class="lp-wrap lp-hero-grid"><div>'
    + '<p class="lp-eyebrow">Clipping campaigns, paid per view</p>'
    + '<h1>Clips that get <em>paid by the view.</em></h1>'
    + '<p class="lp-lead">Cutroom is where brands and creators post clipping campaigns, and clippers earn for every 1K approved views. The rate, the budget and the numbers are in the open.</p>'
    + '<div class="lp-cta"><a class="btn primary lg" href="#signup">Start clipping</a><a class="btn lg" href="#signup" data-after="new">Launch a campaign</a></div>'
    + '<p class="lp-note">Free to join. Works with TikTok, Instagram Reels, YouTube Shorts and X.</p></div>'
    + '<div class="lp-demo" role="img" aria-label="Example campaign card"><div class="lp-demo-top"><span class="tag">Podcast</span><span class="lp-badge">Example campaign</span></div>'
    + '<h3>Podcast Episode 12 Highlights</h3>'
    + '<div class="rate"><b>$1.50</b><span>per 1K views</span></div>'
    + '<div class="track"><i style="width:6%"></i></div>'
    + '<div class="camp-meta"><span class="mono">$30 of $500 claimed</span><span>1 clip</span></div>'
    + '<div class="lp-demo-clip"><span>Clip approved · 20,000 views</span><b>$30.00</b></div>'
    + '<div class="plats"><span>TikTok</span><span>Instagram Reels</span><span>X</span></div></div>'
    + '</div></section>'
    + '<div class="lp-strip" aria-hidden="true"></div>'
    + '<section class="lp-platforms lp-wrap" aria-label="Supported platforms"><b>TikTok</b><b>Instagram Reels</b><b>YouTube Shorts</b><b>X</b></section>'
    + '<div class="lp-strip" aria-hidden="true"></div>'

    + '<section id="lp-how"><div class="lp-wrap"><div class="lp-head"><p class="lp-eyebrow">How it works</p><h2>One platform. Two ways in.</h2></div>'
    + '<div class="lp-tabs" role="tablist" aria-label="Choose your side"><button type="button" role="tab" data-aud="clipper" aria-selected="true">I am a clipper</button><button type="button" role="tab" data-aud="brand" aria-selected="false">I am a brand or creator</button></div>'
    + '<div class="lp-panel" data-panel="clipper">'
    + steps([['Pick a campaign', 'Compare the rate, the budget left and the rules before you start.'], ['Cut and post', 'Clip the source video, post it on an accepted platform, then submit the link.'], ['Get paid per 1K views', 'Once a clip is approved, you earn the campaign rate for every 1,000 views. The brand pays you directly.']])
    + points([['See the money first', 'Every campaign shows its rate and how much budget is still unclaimed.'], ['Track every clip', 'In review, approved or rejected, with views and earnings in one place.'], ['Private payout details', 'Brands only see them after approving one of your clips.']])
    + '</div>'
    + '<div class="lp-panel" data-panel="brand" hidden>'
    + steps([['Post a campaign', 'Add your source video, the rate per 1K views, a total budget, the platforms and your rules.'], ['Review the clips', 'Open each submitted clip, enter its views, then approve or reject it.'], ['Pay for approved views', 'Cutroom adds up what you owe each clipper. You pay them directly and mark it paid.']])
    + points([['A budget that stops', 'A campaign closes on its own once its budget is claimed.'], ['You approve every clip', 'Nothing counts toward the budget until you approve it.'], ['No duplicate clips', 'The same link cannot be submitted twice to one campaign.']])
    + '</div></div></section>'

    + '<div class="lp-calc-wrap"><section id="lp-calc"><div class="lp-wrap"><div class="lp-head"><p class="lp-eyebrow">Estimate</p><h2>Do the maths before you start.</h2></div>'
    + '<div class="lp-mini" role="group" aria-label="Calculator mode"><button type="button" data-calc="clipper" aria-pressed="true">Clipper earnings</button><button type="button" data-calc="brand" aria-pressed="false">Campaign reach</button></div>'
    + '<div class="lp-calc"><div class="lp-ctrl">'
    + '<div><label for="lpViews"><span id="lpViewsLabel">Approved views on your clips</span><output id="lpViewsOut" for="lpViews"></output></label><input id="lpViews" type="range"></div>'
    + '<div><label for="lpRate"><span>Pay per 1K views</span><output id="lpRateOut" for="lpRate"></output></label><input id="lpRate" type="range" min="0.5" max="5" step="0.25" value="1.5"></div></div>'
    + '<div class="lp-result" aria-live="polite"><small id="lpResultLabel"></small><strong id="lpResultVal"></strong><p id="lpResultNote"></p></div></div></div></section></div>'

    + '<section id="lp-live"><div class="lp-wrap"><div class="lp-live-head"><div><p class="lp-eyebrow">Open now</p><h2>Campaigns you can join today.</h2></div><a class="btn" href="#campaigns">Browse all campaigns</a></div>'
    + (live.length ? '<div class="grid">' + live.map(campCard).join('') + '</div>'
      : empty('No campaigns yet', 'Be the first to launch one. Add a source video, a rate and a budget, and clippers can start submitting.', '<a class="btn primary" href="#signup" data-after="new">Launch a campaign</a>'))
    + '</div></section>'

    + '<section id="lp-trust" style="border-top:1px solid var(--line)"><div class="lp-wrap"><div class="lp-head"><p class="lp-eyebrow">Built on clear rules</p><h2>Simple on purpose.</h2></div>'
    + '<div class="lp-trust">'
    + '<div><h3>Reviewed, not assumed</h3><p>The brand approves every clip before it counts.</p></div>'
    + '<div><h3>Budgets are capped</h3><p>When a campaign reaches its budget it stops accepting clips.</p></div>'
    + '<div><h3>Payouts stay direct</h3><p>Brands pay clippers directly. Cutroom keeps the record of who is owed what.</p></div>'
    + '<div><h3>Your details stay yours</h3><p>Clippers share payout details only with brands who approved their work.</p></div>'
    + '</div></div></section>'

    + '<section class="lp-final"><div class="lp-wrap"><h2>Ready to cut?</h2><p class="lp-sub">Join free and pick a campaign, or post your first one in a few minutes.</p>'
    + '<div class="lp-cta"><a class="btn primary lg" href="#signup">Create free account</a><a class="btn lg" href="#signup" data-after="new">Launch a campaign</a></div></div></section>'
    + '</div>';
  return out;
}
function lpCalc() {
  var v = document.getElementById('lpViews'); if (!v) return;
  var r = document.getElementById('lpRate'), brand = lpMode === 'brand';
  var rate = Number(r.value), x = Number(v.value);
  [v, r].forEach(function (el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); });
  document.getElementById('lpViewsOut').textContent = brand ? fmt(x) : kviews(x);
  document.getElementById('lpRateOut').textContent = fmt(rate);
  document.getElementById('lpResultLabel').textContent = brand ? 'Approved views this budget can buy' : 'You would earn';
  document.getElementById('lpResultVal').textContent = brand ? '~' + kviews(Math.round(x / rate * 1000)) : fmt(Math.round(x / 1000 * rate * 100) / 100);
  document.getElementById('lpResultNote').textContent = brand
    ? 'A campaign closes once its budget is claimed. Real reach depends on the clips that get approved.'
    : 'An estimate only. Real earnings depend on how many views your approved clips get.';
}
function lpSetMode(mode) {
  lpMode = mode;
  var v = document.getElementById('lpViews'); if (!v) return;
  var brand = mode === 'brand';
  v.min = brand ? 100 : 5000; v.max = brand ? 5000 : 500000; v.step = brand ? 50 : 5000; v.value = brand ? 500 : 50000;
  document.getElementById('lpViewsLabel').textContent = brand ? 'Campaign budget' : 'Approved views on your clips';
  [].forEach.call(document.querySelectorAll('[data-calc]'), function (b) { b.setAttribute('aria-pressed', b.dataset.calc === mode ? 'true' : 'false'); });
  lpCalc();
}
function lpSetAud(aud) {
  lpAud = aud;
  [].forEach.call(document.querySelectorAll('[data-aud]'), function (b) { b.setAttribute('aria-selected', b.dataset.aud === aud ? 'true' : 'false'); });
  [].forEach.call(document.querySelectorAll('[data-panel]'), function (p) { p.hidden = p.dataset.panel !== aud; });
}
document.addEventListener('click', function (e) {
  var s = e.target.closest('[data-scroll]');
  if (s) { var el = document.getElementById(s.dataset.scroll); if (el) { e.preventDefault(); el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } return; }
  var t = e.target.closest('[data-aud]'); if (t) return lpSetAud(t.dataset.aud);
  var m = e.target.closest('[data-calc]'); if (m) lpSetMode(m.dataset.calc);
});
document.addEventListener('input', function (e) { if (e.target.id === 'lpViews' || e.target.id === 'lpRate') lpCalc(); });

/* ---------- render ---------- */
var splashAt = Date.now();
function hideSplash() {
  var el = document.getElementById('splash'); if (!el || el.dataset.gone) return;
  el.dataset.gone = '1';
  setTimeout(function () { el.classList.add('done'); setTimeout(function () { el.remove(); }, 500); }, Math.max(0, 1500 - (Date.now() - splashAt)));
}
function skeleton() {
  var cards = ''; for (var i = 0; i < 6; i++) cards += '<div class="sk sk-card"></div>';
  return '<div aria-busy="true" aria-label="Loading"><div class="sk sk-title"></div><div class="sk sk-line"></div><div class="skgrid">' + cards + '</div></div>';
}
async function render(keepScroll) {
  var t = ++token, y = window.scrollY, html;
  route = parseRoute();
  var sk = null;
  if (!keepScroll && ['campaign', 'clips', 'manage', 'campaigns', 'home', 'dashboard', 'wallet', 'analytics', 'leaderboard', 'rank', 'inbox'].indexOf(route.name) > -1) sk = setTimeout(function () { if (t === token) { app.innerHTML = skeleton(); window.scrollTo(0, 0); } }, 160);
  try {
    switch (route.name) {
      case 'campaign': html = await vCampaign(route.id); break;
      case 'clips': html = await vClips(); break;
      case 'manage': html = await vManage(); break;
      case 'new': html = vNew(); break;
      case 'login': html = vLogin(); break;
      case 'signup': html = vSignup(); break;
      case 'dashboard': html = await vDashboard(); break;
      case 'wallet': html = await vWallet(); break;
      case 'leaderboard': html = await vLeaderboard(); break;
      case 'guide': html = vGuide(); break;
      case 'rank': html = await vRank(); break;
      case 'contact': html = await vContact(); break;
      case 'inbox': html = await vInbox(); break;
      case 'analytics': html = await vAnalytics(); break;
      case 'settings': html = vSettings(); break;
      case 'terms': html = vTerms(); break;
      case 'privacy': html = vPrivacy(); break;
      case 'home': html = await vHome(); break;
      default: html = await vCampaigns();
    }
  } catch (e) {
    if (e.status === 401) { me = null; html = needAuth('Welcome back'); }
    else if (e.status === 404) html = '<a class="back" href="#campaigns">← Campaigns</a>' + empty('We could not find that page', 'It may have moved or been removed.', '');
    else html = empty('We could not load this page', e.message || 'Something went wrong. Please try again.', '<button type="button" class="btn" data-act="retry">Try again</button>');
  }
  clearTimeout(sk);
  if (t !== token) return;
  app.innerHTML = html;
  window.scrollTo(0, keepScroll ? y : 0);
  setChrome();
  if (route.name === 'home') { lpSetAud(lpAud); lpSetMode(lpMode); }
  refreshBadge();
  var T = { rank: 'My rank', contact: 'Help and contact', inbox: 'Support inbox', leaderboard: 'Leaderboard', guide: 'Clipper guide', dashboard: 'Home', wallet: 'Wallet', analytics: 'Analytics', settings: 'Settings', terms: 'Terms of Service', privacy: 'Privacy Policy', login: 'Log in', signup: 'Sign up', clips: 'My clips', manage: 'Manage', campaigns: 'Campaigns', new: 'New campaign' };
  document.title = (T[route.name] ? T[route.name] + ' · ' : '') + 'Cutroom';
  hideSplash();
}
window.addEventListener('hashchange', function () { setNav(false); closeNotif(); render(false); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setNav(false); closeNotif(); } });

/* ---------- events ---------- */
document.addEventListener('click', async function (e) {
  if (e.target.closest('#burger')) return setNav(!document.body.classList.contains('nav-open'));
  var hb = e.target.closest('.site-head .brand');
  if (hb && window.matchMedia('(max-width:959px)').matches) { e.preventDefault(); return setNav(!document.body.classList.contains('nav-open')); }
  if (e.target.closest('#scrim') || e.target.closest('.side a.navl, .side a.sidecard, .side .guest-cta a')) setNav(false);
  if (notifOpen && !e.target.closest('#notif') && !e.target.closest('[data-act=bell]')) closeNotif();
  var a = e.target.closest('a[data-after]');
  if (a) afterLogin = a.dataset.after;
  var tl = e.target.closest('a[data-tab]');
  if (tl) { settingsTab = tl.dataset.tab; if (location.hash === '#settings') render(false); }
  var b = e.target.closest('[data-act]');
  if (!b) return;
  var act = b.dataset.act, id = b.dataset.id;
  if (act === 'stab') { settingsTab = b.dataset.v; return render(false); }
  if (act === 'preview') {
    var pv = b.closest('.clip').querySelector('.pv');
    if (!pv.hidden) { pv.hidden = true; pv.innerHTML = ''; b.textContent = 'Preview here'; return; }
    pv.className = 'pv' + (b.dataset.wide ? ' wide' : ''); pv.hidden = false;
    pv.innerHTML = '<iframe src="' + esc(b.dataset.src) + '" loading="lazy" title="Clip preview" allow="encrypted-media; fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin"></iframe><p class="note">If the preview does not load, use Open clip instead.</p>';
    b.textContent = 'Hide preview'; return;
  }
  if (act === 'reasonchip') { var ri = b.closest('.clip').querySelector('[name=reason]'); ri.value = b.dataset.v; ri.focus(); return; }
  if (act === 'clearq') { campQ = ''; var si = document.getElementById('cSearch'); if (si) si.value = ''; document.getElementById('campGrid').innerHTML = campGridHtml(); return; }
  if (act === 'sendreply') {
    var ta = b.closest('.clip').querySelector('[name=reply]'), txt = ta.value.trim();
    if (txt.length < 2) return toast('Please write a reply first.', true);
    b.disabled = true;
    try { await api('/support/' + id + '/reply', { method: 'POST', body: { reply: txt } }); toast('Reply sent. They have been notified.'); render(true); }
    catch (er) { toast(er.message, true); b.disabled = false; }
    return;
  }
  if (act === 'ctagain') { ctSent = ''; return render(true); }
  if (act === 'resolve') { b.disabled = true; try { await api('/support/' + id + '/resolve', { method: 'POST', body: { open: b.dataset.open === '1' } }); render(true); } catch (er) { toast(er.message, true); b.disabled = false; } return; }
  if (act === 'lbtab') { lbPeriod = b.dataset.v; return render(true); }
  if (act === 'atab') { anaTab = b.dataset.v; return render(true); }
  if (act === 'navclose') return setNav(false);
  if (act === 'bell') {
    if (notifOpen) return closeNotif();
    notifOpen = true; renderNotif(); document.getElementById('notif').hidden = false; b.setAttribute('aria-expanded', 'true');
    try { var nd = await api('/notifications'); notifs = nd.items; chrome.unread = nd.unread; renderNotif(); setChrome(); } catch (er) { /* keep cached */ }
    return;
  }
  if (act === 'nreadall') { try { await api('/notifications/read', { method: 'POST', body: {} }); notifs.forEach(function (n) { n.read = true; }); chrome.unread = 0; renderNotif(); setChrome(); } catch (er) { toast(er.message, true); } return; }
  if (act === 'nopen') {
    var link = b.dataset.link, nid = Number(id);
    closeNotif();
    var hit = notifs.filter(function (n) { return n.id === nid; })[0];
    if (hit && !hit.read) { hit.read = true; chrome.unread = Math.max(0, chrome.unread - 1); setChrome(); api('/notifications/read', { method: 'POST', body: { id: nid } }).catch(function () {}); }
    if (['manage', 'clips', 'wallet', 'campaigns', 'analytics', 'dashboard', 'rank', 'inbox', 'leaderboard', 'contact'].indexOf(link) > -1) location.hash = link;
    return;
  }
  if (act === 'pwt') { var pi = b.parentNode.querySelector('input'); var show = pi.type === 'password'; pi.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); return; }
  if (act === 'forgot') { document.getElementById('forgotMsg').hidden = false; return; }
  if (act === 'copy') { copyText(b.dataset.v); b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); return; }
  if (act === 'addsoc') { var rows = document.getElementById('socRows'); if (rows.children.length >= 8) return toast('You can add up to 8 accounts.', true); rows.insertAdjacentHTML('beforeend', socRow()); var li = rows.lastChild.querySelector('input'); if (li) li.focus(); return; }
  if (act === 'delsoc') { var row = b.closest('.srow'); if (row) row.remove(); return; }
  if (act === 'delpay') {
    if (!confirm('Remove your wallet address?')) return;
    b.disabled = true;
    try { var rr = await api('/me', { method: 'PATCH', body: { name: me.name, payout: { type: '' } } }); me = rr.user; toast('Your wallet has been removed.'); render(true); }
    catch (er) { toast(er.message, true); b.disabled = false; }
    return;
  }
  if (act === 'filter') { platformFilter = b.dataset.v; return render(true); }
  if (act === 'mtab') { manageTab = b.dataset.v; return render(true); }
  if (act === 'retry') return render(true);
  if (b.disabled) return;
  b.disabled = true;
  try {
    var card = b.closest('article[data-id]');
    var val = function (name) { var el = card && card.querySelector('[name=' + name + ']'); return el ? el.value : ''; };
    if (act === 'logout') { await api('/logout', { method: 'POST', body: {} }); me = null; setNav(false); closeNotif(); statsP = null; chrome = { pending: 0, bal: 0, unread: 0 }; toast('You are logged out. See you soon!'); location.hash = 'home'; return render(false); }
    if (act === 'approve') { await api('/submissions/' + id + '/approve', { method: 'POST', body: { views: Number(val('views')) || 0 } }); toast('Approved. Nice one!'); }
    else if (act === 'reject') { if (!val('reason').trim()) throw { message: 'Please add a short reason so the clipper knows what to fix.' }; await api('/submissions/' + id + '/reject', { method: 'POST', body: { reason: val('reason') } }); toast('Clip declined. The clipper will see your reason.'); }
    else if (act === 'views') { await api('/submissions/' + id + '/views', { method: 'POST', body: { views: Number(val('views')) || 0 } }); toast('Views saved.'); }
    else if (act === 'pay' || act === 'unpay') { await api('/submissions/' + id + '/paid', { method: 'POST', body: { paid: act === 'pay' } }); toast(act === 'pay' ? 'Marked as paid. The clipper will be notified.' : 'Payment undone.'); }
    else if (act === 'close' || act === 'reopen') { await api('/campaigns/' + id + '/status', { method: 'POST', body: { status: act === 'close' ? 'closed' : 'open' } }); toast(act === 'close' ? 'Campaign closed.' : 'Campaign reopened.'); }
    await render(true);
  } catch (err) { toast(err.message || 'Could not save.', true); }
  finally { b.disabled = false; }
});

document.addEventListener('error', function (e) { if (e.target && e.target.tagName === 'IMG') e.target.remove(); }, true);
function copyText(v) {
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(v).catch(function () {}); return; }
  var ta = document.createElement('textarea'); ta.value = v; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove();
}
document.addEventListener('change', function (e) {
  if (e.target.id === 'cSort') { campSort = e.target.value; var g = document.getElementById('campGrid'); if (g) g.innerHTML = campGridHtml(); }
});
document.addEventListener('input', function (e) {
  var t = e.target;
  if (t.id === 'cSearch') { campQ = t.value; var gg = document.getElementById('campGrid'); if (gg) gg.innerHTML = campGridHtml(); }
  if (t.id === 'sPass') { var sc = pwScore(t.value), m = document.getElementById('sMeter'); m.dataset.s = sc; document.getElementById('sMeterTxt').textContent = !t.value ? 'At least 8 characters.' : t.value.length < 8 ? 'Too short. Use at least 8 characters.' : ['', 'Weak', 'Okay', 'Good', 'Strong'][sc] + ' password'; }
  if (t.id === 'clipUrl') { var v = t.value.trim(), d = detect(v), h = document.getElementById('clipDet'); if (h) h.textContent = d ? 'Detected: ' + d : (v ? 'Hmm, we do not recognise that link yet' : ''); }
  if (t.id === 'cRate' || t.id === 'cBudget') {
    var r = Number(document.getElementById('cRate').value), bd = Number(document.getElementById('cBudget').value), h2 = document.getElementById('cHint');
    if (h2) h2.textContent = (r > 0 && bd > 0) ? 'The budget covers about ' + kviews(Math.round(bd / r * 1000)) + ' approved views.' : '';
  }
});

function showErr(id, m) { var el = document.getElementById(id); el.textContent = m; el.hidden = false; }
function busyBtn(f, on) { var b = f.querySelector('button[type=submit]'); if (b) { b.disabled = on; b.classList.toggle('is-busy', on); } }
var forms = {
  loginForm: async function (f) {
    var r = await api('/login', { method: 'POST', body: { email: val('lEmail'), password: document.getElementById('lPass').value } });
    me = r.user; toast('Welcome back, ' + me.name.split(' ')[0] + '!'); go();
  },
  signupForm: async function (f) {
    if (!document.getElementById('sTerms').checked) throw { message: 'Please tick the box to agree to the Terms and Privacy Policy.' };
    var r = await api('/signup', { method: 'POST', body: { name: val('sName'), email: val('sEmail'), password: document.getElementById('sPass').value } });
    me = r.user; toast('You are in. Welcome to Cutroom!');
    if (!afterLogin && document.getElementById('iBrand').checked) afterLogin = 'new';
    go();
  },
  clipForm: async function (f) {
    var url = val('clipUrl');
    if (!detect(url)) throw { message: 'Please paste a link from TikTok, Instagram, YouTube or X.' };
    await api('/campaigns/' + f.dataset.cid + '/submissions', { method: 'POST', body: { url: url, note: val('clipNote') } });
    toast('Clip sent. The brand will take a look soon.'); await render(true);
  },
  campForm: async function (f) {
    var plats = PLATFORMS.filter(function (p, i) { return document.getElementById('cP' + i).checked; });
    var r = await api('/campaigns', { method: 'POST', body: { title: val('cTitle'), sourceUrl: val('cSource'), niche: val('cNiche'), description: val('cBrief'), rules: val('cRules'), platforms: plats, ratePer1k: Number(val('cRate')), budget: Number(val('cBudget')) } });
    toast('Your campaign is live. Nice!'); location.hash = 'c-' + r.id;
  },
  profileForm: async function (f) {
    var r = await api('/me', { method: 'PATCH', body: { name: val('pName'), showOnLeaderboard: document.getElementById('pLb').checked } });
    me = r.user; toast('Your profile is updated.'); setChrome();
  },
  payoutForm: async function (f) {
    var fields = { asset: val('pCoin'), network: val('pNet'), address: val('pAddr') };
    if (!fields.address) throw { message: 'Please paste your wallet address.' };
    var r = await api('/me', { method: 'PATCH', body: { name: me.name, payout: { type: 'crypto', fields: fields } } });
    me = r.user; toast('All set. Your wallet is saved.'); render(true);
  },
  socialsForm: async function (f) {
    var list = [].map.call(document.querySelectorAll('#socRows .srow'), function (row) { return { platform: row.querySelector('select').value, handle: row.querySelector('input').value.trim() }; }).filter(function (x) { return x.handle; });
    var r = await api('/me', { method: 'PATCH', body: { name: me.name, socials: list } });
    me = r.user; toast('Your accounts are saved.'); render(true);
  },
  contactForm: async function (f) {
    var email = val('ctEmail');
    await api('/support', { method: 'POST', body: { name: val('ctName'), email: email, topic: document.getElementById('ctTopic').value, message: val('ctMsg') } });
    ctSent = email; render(true);
  },
  passwordForm: async function (f) {
    var cur = document.getElementById('wCur').value, nw = document.getElementById('wNew').value, n2 = document.getElementById('wNew2').value;
    if (nw.length < 8) throw { message: 'Please use a new password with at least 8 characters.' };
    if (nw !== n2) throw { message: 'Those two new passwords do not match.' };
    await api('/me/password', { method: 'POST', body: { current: cur, next: nw } });
    toast('Password updated. Other devices have been signed out.'); render(false);
  }
};
var errIds = { loginForm: 'lErr', signupForm: 'sErr', clipForm: 'clipErr', campForm: 'cErr', profileForm: 'pErr', payoutForm: 'payErr', socialsForm: 'socErr', passwordForm: 'wErr', contactForm: 'ctErr' };
function val(id) { return document.getElementById(id).value.trim(); }
function go() { var to = afterLogin || 'dashboard'; afterLogin = ''; if (location.hash.replace(/^#/, '') === to) render(false); else location.hash = to; }

document.addEventListener('submit', async function (e) {
  var f = e.target, fn = forms[f.id];
  if (!fn) return;
  e.preventDefault();
  var err = document.getElementById(errIds[f.id]); if (err) err.hidden = true;
  busyBtn(f, true);
  try { await fn(f); }
  catch (x) { if (err) showErr(errIds[f.id], x.message || 'Could not save. Please try again.'); else toast(x.message, true); }
  finally { busyBtn(f, false); }
});

/* ---------- start ---------- */
(async function init() {
  var y = document.getElementById('yr'); if (y) y.textContent = new Date().getFullYear();
  try { me = (await api('/me')).user; } catch (e) { me = null; }
  try { var cf = await api('/config'); loginOpts = cf.login || loginOpts; } catch (e) { /* buttons stay hidden */ }
  try {
    var ae = new URLSearchParams(location.search).get('auth_error');
    if (ae) { history.replaceState(null, '', location.pathname + (location.hash || '#login')); setTimeout(function () { toast(AUTH_ERRORS[ae] || AUTH_ERRORS.failed, true); }, 400); }
  } catch (e) { /* ignore */ }
  render(false);
  setInterval(function () { if (me && !document.hidden) refreshBadge(); }, 45000);
})();
})();
