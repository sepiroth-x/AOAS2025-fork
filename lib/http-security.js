const path = require('path');

const DEFAULT_ALLOW_HEADERS = 'Content-Type, Authorization, X-Admin-Token';
const SENSITIVE_CACHE_CONTROL = 'no-store, max-age=0, must-revalidate';
const API_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');
const PRIVATE_PAGE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self' data:",
].join('; ');
const PUBLIC_PAGE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-elem 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-elem 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com",
  "connect-src 'self' https://router.project-osrm.org",
  "font-src 'self' data:",
].join('; ');

// Returns true when the TCP connection to Node.js came from the local machine.
// Since Node listens only on 127.0.0.1:3000 (not publicly), this can only happen
// when the on-server reverse proxy (OpenLiteSpeed / Apache / Nginx) forwarded the
// request. It is therefore safe to trust the Origin header in this case.
function isFromLocalProxy(req) {
  const addr = String(
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    req.info?.remoteAddress || ''
  );
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function allowedOrigins() {
  const explicit = String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  // Support an explicit canonical site URL set in your server environment.
  const siteUrl = process.env.SITE_URL || process.env.APP_URL || '';

  const auto = [siteUrl]
    .filter(Boolean)
    .map((u) => {
      try {
        return new URL(u).origin.toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  return new Set([...explicit, ...auto]);
}

function normalizeHost(host) {
  return String(host || '')
    .toLowerCase()
    .replace(/^www\./, '');
}

function getRequestPathname(req) {
  if (typeof req.path === 'string' && req.path.trim()) {
    return req.path;
  }

  const raw = String(req.originalUrl || req.url || '/');
  const pathname = raw.split('?')[0].trim() || '/';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function getRequestHost(req) {
  return String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
}

// Reconstruct the full trusted origin from forwarded proxy headers.
// e.g. X-Forwarded-Proto=https + X-Forwarded-Host=aoa-services.com → https://aoa-services.com
function getProxiedOrigin(req) {
  const proto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const host = getRequestHost(req);
  if (proto && host && !host.startsWith('127.') && !host.startsWith('localhost')) {
    return `${proto}://${host}`;
  }
  return '';
}

function isAllowedOrigin(req, originRaw) {
  if (!originRaw) {
    return true;
  }

  // Requests arriving from 127.0.0.1 came through the local reverse proxy.
  // Port 3000 is not publicly reachable, so this cannot be spoofed externally.
  if (isFromLocalProxy(req)) {
    return true;
  }

  try {
    const origin = new URL(originRaw);
    const requestHost = getRequestHost(req);
    const originHost = origin.host.toLowerCase();

    // Exact host match.
    if (requestHost && originHost === requestHost) {
      return true;
    }

    // www-normalized host match (handles www.example.com ↔ example.com).
    if (requestHost && normalizeHost(originHost) === normalizeHost(requestHost)) {
      return true;
    }

    // Reverse-proxy match: compare the full origin against the reconstructed
    // proxied origin (X-Forwarded-Proto + X-Forwarded-Host set by .htaccess).
    const proxiedOrigin = getProxiedOrigin(req);
    if (proxiedOrigin && origin.origin.toLowerCase() === proxiedOrigin) {
      return true;
    }
    if (proxiedOrigin) {
      try {
        const proxiedUrl = new URL(proxiedOrigin);
        if (normalizeHost(originHost) === normalizeHost(proxiedUrl.host)) {
          return true;
        }
      } catch { /* ignore */ }
    }

    // Explicit allow-list (CORS_ALLOWED_ORIGINS / SITE_URL / APP_URL in .env).
    return allowedOrigins().has(origin.origin.toLowerCase());
  } catch {
    return false;
  }
}

function setCors(req, res, methods, headers = DEFAULT_ALLOW_HEADERS) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (origin) {
    // Always echo back the requesting origin — the rejectIfUntrustedOrigin
    // gate (on protected routes) is what enforces the allow-list, not this header.
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', methods || 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', headers);
  res.setHeader('Access-Control-Max-Age', '86400');
}

function writeJson(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(payload);
    return;
  }

  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function rejectIfUntrustedOrigin(req, res, message = 'Origin not allowed.') {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(req, origin)) {
    const requestHost = getRequestHost(req);
    const configured = [...allowedOrigins()].join(', ') || '(none — relying on same-host match only)';
    console.warn(
      `[CORS] Blocked origin: "${origin}" | request host: "${requestHost}" | allowed: ${configured}\n` +
      `       Fix: set CORS_ALLOWED_ORIGINS="${origin}" or SITE_URL="${origin}" in your server .env file.`,
    );
    // Still set CORS header so the browser can read the JSON error body.
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', DEFAULT_ALLOW_HEADERS);
    writeJson(res, 403, {
      success: false,
      error: message,
    });
    return true;
  }
  return false;
}

function isSensitivePath(pathname) {
  return pathname === '/admin'
    || pathname === '/admin.html'
    || pathname === '/insights'
    || pathname === '/insights.html'
    || pathname === '/api/metrics'
    || pathname.startsWith('/api/admin');
}

function isPrivatePage(pathname) {
  return pathname === '/admin'
    || pathname === '/admin.html'
    || pathname === '/insights'
    || pathname === '/insights.html';
}

function isPageRequest(pathname) {
  if (pathname.startsWith('/api/')) {
    return false;
  }

  const extension = path.extname(pathname).toLowerCase();
  return extension === '' || extension === '.html';
}

function setNoStore(res) {
  res.setHeader('Cache-Control', SENSITIVE_CACHE_CONTROL);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function buildContentSecurityPolicy(pathname) {
  if (pathname.startsWith('/api/')) {
    return API_CSP;
  }

  if (isPrivatePage(pathname)) {
    return PRIVATE_PAGE_CSP;
  }

  if (isPageRequest(pathname)) {
    return PUBLIC_PAGE_CSP;
  }

  return '';
}

function applySecurityHeaders(req, res) {
  const pathname = getRequestPathname(req);

  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=(), browsing-topics=(), geolocation=(self)');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  if (isSensitivePath(pathname)) {
    setNoStore(res);
  }

  const csp = buildContentSecurityPolicy(pathname);
  if (csp) {
    res.setHeader('Content-Security-Policy', csp);
  }
}

module.exports = {
  API_CSP,
  DEFAULT_ALLOW_HEADERS,
  PRIVATE_PAGE_CSP,
  PUBLIC_PAGE_CSP,
  applySecurityHeaders,
  buildContentSecurityPolicy,
  getRequestPathname,
  isAllowedOrigin,
  rejectIfUntrustedOrigin,
  setCors,
  setNoStore,
  writeJson,
};
