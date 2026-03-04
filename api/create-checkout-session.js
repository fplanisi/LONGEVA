export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = String(req.body?.email || '').trim();
  const returnToRaw = String(req.body?.return_to || '').trim();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email válido requerido' });
  }
  const safeReturnTo = isSafeReturnPath(returnToRaw) ? returnToRaw : '/stack-builder.html';

  if (isPaywallDisabled()) {
    return res.status(200).json({
      url: `${safeReturnTo}?paid=1&session_id=dev_bypass`,
      id: 'dev_bypass',
      mode: 'bypass',
    });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = process.env.STRIPE_PRICE_ID;
  const rawPaymentLink = String(process.env.STRIPE_PAYMENT_LINK || '').trim();

  // Prioridad: Checkout Session dinámica con Price ID. Esto evita problemas de enlaces mal formados.
  if (!stripeKey) {
    return res.status(500).json({ error: 'Falta configurar STRIPE_SECRET_KEY' });
  }

  if (!stripePriceId && rawPaymentLink) {
    try {
      const base = new URL(rawPaymentLink);
      const url = new URL(base.toString());
      url.searchParams.set('prefilled_email', email);
      return res.status(200).json({ url: url.toString(), mode: 'payment_link' });
    } catch (_e) {
      return res.status(500).json({ error: 'STRIPE_PAYMENT_LINK inválido. Usa URL completa https://...' });
    }
  }

  if (!stripePriceId) {
    return res.status(500).json({ error: 'Falta STRIPE_PRICE_ID (o define STRIPE_PAYMENT_LINK válido)' });
  }

  try {
    const appUrl = String(process.env.APP_URL || '').trim().replace(/\/$/, '');
    const requestOrigin = String(req.headers.origin || '').trim().replace(/\/$/, '');
    const origin = /^https?:\/\//i.test(requestOrigin) ? requestOrigin : appUrl;
    if (!/^https?:\/\//i.test(origin)) {
      return res.status(500).json({
        error: 'APP_URL inválida. Debe incluir protocolo, por ejemplo: https://tu-proyecto.vercel.app',
      });
    }

    const successPath = `${safeReturnTo}?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelPath = `${safeReturnTo}?canceled=1`;

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

function isSafeReturnPath(path) {
  return /^\/[a-zA-Z0-9\-_/\.]*$/.test(path) && !path.includes('..');
}

function isPaywallDisabled() {
  const flag = String(process.env.PAYWALL_DISABLED || '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}
