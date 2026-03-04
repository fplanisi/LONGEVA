import { enforceOrigin, isPaywallBypassEnabled, rateLimit, setCors } from './_lib/security.js';

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceOrigin(req, res)) return;
  if (!rateLimit(req, res, { prefix: 'replace_item', max: 30, windowMs: 60_000 })) return;

  const paywallDisabled = isPaywallBypassEnabled();
  const { session_id: sessionId, profile, current_item: currentItem, existing_items: existingItems, reason, slot } = req.body || {};
  if (!profile || !currentItem) return res.status(400).json({ error: 'profile y current_item son requeridos' });
  if (!paywallDisabled && !sessionId) return res.status(400).json({ error: 'session_id es requerido' });

  try {
    if (!paywallDisabled) {
      const paid = await verifyPaidSession(sessionId);
      if (!paid.ok) return res.status(403).json({ error: 'Pago no verificado' });
    }

    const provider = process.env.AI_PROVIDER || 'openai';
    let raw;
    if (provider === 'anthropic') raw = await callAnthropic(profile, currentItem, existingItems, reason, slot);
    else if (provider === 'openai') raw = await callOpenAI(profile, currentItem, existingItems, reason, slot);
    else raw = await callGroq(profile, currentItem, existingItems, reason, slot);

    const parsed = parseJsonFromModel(raw);
    if (!parsed?.name) return res.status(500).json({ error: 'La IA no devolvió un reemplazo válido' });
    return res.status(200).json({ item: parsed, provider });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error generando reemplazo' });
  }
}

async function verifyPaidSession(sessionId) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return { ok: false };
  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const payload = await stripeRes.json();
  if (!stripeRes.ok) return { ok: false };
  return { ok: payload.payment_status === 'paid' || payload.status === 'complete' };
}

async function callOpenAI(profile, currentItem, existingItems, reason, slot) {
  const model = process.env.OPENAI_MODEL_STACK || process.env.OPENAI_MODEL || 'gpt-4.1';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      temperature: 0.2,
      messages: [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: buildPrompt(profile, currentItem, existingItems, reason, slot) },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${data?.error?.message || 'request failed'}`);
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(profile, currentItem, existingItems, reason, slot) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 900,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: buildPrompt(profile, currentItem, existingItems, reason, slot) }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${data?.error?.message || 'request failed'}`);
  return data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '';
}

async function callGroq(profile, currentItem, existingItems, reason, slot) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 900,
      temperature: 0.2,
      messages: [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: buildPrompt(profile, currentItem, existingItems, reason, slot) },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Groq ${response.status}: ${data?.error?.message || 'request failed'}`);
  return data.choices?.[0]?.message?.content || '';
}

function getSystemPrompt() {
  return `You are an expert in longevity and personalized stack design.
If profile.lang starts with "en", write JSON values in English; otherwise write in Spanish.
Responde SOLO JSON válido, sin markdown.
Debes proponer un reemplazo funcionalmente equivalente, dentro del presupuesto, y con mejor disponibilidad comercial global.
Si el usuario pidió solo alimentos, mantén formato de alimento/porciones y no uses suplementos.`;
}

function buildPrompt(profile, currentItem, existingItems, reason, slot) {
  const sourcePreference = profile?.source_preference || 'mixed';
  return `Reemplaza el siguiente item del stack:
- Item actual: ${JSON.stringify(currentItem)}
- Motivo de reemplazo: ${reason || 'No indicado'}
- Franja horaria: ${slot || 'no definida'}
- Perfil: ${JSON.stringify({
    age: profile.age,
    sex: profile.sex,
    goals: profile.goals,
    budget: profile.budget_label,
    source_preference: sourcePreference,
    conditions: profile.conditions_label,
  })}
- Items ya presentes (no repetir): ${(existingItems || []).join(', ') || 'ninguno'}

Devuelve SOLO este JSON:
{
  "name": "nombre corto",
  "full": "nombre completo o fuente nutricional",
  "priority": "core|support|optional",
  "why": "por qué esta alternativa es adecuada",
  "dose": "dosis o porción",
  "synergy": "sinergia opcional",
  "estimated_price": 25,
  "evidence": "★★★★☆"
}

Reglas:
- No repetir items existentes.
- Si source_preference=natural_only usar solo naturales.
- Si source_preference=food_only usar alimentos (no suplementos).
- Mantener costo similar o menor al item actual cuando sea posible.
- Responder solo JSON.`;
}

function parseJsonFromModel(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_e) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('La IA no devolvió JSON válido');
  }
}
