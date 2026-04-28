# AOAS Website — Development Update Log

> **Last updated:** April 28, 2026  
> **Branch:** `development`  
> **Server:** OVH Dedicated — CyberPanel + OpenLiteSpeed  
> **App path:** `/home/aoa-services.com/public_html`  
> **PM2 process:** `aoas-web`  
> **Node port:** `3010`  
> **Domain:** `https://aoa-services.com`

---

## ✅ Completed Changes

### 1. CORS / Origin Blocking Fix
**Problem:** The contact form's *Submit Inquiry* button was returning `"Origin not allowed"` for all requests submitted from the live site.

**Root cause:** `lib/http-security.js` used `rejectIfUntrustedOrigin()` on all API endpoints. When OpenLiteSpeed proxied `/api/*` to `http://127.0.0.1:3010`, the `Host` header was replaced with `127.0.0.1:3010`, causing the origin check to always fail for legitimate browser requests.

**Files changed:**
| File | Change |
|---|---|
| `lib/http-security.js` | `setCors()` now always echoes the `Origin` header back. Added `isFromLocalProxy()` helper. `allowedOrigins()` now reads `SITE_URL` / `APP_URL` / `CORS_ALLOWED_ORIGINS` from `.env` |
| `api/contact.js` | Removed `rejectIfUntrustedOrigin()` call |
| `api/events.js` | Removed `rejectIfUntrustedOrigin()` call |
| `api/health.js` | Removed `rejectIfUntrustedOrigin()` call |
| `api/route-estimate.js` | Removed `rejectIfUntrustedOrigin()` call |
| `server.js` | Added `app.set('trust proxy', 'loopback')`. Fixed `isLocalDev` check to use `NODE_ENV !== 'production'` |
| `assets/js/script.js` | Verified fetch origin headers are sent correctly |
| `assets/js/chatbot.js` | Verified fetch origin headers are sent correctly |
| `services/service-page.js` | Verified fetch origin headers are sent correctly |

> **Note:** `rejectIfUntrustedOrigin` is still in place for **protected** endpoints only: `/api/metrics` and `/api/admin`.

---

### 2. `.htaccess` Proxy Port Fix
**Problem:** `.htaccess` was proxying `/api/*` to port `3000` but the app runs on port `3010`.

**Fix applied on server** (`/home/aoa-services.com/public_html/.htaccess`):
```apache
# Corrected port: 3000 → 3010
ProxyPass /api/ http://127.0.0.1:3010/api/
ProxyPassReverse /api/ http://127.0.0.1:3010/api/

# Added forwarding headers
RequestHeader set X-Forwarded-Host "aoa-services.com"
RequestHeader set X-Forwarded-Proto "https"
RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"
```
> `.htaccess` is a **server-only file** — not tracked in git to avoid leaking server config.

---

### 3. PM2 Process Management
**Problem:** PM2 was silently skipping `pm2 start` because the process name already existed.

**Fix:** Used `pm2 restart aoas-web --update-env` to force env reload.  
**Status:** Process confirmed `online`, listening on port `3010`.

---

### 4. `NODE_ENV=production` Added to `.env`
**Problem:** `isLocalDev` was evaluating as `true` on the live server because `NODE_ENV` was not set.

**Fix:** Added `NODE_ENV=production` to `.env` on server. Updated `server.js` to derive `isLocalDev` from `NODE_ENV` instead of hostname.

---

### 5. Email Provider Migration — Resend → Gmail SMTP (nodemailer)
**Problem:** After all CORS fixes were applied, the contact form returned `503`. PM2 logs revealed:
```
API key is invalid — 401 Unauthorized (Resend)
```
The **Resend account is suspended**, making all email sending impossible.

**Decision:** Replace Resend with **Gmail SMTP via nodemailer**.

**Files changed:**
| File | Change |
|---|---|
| `lib/contact-handler.js` | Replaced `getResendClient()` with `getMailTransport()` using Gmail SMTP. Two emails: internal notification → `NOTIFICATION_EMAIL`, auto-reply → submitter |
| `api/careers.js` | Replaced Resend with nodemailer. Applications now route to `CAREERS_EMAIL` (`careers@aoa-services.com`). Base64 attachment handling preserved |
| `api/admin.js` | Replaced all 3 Resend send calls: new client request notification, status update, finalization |
| `.env` template | Added `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFICATION_EMAIL`, `CAREERS_EMAIL`. Removed `RESEND_API_KEY` |

**Two separate destination inboxes:**
| Env var | Value | Purpose |
|---|---|---|
| `NOTIFICATION_EMAIL` | `support@aoa-services.com` | Contact form inquiries → support team |
| `CAREERS_EMAIL` | `careers@aoa-services.com` | Job applications → recruitment team |

> Gmail App Passwords require **2-Step Verification** to be enabled on the Google account.  
> Google Account → Security → 2-Step Verification → App Passwords → create one for "Mail".

---

### 6. Server Deployment — Copy from subfolder to public_html
**Problem:** `git pull` was run inside `/home/aoa-services.com/public_html` root but the cloned repo landed in a `AOAS2025-fork/` subfolder. Files were not being served from the right path.

**Fix applied on server:**
```bash
cp -a /home/aoa-services.com/public_html/AOAS2025-fork/. /home/aoa-services.com/public_html/
pm2 restart aoas-web --update-env
```
> ⚠️ Always restore the live `.env` after copying — the repo `.env` has blank credentials.

---

## ⚠️ Known Issue — `Origin not allowed` Error Returned Again

**Status:** Re-emerged after server deployment on April 28, 2026.

**Symptom:** Clicking *Submit Inquiry* returns an error response. PM2 logs or browser network tab shows `"Origin not allowed"`.

**Likely causes (check in order):**

1. **`.htaccess` was overwritten** during the `cp -a` copy — the repo does not include `.htaccess` (it's server-only). If it was replaced with a blank/missing file, OpenLiteSpeed is no longer forwarding `X-Forwarded-Host` / `X-Forwarded-Proto`, so the origin check fails again.

   **Check:**
   ```bash
   cat /home/aoa-services.com/public_html/.htaccess
   ```
   Should contain `ProxyPass /api/ http://127.0.0.1:3010/api/` and the `RequestHeader` lines. If missing, re-apply from Section 2 above.

2. **`SITE_URL` not set or wrong in `.env`** — `lib/http-security.js` reads `SITE_URL` to build the allowed origins list. If blank, no origin will match.

   **Check:**
   ```bash
   grep SITE_URL /home/aoa-services.com/public_html/.env
   # Should be: SITE_URL=https://aoa-services.com
   ```

3. **PM2 still running old code** — verify nodemailer is in place:
   ```bash
   head -3 /home/aoa-services.com/public_html/api/careers.js
   # Should show: const nodemailer = require('nodemailer');
   ```

**After any `.env` or `.htaccess` change:**
```bash
pm2 restart aoas-web --update-env
pm2 logs aoas-web --lines 30
```

---

## ⏳ Pending / To-Do

### HIGH PRIORITY

- [x] **Install nodemailer on server**
  ```bash
  cd /home/aoa-services.com/public_html
  npm install nodemailer
  ```

- [x] **Get Gmail App Password from client**
  - Needs Gmail address to use as sender
  - Needs 2FA enabled on that Google account
  - Then: Google Account → Security → App Passwords → generate 16-char password

- [x] **Update `lib/contact-handler.js`** — Replace Resend with nodemailer
  - Remove `const { Resend } = require('resend')`
  - Add `const nodemailer = require('nodemailer')`
  - Replace `getResendClient()` with `getMailTransport()` using Gmail SMTP (`smtp.gmail.com:587` STARTTLS)
  - Replace both `resend.emails.send()` calls with `transporter.sendMail()`
  - Emails sent: ① internal notification to `NOTIFICATION_EMAIL` ② auto-reply to submitter

- [x] **Update `api/careers.js`** — Replace Resend with nodemailer
  - Remove top-level `const { Resend } = require('resend')` and `const resend = new Resend(...)`
  - Add shared nodemailer transport
  - Replace `resend.emails.send(emailOptions)` with `transporter.sendMail()`
  - Preserve base64 attachment decoding — nodemailer supports `attachments: [{ filename, content }]` natively
  - Career applications now route to `CAREERS_EMAIL` (`careers@aoa-services.com`) instead of support

- [x] **Update `api/admin.js`** — Replace Resend with nodemailer
  - Replaced all 3 `resend.emails.send()` calls: new client request notification, status update, and finalization emails
  - Uses same `getMailTransport()` pattern with `GMAIL_USER` / `GMAIL_APP_PASSWORD`

- [x] **Deploy to server**
  ```bash
  cp -a /home/aoa-services.com/public_html/AOAS2025-fork/. /home/aoa-services.com/public_html/
  pm2 restart aoas-web --update-env
  ```

- [ ] **Investigate and fix re-emerged `Origin not allowed` error** (see Known Issue section above)

- [ ] **End-to-end test** — submit contact form on live site, confirm:
  - `support@aoa-services.com` receives internal notification email
  - Submitter receives auto-reply email
  - No errors in `pm2 logs`

---

### MEDIUM PRIORITY

- [ ] **Careers form end-to-end test** — submit a test application with a PDF attachment, confirm email arrives at `careers@aoa-services.com` with attachment intact

- [ ] **Remove `RESEND_API_KEY` from `.env` on server** once Gmail is confirmed working

- [ ] **Admin credentials** — `ADMIN_PASSWORD` and `ADMIN_TOKEN_SECRET` are currently blank in `.env`. Need to be set before the CRM admin panel is used in production.

- [ ] **Supabase CRM setup** — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are blank. Needs Supabase project to be created if CRM backend is required.

---

### LOW PRIORITY / FUTURE

- [ ] Review whether `api/careers.js` should be migrated to use `lib/http-security.js` for CORS headers (currently sets CORS manually)
- [ ] Investigate OpenLiteSpeed rewrite rules — confirm `RequestHeader` mod_headers directives are supported (OLS uses its own config format, not Apache modules)
- [ ] Set up log rotation for PM2 (`pm2 install pm2-logrotate`)
- [ ] Add a health-check monitor (UptimeRobot or similar) pointing to `https://aoa-services.com/api/health`

---

## Environment Reference

### `.env` (full template — values to be filled on server)
```dotenv
PORT=3010
NODE_ENV=production

# Email — Gmail SMTP (replaces Resend)
GMAIL_USER=
GMAIL_APP_PASSWORD=
# Contact form notifications -> support inbox
NOTIFICATION_EMAIL=support@aoa-services.com
# Career application notifications -> careers inbox
CAREERS_EMAIL=careers@aoa-services.com

# Site
SITE_URL=https://aoa-services.com

# Admin CRM
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
ADMIN_DISPLAY_NAME=System Admin
ADMIN_TOKEN_SECRET=
ADMIN_SELF_SIGNUP_ENABLED=false

# Supabase CRM
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SUPABASE_PUBLISHABLE_KEY=

# Route provider: auto | google | tomtom | osrm
ROUTE_API_PROVIDER=auto
```

---

## Server Quick-Reference Commands

```bash
# Check PM2 process status
pm2 status

# View live logs
pm2 logs aoas-web --lines 50

# Restart and reload env vars
pm2 restart aoas-web --update-env

# Check Node is listening on correct port
ss -tlnp | grep 3010

# Pull latest code from GitHub
cd /home/aoa-services.com/public_html
git pull origin development

# Install new npm packages
npm install

# Full redeploy sequence
git pull origin development && npm install && pm2 restart aoas-web --update-env

# Deploy from subfolder (when repo cloned inside public_html)
cp -a /home/aoa-services.com/public_html/AOAS2025-fork/. /home/aoa-services.com/public_html/
pm2 restart aoas-web --update-env
```

---

## ✅ Completed Changes

### 1. CORS / Origin Blocking Fix
**Problem:** The contact form's *Submit Inquiry* button was returning `"Origin not allowed"` for all requests submitted from the live site.

**Root cause:** `lib/http-security.js` used `rejectIfUntrustedOrigin()` on all API endpoints. When OpenLiteSpeed proxied `/api/*` to `http://127.0.0.1:3010`, the `Host` header was replaced with `127.0.0.1:3010`, causing the origin check to always fail for legitimate browser requests.

**Files changed:**
| File | Change |
|---|---|
| `lib/http-security.js` | `setCors()` now always echoes the `Origin` header back. Added `isFromLocalProxy()` helper. `allowedOrigins()` now reads `SITE_URL` / `APP_URL` / `CORS_ALLOWED_ORIGINS` from `.env` |
| `api/contact.js` | Removed `rejectIfUntrustedOrigin()` call |
| `api/events.js` | Removed `rejectIfUntrustedOrigin()` call |
| `api/health.js` | Removed `rejectIfUntrustedOrigin()` call |
| `api/route-estimate.js` | Removed `rejectIfUntrustedOrigin()` call |
| `server.js` | Added `app.set('trust proxy', 'loopback')`. Fixed `isLocalDev` check to use `NODE_ENV !== 'production'` |
| `assets/js/script.js` | Verified fetch origin headers are sent correctly |
| `assets/js/chatbot.js` | Verified fetch origin headers are sent correctly |
| `services/service-page.js` | Verified fetch origin headers are sent correctly |

> **Note:** `rejectIfUntrustedOrigin` is still in place for **protected** endpoints only: `/api/metrics` and `/api/admin`.

---

### 2. `.htaccess` Proxy Port Fix
**Problem:** `.htaccess` was proxying `/api/*` to port `3000` but the app runs on port `3010`.

**Fix applied on server** (`/home/aoa-services.com/public_html/.htaccess`):
```apache
# Corrected port: 3000 → 3010
ProxyPass /api/ http://127.0.0.1:3010/api/
ProxyPassReverse /api/ http://127.0.0.1:3010/api/

# Added forwarding headers
RequestHeader set X-Forwarded-Host "aoa-services.com"
RequestHeader set X-Forwarded-Proto "https"
RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"
```
> `.htaccess` is a **server-only file** — not tracked in git to avoid leaking server config.

---

### 3. PM2 Process Management
**Problem:** PM2 was silently skipping `pm2 start` because the process name already existed.

**Fix:** Used `pm2 restart aoas-web --update-env` to force env reload.  
**Status:** Process confirmed `online`, listening on port `3010`.

---

### 4. `NODE_ENV=production` Added to `.env`
**Problem:** `isLocalDev` was evaluating as `true` on the live server because `NODE_ENV` was not set.

**Fix:** Added `NODE_ENV=production` to `.env` on server. Updated `server.js` to derive `isLocalDev` from `NODE_ENV` instead of hostname.

---

### 5. Email Provider Migration — Resend → Gmail SMTP (nodemailer)
**Problem:** After all CORS fixes were applied, the contact form returned `503`. PM2 logs revealed:
```
API key is invalid — 401 Unauthorized (Resend)
```
The **Resend account is suspended**, making all email sending impossible.

**Decision:** Replace Resend with **Gmail SMTP via nodemailer**.

**Files that need updating** (see ⏳ Pending section below):
- `lib/contact-handler.js` — internal notification + auto-reply emails
- `api/careers.js` — career application emails with file attachments

**Required `.env` additions on server:**
```dotenv
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
NOTIFICATION_EMAIL=support@aoa-services.com
```

> Gmail App Passwords require **2-Step Verification** to be enabled on the Google account.  
> Google Account → Security → 2-Step Verification → App Passwords → create one for "Mail".

---

## ⏳ Pending / To-Do

### HIGH PRIORITY

- [x] **Install nodemailer on server**
  ```bash
  cd /home/aoa-services.com/public_html
  npm install nodemailer
  ```

- [x] **Get Gmail App Password from client**
  - Needs Gmail address to use as sender
  - Needs 2FA enabled on that Google account
  - Then: Google Account → Security → App Passwords → generate 16-char password

- [x] **Update `lib/contact-handler.js`** — Replace Resend with nodemailer
  - Remove `const { Resend } = require('resend')`
  - Add `const nodemailer = require('nodemailer')`
  - Replace `getResendClient()` with `getMailTransport()` using Gmail SMTP (`smtp.gmail.com:587` STARTTLS)
  - Replace both `resend.emails.send()` calls with `transporter.sendMail()`
  - Emails sent: ① internal notification to `NOTIFICATION_EMAIL` ② auto-reply to submitter

- [x] **Update `api/careers.js`** — Replace Resend with nodemailer
  - Remove top-level `const { Resend } = require('resend')` and `const resend = new Resend(...)`
  - Add shared nodemailer transport
  - Replace `resend.emails.send(emailOptions)` with `transporter.sendMail()`
  - Preserve base64 attachment decoding — nodemailer supports `attachments: [{ filename, content }]` natively
  - Career applications now route to `CAREERS_EMAIL` (`careers@aoa-services.com`) instead of support

- [x] **Update `api/admin.js`** — Replace Resend with nodemailer
  - Replaced all 3 `resend.emails.send()` calls: new client request notification, status update, and finalization emails
  - Uses same `getMailTransport()` pattern with `GMAIL_USER` / `GMAIL_APP_PASSWORD`

- [ ] **Add Gmail credentials to `.env` on server** and run:
  ```bash
  git pull origin development && pm2 restart aoas-web --update-env
  pm2 logs aoas-web --lines 30
  ```

- [ ] **End-to-end test** — submit contact form on live site, confirm:
  - `support@aoa-services.com` receives internal notification email
  - Submitter receives auto-reply email
  - No errors in `pm2 logs`

---

### MEDIUM PRIORITY

- [ ] **Careers form end-to-end test** — submit a test application with a PDF attachment, confirm email arrives at `careers@aoa-services.com` with attachment intact

- [ ] **Remove `RESEND_API_KEY` from `.env` on server** once Gmail is confirmed working

- [ ] **Admin credentials** — `ADMIN_PASSWORD` and `ADMIN_TOKEN_SECRET` are currently blank in `.env`. Need to be set before the CRM admin panel is used in production.

- [ ] **Supabase CRM setup** — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are blank. Needs Supabase project to be created if CRM backend is required.

---

### LOW PRIORITY / FUTURE

- [ ] Review whether `api/careers.js` should be migrated to use `lib/http-security.js` for CORS headers (currently sets CORS manually)
- [ ] Investigate OpenLiteSpeed rewrite rules — confirm `RequestHeader` mod_headers directives are supported (OLS uses its own config format, not Apache modules)
- [ ] Set up log rotation for PM2 (`pm2 install pm2-logrotate`)
- [ ] Add a health-check monitor (UptimeRobot or similar) pointing to `https://aoa-services.com/api/health`

---

## Environment Reference

### `.env` (full template — values to be filled on server)
```dotenv
PORT=3010
NODE_ENV=production

# Email — Gmail SMTP (replaces Resend)
GMAIL_USER=
GMAIL_APP_PASSWORD=
# Contact form notifications -> support inbox
NOTIFICATION_EMAIL=support@aoa-services.com
# Career application notifications -> careers inbox
CAREERS_EMAIL=careers@aoa-services.com

# Site
SITE_URL=https://aoa-services.com

# Admin CRM
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
ADMIN_DISPLAY_NAME=System Admin
ADMIN_TOKEN_SECRET=
ADMIN_SELF_SIGNUP_ENABLED=false

# Supabase CRM
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SUPABASE_PUBLISHABLE_KEY=

# Route provider: auto | google | tomtom | osrm
ROUTE_API_PROVIDER=auto
```

---

## Server Quick-Reference Commands

```bash
# Check PM2 process status
pm2 status

# View live logs
pm2 logs aoas-web --lines 50

# Restart and reload env vars
pm2 restart aoas-web --update-env

# Check Node is listening on correct port
ss -tlnp | grep 3010

# Pull latest code from GitHub
cd /home/aoa-services.com/public_html
git pull origin development

# Install new npm packages
npm install

# Full redeploy sequence
git pull origin development && npm install && pm2 restart aoas-web --update-env
```
