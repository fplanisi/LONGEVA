import { enforceOrigin, isPaywallBypassEnabled, rateLimit, setCors } from './_lib/security.js';
import { kvReadyForProd, recordCheckoutSessionCreated } from './_lib/monetization.js';

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceOrigin(req, res)) return;
  if (!rateLimit(req, res, { prefix: 'checkout', max: 12, windowMs: 60_000 })) return;

  const email = String(req.body?.email || '').trim();
  const returnToRaw = String(req.body?.return_to || '').trim();
  const module = normalizeModule(req.body?.module);
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email válido requerido' });
  }
  const safeReturnTo = isSafeReturnPath(returnToRaw) ? returnToRaw : '/stack-builder.html';

  if (isPaywallBypassEnabled()) {
    return res.status(200).json({
      url: `${safeReturnTo}?paid=1&session_id=dev_bypass`,
      id: 'dev_bypass',
      mode: 'bypass',
    });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = resolvePriceId(module);
  const rawPaymentLink = String(process.env.STRIPE_PAYMENT_LINK || '').trim();

  // Prioridad: Checkout Session dinámica con Price ID. Esto evita problemas de enlaces mal formados.
  if (!stripeKey) {
    return res.status(500).json({ error: 'Falta configurar STRIPE_SECRET_KEY' });
  }

  if (!kvReadyForProd()) {
    return res.status(500).json({
      error:
        'Persistencia de compras no configurada. Activa Vercel KV (Upstash) y define UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN antes de lanzar tráfico pago.',
    });
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
    params.set('metadata[module]', module);

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

    try {
      await recordCheckoutSessionCreated({ sessionId: payload.id, module, email });
    } catch (e) {
      return res.status(500).json({ error: e?.message || 'No se pudo persistir la sesión de checkout' });
    }

    return res.status(200).json({ url: payload.url, id: payload.id, mode: 'checkout_session' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error en checkout' });
  }
}

function isSafeReturnPath(path) {
  return /^\/[a-zA-Z0-9\-_/\.]*$/.test(path) && !path.includes('..');
}

function normalizeModule(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'biohacker_protocol') return 'biohacker_protocol';
  if (value === 'combo_double') return 'combo_double';
  if (value === 'combo_biohacker') return 'combo_biohacker';
  if (value === 'nutrition_plan') return 'nutrition_plan';
  return 'stack_builder';
}

function resolvePriceId(module) {
  if (module === 'biohacker_protocol') return clean(process.env.STRIPE_PRICE_ID_BIOHACKER) || clean(process.env.STRIPE_PRICE_ID);
  if (module === 'combo_double') return clean(process.env.STRIPE_PRICE_ID_COMBO_DOUBLE) || clean(process.env.STRIPE_PRICE_ID_STACK) || clean(process.env.STRIPE_PRICE_ID);
  if (module === 'combo_biohacker') return clean(process.env.STRIPE_PRICE_ID_COMBO_BIOHACKER) || clean(process.env.STRIPE_PRICE_ID_BIOHACKER) || clean(process.env.STRIPE_PRICE_ID_STACK) || clean(process.env.STRIPE_PRICE_ID);
  if (module === 'nutrition_plan') return clean(process.env.STRIPE_PRICE_ID_NUTRITION) || clean(process.env.STRIPE_PRICE_ID);
  return clean(process.env.STRIPE_PRICE_ID_STACK) || clean(process.env.STRIPE_PRICE_ID);
}

function clean(v) {
  return String(v || '').trim();
}
