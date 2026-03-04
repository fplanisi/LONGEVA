export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = String(req.body?.email || '').trim();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email válido requerido' });
  }

  const paymentLink = process.env.STRIPE_PAYMENT_LINK;
  if (paymentLink) {
    const url = `${paymentLink}${paymentLink.includes('?') ? '&' : '?'}prefilled_email=${encodeURIComponent(email)}`;
    return res.status(200).json({ url, mode: 'payment_link' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = process.env.STRIPE_PRICE_ID;
  if (!stripeKey || !stripePriceId) {
    return res.status(500).json({ error: 'Falta configurar STRIPE_SECRET_KEY o STRIPE_PRICE_ID' });
  }

  try {
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const origin = req.headers.origin || appUrl;
    const successPath = '/stack-builder.html?paid=1&session_id={CHECKOUT_SESSION_ID}';
    const cancelPath = '/stack-builder.html?canceled=1';

    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('customer_email', email);
    params.set('line_items[0][price]', stripePriceId);
    params.set('line_items[0][quantity]', '1');
    params.set('success_url', `${origin}${successPath}`);
    params.set('cancel_url', `${origin}${cancelPath}`);
    params.set('metadata[email]', email);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const payload = await stripeRes.json();
    if (!stripeRes.ok) {
      const msg = payload?.error?.message || 'No se pudo crear la sesión de Stripe';
      return res.status(500).json({ error: msg });
    }

    return res.status(200).json({ url: payload.url, id: payload.id, mode: 'checkout_session' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error en checkout' });
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
