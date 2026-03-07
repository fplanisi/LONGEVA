function getKvConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return { url, token, ok: Boolean(url && token) };
}

function assertKvReady() {
  const cfg = getKvConfig();
  if (!cfg.ok) {
    const msg =
      'KV no configurado. Define UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN (Vercel KV / Upstash Redis) para persistencia server-side.';
    const err = new Error(msg);
    err.code = 'KV_NOT_CONFIGURED';
    throw err;
  }
  return cfg;
}

function encodeSegment(value) {
  return encodeURIComponent(String(value ?? ''));
}

async function upstashFetch(path, { method = 'GET', body, query } = {}) {
  const { url, token } = assertKvReady();
  const q = query ? `?${new URLSearchParams(query).toString()}` : '';
  const res = await fetch(`${url}${path}${q}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body == null ? {} : { 'Content-Type': 'text/plain; charset=utf-8' }),
    },
    body: body == null ? undefined : String(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = String(data?.error || data?.message || `Upstash error ${res.status}`);
    const err = new Error(message);
    err.code = 'KV_REQUEST_FAILED';
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

export function kvConfigured() {
  return getKvConfig().ok;
}

export async function kvGet(key) {
  const data = await upstashFetch(`/get/${encodeSegment(key)}`, { method: 'GET' });
  return data?.result ?? null;
}

export async function kvGetJson(key) {
  const raw = await kvGet(key);
  if (raw == null) return null;
  try {
    return JSON.parse(String(raw));
  } catch (_e) {
    return null;
  }
}

export async function kvSet(key, value, { exSeconds, nx } = {}) {
  const query = {};
  if (typeof exSeconds === 'number' && Number.isFinite(exSeconds) && exSeconds > 0) query.EX = String(Math.floor(exSeconds));
  if (nx) query.NX = 'true';
  const data = await upstashFetch(`/set/${encodeSegment(key)}`, {
    method: 'POST',
    body: value,
    query: Object.keys(query).length ? query : undefined,
  });
  return data?.result ?? null;
}

export async function kvSetJson(key, obj, opts = {}) {
  return kvSet(key, JSON.stringify(obj), opts);
}

export async function kvDel(key) {
  const data = await upstashFetch(`/del/${encodeSegment(key)}`, { method: 'POST' });
  return data?.result ?? null;
}
