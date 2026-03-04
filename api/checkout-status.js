import { enforceOrigin, isPaywallBypassEnabled, rateLimit, setCors } from './_lib/security.js';

export default async function handler(req, res) {
  setCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceOrigin(req, res)) return;
  if (!rateLimit(req, res, { prefix: 'checkout_status', max: 40, windowMs: 60_000 })) return;

  if (isPaywallBypassEnabled()) {
    return res.status(200).json({
      paid: true,
      bypass: true,
      email: '',
      payment_status: 'bypassed',
      status: 'complete',
    });
  }

  const sessionId = String(req.query?.session_id || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'session_id requerido' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(500).json({ error: 'Falta STRIPE_SECRET_KEY' });

  try {
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${stripeKey}` },
    });

    const payload = await stripeRes.json();
    if (!stripeRes.ok) {
      const msg = payload?.error?.message || 'No se pudo verificar la sesión';
      return res.status(400).json({ error: msg, paid: false });
    }

    const paid = payload.payment_status === 'paid' || payload.status === 'complete';
    return res.status(200).json({
      paid,
      email: payload.customer_details?.email || payload.customer_email || payload.metadata?.email || '',
      payment_status: payload.payment_status,
      status: payload.status,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error verificando pago', paid: false });
  }
}
