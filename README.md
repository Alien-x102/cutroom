# Cutroom

A video clipping marketplace. Creators post campaigns (source video, pay per 1K views, budget). Clippers sign up, submit clip links, get approved, and see what they've earned. Campaign owners review clips, enter views, and record payouts.

No npm dependencies. Needs **Node 22.13 or newer** (uses the built-in SQLite).

## Run it on your computer

```bash
npm start
# open http://localhost:3000
```

The first account you create becomes the admin. Run the tests with `npm test`.

## Settings (environment variables)

| Variable | What it does |
|---|---|
| `PORT` | Port to listen on. Default 3000. |
| `DB_PATH` | Where the database file lives. Default `./data/cutroom.db`. Put this on a persistent disk. |
| `ADMIN_EMAIL` | An account created with this email becomes an admin. Admins can manage every campaign. |
| `TRUST_PROXY` | Set to `1` when behind a proxy (Render, Railway, Caddy, nginx) so rate limiting sees real visitor IPs. |
| `COOKIE_SECURE` | Set to `1` in production so the login cookie is only sent over HTTPS. |

## Put it online

You need a host that keeps a disk between restarts, because the database is a single file.

**Render / Railway / Fly.io (easiest)**
1. Push this folder to a GitHub repo.
2. Create a web service from the repo. Build command: none. Start command: `npm start`. Pick Node 22.
3. Attach a persistent disk and mount it at `/data`.
4. Set `DB_PATH=/data/cutroom.db`, `COOKIE_SECURE=1`, `TRUST_PROXY=1`, `ADMIN_EMAIL=you@example.com`.
5. Add your own domain in the host's settings. HTTPS is automatic.

**Docker (any VPS)**
```bash
docker build -t cutroom .
docker run -d -p 3000:3000 -v cutroom-data:/data \
  -e COOKIE_SECURE=1 -e TRUST_PROXY=1 -e ADMIN_EMAIL=you@example.com cutroom
```
Put Caddy or nginx in front for HTTPS.

**Back up** `cutroom.db` regularly (copy the file while the app is idle, or use `sqlite3 cutroom.db ".backup backup.db"`).

## How it works

- **Accounts:** email and password. Passwords are hashed with scrypt. Login sessions are stored on the server and last 30 days. Login and sign-up are rate limited.
- **Public pages:** anyone can browse campaigns. Submitting, posting and managing need an account.
- **Earnings:** views ÷ 1000 × the campaign rate, counted only for approved clips. A campaign stops accepting clips when claimed earnings reach its budget.
- **Payouts:** each clipper adds payout details to their profile (bank or wallet). The campaign owner sees them only after approving a clip, then pays outside Cutroom and clicks "Mark paid".

## What it does not do yet

- **Views are typed in by the campaign owner.** There is no automatic view tracking. Owners should check the clip before entering views. Automatic tracking means TikTok, Instagram, YouTube and X APIs or a paid data provider.
- **No payments inside the app.** Money moves outside Cutroom.
- **No email.** There is no email verification and no password reset. If someone forgets a password, an admin has to reset it in the database. Adding email needs a sender such as Resend or Postmark.
- **One server only.** SQLite is great up to a few thousand users on one machine. Beyond that, move to Postgres.

## Files

```
server.js        API, sessions, static files
db.js            database schema
public/          the website (index.html, app.js, style.css)
test/api.test.js backend tests
```
