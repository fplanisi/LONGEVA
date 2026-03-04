const rlStore = globalThis.__longevaRateLimitStore || new Map();
globalThis.__longevaRateLimitStore = rlStore;

export function setCors(req, res, methods = 'POST, OPTIONS') {
  const allowedOrigin = getAllowedOrigin(req);
  if (allowedOrigin) res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function enforceOrigin(req, res) {
  const origin = String(req.headers?.origin || '').trim();
  if (!origin) return true;
  const allowed = getAllowedOrigin(req);
  if (!allowed) return true;
  if (origin !== allowed) {
    res.status(403).json({ error: 'Origin no permitido' });
    return false;
  }
  return true;
}

export function isPaywallBypassEnabled() {
  const flag = String(process.env.PAYWALL_DISABLED || '').toLowerCase();
  const requested = flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
  const forceProd = String(process.env.PAYWALL_BYPASS_IN_PROD || '').toLowerCase();
  const allowProd = forceProd === '1' || forceProd === 'true' || forceProd === 'yes' || forceProd === 'on';
  const env = String(process.env.VERCEL_ENV || process.env.NODE_ENV || '').toLowerCase();
  const isProd = env === 'production';
  return requested && (!isProd || allowProd);
}

export function rateLimit(req, res, opts = {}) {
  const windowMs = opts.windowMs || 60_000;
  const max = opts.max || 30;
  const prefix = opts.prefix || 'default';
  const ip = getClientIp(req);
  const bucket = `${prefix}:${ip}`;
  const now = Date.now();
  const row = rlStore.get(bucket) || { count: 0, reset: now + windowMs };
  if (now > row.reset) {
    row.count = 0;
    row.reset = now + windowMs;
  }
  row.count += 1;
  rlStore.set(bucket, row);
  if (row.count > max) {
    res.status(429).json({ error: 'Demasiadas solicitudes. Intenta de nuevo en breve.' });
    return false;
  }
  return true;
}

function getAllowedOrigin(req) {
  const fromEnv = String(process.env.ALLOWED_ORIGIN || '').trim();
  if (fromEnv && fromEnv !== '*') return fromEnv.replace(/\/$/, '');
  const appUrl = String(process.env.APP_URL || '').trim();
  if (appUrl) {
    try {
      return new URL(appUrl).origin.replace(/\/$/, '');
    } catch (_e) {}
  }
  const host = String(req.headers?.host || '').trim();
  if (!host) return '';
  return `https://${host}`.replace(/\/$/, '');
}

function getClientIp(req) {
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  if (fwd) return fwd;
  const real = String(req.headers?.['x-real-ip'] || '').trim();
  if (real) return real;
  return 'unknown';
}
