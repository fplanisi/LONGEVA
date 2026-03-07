import { createHash } from 'crypto';
import { kvDel, kvGetJson, kvSet, kvSetJson, kvConfigured } from './kv.js';

const PREFIX = 'longeva:v1';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 45; // 45d
const PROTOCOL_TTL_SECONDS = 60 * 60 * 24 * 120; // 120d
const LOCK_TTL_SECONDS = 60 * 5; // 5m

export function normalizeModule(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'biohacker_protocol') return 'biohacker_protocol';
  if (value === 'combo_double') return 'combo_double';
  if (value === 'combo_biohacker') return 'combo_biohacker';
  if (value === 'nutrition_plan') return 'nutrition_plan';
  if (value === 'stack_builder') return 'stack_builder';
  return '';
}

export function matchesAllowedModule(sessionModule, expectedModule) {
  const s = normalizeModule(sessionModule);
  const e = normalizeModule(expectedModule);
  if (!e) return true;
  if (s === e) return true;
  if (e === 'stack_builder') return s === 'combo_double' || s === 'combo_biohacker';
  if (e === 'biohacker_protocol') return s === 'combo_biohacker';
  return false;
}

function checkoutKey(sessionId) {
  return `${PREFIX}:checkout_session:${String(sessionId || '').trim()}`;
}
function protocolKey(expectedModule, sessionId) {
  return `${PREFIX}:protocol:${normalizeModule(expectedModule) || 'unknown'}:${String(sessionId || '').trim()}`;
}
function lockKey(expectedModule, sessionId) {
  return `${PREFIX}:gen_lock:${normalizeModule(expectedModule) || 'unknown'}:${String(sessionId || '').trim()}`;
}

export function kvReadyForProd() {
  return kvConfigured();
}

export async function recordCheckoutSessionCreated({ sessionId, module, email }) {
  const key = checkoutKey(sessionId);
  const payload = {
    id: String(sessionId || '').trim(),
    module: normalizeModule(module),
    email: String(email || '').trim(),
    status: 'created',
    created_at: new Date().toISOString(),
  };
  await kvSetJson(key, payload, { exSeconds: SESSION_TTL_SECONDS });
  return payload;
}

export async function recordCheckoutSessionPaid({ sessionId, module, email, payment_status, status }) {
  const key = checkoutKey(sessionId);
  const payload = {
    id: String(sessionId || '').trim(),
    module: normalizeModule(module),
    email: String(email || '').trim(),
    status: 'paid',
    payment_status: String(payment_status || '').trim(),
    stripe_status: String(status || '').trim(),
    paid_at: new Date().toISOString(),
  };
  await kvSetJson(key, payload, { exSeconds: SESSION_TTL_SECONDS });
  return payload;
}

export async function getStoredProtocol({ expectedModule, sessionId }) {
  const key = protocolKey(expectedModule, sessionId);
  return kvGetJson(key);
}

export async function storeProtocol({ expectedModule, sessionId, profileHash, provider, protocol }) {
  const key = protocolKey(expectedModule, sessionId);
  const payload = {
    expected_module: normalizeModule(expectedModule),
    session_id: String(sessionId || '').trim(),
    profile_hash: String(profileHash || '').trim(),
    provider: String(provider || '').trim(),
    created_at: new Date().toISOString(),
    protocol,
  };
  await kvSetJson(key, payload, { exSeconds: PROTOCOL_TTL_SECONDS });
  return payload;
}

export async function acquireGenerationLock({ expectedModule, sessionId }) {
  const key = lockKey(expectedModule, sessionId);
  const result = await kvSet(key, '1', { exSeconds: LOCK_TTL_SECONDS, nx: true });
  return result === 'OK';
}

export async function releaseGenerationLock({ expectedModule, sessionId }) {
  const key = lockKey(expectedModule, sessionId);
  try {
    await kvDel(key);
  } catch (_e) {}
}

export function hashProfile(profile) {
  const stable = stableStringify(profile);
  return createHash('sha256').update(stable).digest('hex').slice(0, 24);
}

function stableStringify(value) {
  return JSON.stringify(sortRec(value));
}

function sortRec(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sortRec);
  if (typeof value !== 'object') return value;
  const out = {};
  for (const k of Object.keys(value).sort()) out[k] = sortRec(value[k]);
  return out;
}

export async function fetchStripeCheckoutSession(sessionId) {
  const stripeKey = cleanEnv(process.env.STRIPE_SECRET_KEY);
  if (!stripeKey) throw new Error('Falta STRIPE_SECRET_KEY');
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const payload = await res.json();
  if (!res.ok) {
    const msg = payload?.error?.message || 'No se pudo verificar la sesión';
    const err = new Error(msg);
    err.code = 'STRIPE_SESSION_LOOKUP_FAILED';
    err.status = res.status;
    throw err;
  }
  return payload;
}

export async function verifyPaidStripeSession({ sessionId, expectedModule }) {
  const payload = await fetchStripeCheckoutSession(sessionId);
  const sessionModule = normalizeModule(payload?.metadata?.module);
  const email = payload.customer_details?.email || payload.customer_email || payload.metadata?.email || '';
  const paidRaw = payload.payment_status === 'paid' || payload.status === 'complete';
  const moduleOk = matchesAllowedModule(sessionModule, expectedModule) && (expectedModule ? Boolean(sessionModule) : true);
  const paid = Boolean(paidRaw && moduleOk);
  return {
    ok: paid,
    paid,
    session_module: sessionModule,
    email,
    payment_status: payload.payment_status,
    status: payload.status,
    raw: payload,
  };
}

function cleanEnv(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}
