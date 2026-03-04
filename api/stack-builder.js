export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { profile, session_id: sessionId } = req.body || {};
  if (!profile || !sessionId) {
    return res.status(400).json({ error: 'profile y session_id son requeridos' });
  }

  try {
    const paid = await verifyPaidSession(sessionId);
    if (!paid.ok) return res.status(403).json({ error: 'Pago no verificado' });

    const provider = process.env.AI_PROVIDER || 'groq';
    let text;
    if (provider === 'anthropic') {
      text = await callAnthropic(profile);
    } else {
      text = await callGroq(profile);
    }

    const parsed = parseJsonFromModel(text);
    return res.status(200).json({ stack: parsed, provider });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error generando stack' });
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

  const isPaid = payload.payment_status === 'paid' || payload.status === 'complete';
  return { ok: isPaid };
}

async function callAnthropic(profile) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2600,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: buildPrompt(profile) }],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${data?.error?.message || 'request failed'}`);
  return data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '';
}

async function callGroq(profile) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2600,
      temperature: 0.2,
      messages: [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: buildPrompt(profile) },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Groq ${response.status}: ${data?.error?.message || 'request failed'}`);
  return data.choices?.[0]?.message?.content || '';
}

function getSystemPrompt() {
  return `Eres experto en geroscience y medicina de longevidad personalizada.
Responde solo JSON válido, sin markdown ni texto adicional.
Tu salida debe seguir exactamente el esquema pedido por el usuario.
Usa un tono técnico, prudente y basado en evidencia humana siempre que exista.
Incluye advertencias de seguridad cuando corresponda por medicación, embarazo o comorbilidades.`;
}

function buildPrompt(profile) {
  const goalLabels = {
    longevity: 'Longevidad general',
    cognitive: 'Función cognitiva',
    cardiovascular: 'Salud cardiovascular',
    muscle: 'Masa muscular',
    energy: 'Energía mitocondrial',
    inflammation: 'Anti-inflamación',
  };

  const budgetLabel = profile?.budget_label || 'No definido';
  const goals = (profile?.goals || []).map((g) => goalLabels[g] || g).join(', ') || 'No definido';
  const conditions = profile?.conditions_label || 'Ninguna';
  const currentProtocol = profile?.current_protocol || 'No usa suplementos actualmente';
  const sourcePreferenceMap = {
    natural_only: 'Solo naturales (hongos, polifenoles, compuestos naturales)',
    mixed: 'Mixto (naturales + sintéticos)',
    synthetic_ok: 'Incluye sintéticos sin restricción',
    food_only: 'Solo alimentos (sin suplementos, sin cápsulas, sin compuestos aislados)',
  };
  const sourcePreference = sourcePreferenceMap[profile?.source_preference] || sourcePreferenceMap.mixed;

  return `Diseña un stack de longevidad personalizado para:
- Edad: ${profile.age} años
- Sexo biológico: ${profile.sex === 'male' ? 'Masculino' : 'Femenino'}
- Objetivos principales: ${goals}
- Presupuesto mensual: ${budgetLabel}
- Preferencia de origen de moléculas: ${sourcePreference}
- Condiciones de salud / medicamentos: ${conditions}
- Protocolo actual de suplementos: ${currentProtocol}

Responde ÚNICAMENTE con un JSON válido siguiendo exactamente este esquema (sin texto antes ni después, sin markdown, sin backticks):
{
  "summary": "2-3 frases personalizadas sobre este perfil específico y por qué este stack es óptimo",
  "estimated_cost": 120,
  "monthly_plan_note": "breve instrucción para sostener adherencia durante 30 días",
  "morning": [{"name":"", "full":"", "priority":"core", "why":"", "dose":"", "synergy":"", "estimated_price":20, "evidence":"★★★★☆"}],
  "afternoon": [],
  "night": [],
  "warnings": ["advertencia relevante para este perfil si aplica"],
  "rationale": "párrafo de 3-5 frases explicando la lógica científica del stack completo"
}

Reglas:
- priority solo puede ser: "core", "support", "optional"
- Incluye solo moléculas que quepan en el presupuesto indicado (${budgetLabel})
- No repitas moléculas entre mañana/tarde/noche salvo que sea explícitamente dividido en dosis
- Si hay condiciones o medicamentos, excluye interacciones de riesgo y explica warnings
- Si el protocolo actual ya incluye algo útil, intégralo y evita duplicados
- Si la preferencia es "Solo naturales", NO incluyas moléculas sintéticas ni fármacos
- Si la preferencia es "Mixto", prioriza naturales y usa sintéticos solo si aportan ventaja fuerte
- Si la preferencia es "Solo alimentos", NO incluyas suplementos. Usa alimentos concretos por franja horaria y en "dose" pon porciones (ej: "150 g", "1 taza", "2 huevos").
- Si la preferencia es "Solo alimentos", el campo "full" debe describir el alimento/fuente nutricional y "estimated_price" debe ser costo mensual estimado de ese alimento.
- Distribuye por farmacocinética y adherencia real de 30 días
- Responde solo con el JSON.`;
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
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('La IA no devolvió JSON válido');
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
