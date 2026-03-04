import { enforceOrigin, rateLimit, setCors } from './_lib/security.js';

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceOrigin(req, res)) return;
  if (!rateLimit(req, res, { prefix: 'track', max: 120, windowMs: 60_000 })) return;

  try {
    const event = String(req.body?.event || '').trim();
    if (!event) return res.status(400).json({ error: 'event requerido' });
    const payload = req.body?.payload || {};
    const ts = req.body?.ts || new Date().toISOString();
    const page = req.body?.page || 'unknown';

    // Base de métricas mínima: logs estructurados en runtime de Vercel.
    console.log('[LONGEVA_TRACK]', JSON.stringify({ event, page, ts, payload }));
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'tracking error' });
  }
}
