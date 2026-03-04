export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
