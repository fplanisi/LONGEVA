import { enforceOrigin, isPaywallBypassEnabled, rateLimit, setCors } from './_lib/security.js';

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceOrigin(req, res)) return;
  if (!rateLimit(req, res, { prefix: 'stack_builder', max: 20, windowMs: 60_000 })) return;

  const paywallDisabled = isPaywallBypassEnabled();
  const { profile, session_id: sessionId } = req.body || {};
  if (!profile) return res.status(400).json({ error: 'profile es requerido' });
  if (!paywallDisabled && !sessionId) return res.status(400).json({ error: 'session_id es requerido' });

  try {
    if (!paywallDisabled) {
      const paid = await verifyPaidSession(sessionId, 'stack_builder');
      if (!paid.ok) return res.status(403).json({ error: 'Pago no verificado' });
    }

    const provider = cleanEnv(process.env.AI_PROVIDER) || 'openai';
    let text;
    if (provider === 'anthropic') text = await callAnthropic(profile);
    else if (provider === 'openai') text = await callOpenAI(profile);
    else text = await callGroq(profile);

    const parsed = parseJsonFromModel(text);
    return res.status(200).json({ stack: parsed, provider });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error generando stack' });
  }
}

async function verifyPaidSession(sessionId, expectedModule = '') {
  const stripeKey = cleanEnv(process.env.STRIPE_SECRET_KEY);
  if (!stripeKey) return { ok: false };
  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  const payload = await stripeRes.json();
  if (!stripeRes.ok) return { ok: false };
  const isPaid = payload.payment_status === 'paid' || payload.status === 'complete';
  const sessionModule = String(payload?.metadata?.module || '').trim();
  if (expectedModule && sessionModule && !matchesAllowedModule(sessionModule, expectedModule)) return { ok: false };
  if (expectedModule && !sessionModule) return { ok: false };
  return { ok: isPaid };
}

function matchesAllowedModule(sessionModule, expectedModule) {
  if (sessionModule === expectedModule) return true;
  if (expectedModule === 'stack_builder') {
    return sessionModule === 'combo_double' || sessionModule === 'combo_biohacker';
  }
  return false;
}

async function callAnthropic(profile) {
  const isEn = String(profile?.lang || '').toLowerCase().startsWith('en');
  const apiKey = cleanEnv(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY faltante o invalida');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2600,
      system: getSystemPrompt(isEn),
      messages: [{ role: 'user', content: buildPrompt(profile, isEn) }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${data?.error?.message || 'request failed'}`);
  return data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '';
}

async function callGroq(profile) {
  const isEn = String(profile?.lang || '').toLowerCase().startsWith('en');
  const apiKey = cleanEnv(process.env.GROQ_API_KEY);
  if (!apiKey) throw new Error('GROQ_API_KEY faltante o invalida');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2600,
      temperature: 0.2,
      messages: [
        { role: 'system', content: getSystemPrompt(isEn) },
        { role: 'user', content: buildPrompt(profile, isEn) },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Groq ${response.status}: ${data?.error?.message || 'request failed'}`);
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenAI(profile) {
  const isEn = String(profile?.lang || '').toLowerCase().startsWith('en');
  const apiKey = cleanEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error('OPENAI_API_KEY faltante o invalida');
  const model = cleanEnv(process.env.OPENAI_MODEL_STACK) || cleanEnv(process.env.OPENAI_MODEL) || 'gpt-4.1';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2600,
      temperature: 0.2,
      messages: [
        { role: 'system', content: getSystemPrompt(isEn) },
        { role: 'user', content: buildPrompt(profile, isEn) },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${data?.error?.message || 'request failed'}`);
  return data.choices?.[0]?.message?.content || '';
}

function getSystemPrompt(isEn = false) {
  if (isEn) {
    return `You are an expert in geroscience and personalized longevity medicine.
Return only valid JSON, no markdown or extra text.
Your output must follow the exact schema requested by the user.
Use a technical, cautious tone grounded in human evidence whenever available.
Include safety warnings for medication, pregnancy, or comorbidities.
Write JSON text values in English.`;
  }
  return `Eres experto en geroscience y medicina de longevidad personalizada.
Responde solo JSON válido, sin markdown ni texto adicional.
Tu salida debe seguir exactamente el esquema pedido por el usuario.
Usa un tono técnico, prudente y basado en evidencia humana siempre que exista.
Incluye advertencias de seguridad cuando corresponda por medicación, embarazo o comorbilidades.`;
}

function buildPrompt(profile, isEn = false) {
  return isEn ? buildPromptEn(profile) : buildPromptEs(profile);
}

function buildPromptEs(profile) {
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
  const country = profile?.country || 'GLOBAL';
  const foodStyleMap = { omnivore: 'Omnívoro', vegetarian: 'Vegetariano', vegan: 'Vegano' };
  const foodStyle = foodStyleMap[profile?.food_style] || foodStyleMap.omnivore;
  const sourcePreferenceMap = {
    natural_only: 'Solo naturales (hongos, polifenoles, compuestos naturales)',
    mixed: 'Mixto (naturales + sintéticos)',
    synthetic_ok: 'Incluye sintéticos sin restricción',
    food_only: 'Solo alimentos (sin suplementos, sin cápsulas, sin compuestos aislados)',
  };
  const sourcePreference = sourcePreferenceMap[profile?.source_preference] || sourcePreferenceMap.mixed;
  const sex = profile.sex === 'male' ? 'Masculino' : profile.sex === 'female' ? 'Femenino' : 'No especificado';

  return `Diseña un stack de longevidad personalizado para:
- Edad: ${profile.age} años
- Sexo biológico: ${sex}
- Objetivos principales: ${goals}
- Presupuesto mensual: ${budgetLabel}
- Preferencia de origen de moléculas: ${sourcePreference}
- Estilo alimentario (si aplica): ${foodStyle}
- País/mercado objetivo para disponibilidad: ${country}
- Condiciones de salud / medicamentos: ${conditions}
- Protocolo actual de suplementos: ${currentProtocol}

Responde ÚNICAMENTE con un JSON válido siguiendo exactamente este esquema (sin texto antes ni después, sin markdown, sin backticks):
{
  "summary": "2-3 frases personalizadas sobre este perfil específico y por qué este stack es óptimo",
  "estimated_cost": 120,
  "monthly_plan_note": "breve instrucción para sostener adherencia durante 30 días",
  "diet_extras": ["alimento extra 1", "alimento extra 2"],
  "weekly_food_plan": {
    "lunes": {"desayuno":[],"almuerzo":[],"merienda":[],"cena":[]},
    "martes": {"desayuno":[],"almuerzo":[],"merienda":[],"cena":[]},
    "miercoles": {"desayuno":[],"almuerzo":[],"merienda":[],"cena":[]},
    "jueves": {"desayuno":[],"almuerzo":[],"merienda":[],"cena":[]},
    "viernes": {"desayuno":[],"almuerzo":[],"merienda":[],"cena":[]},
    "sabado": {"desayuno":[],"almuerzo":[],"merienda":[],"cena":[]},
    "domingo": {"desayuno":[],"almuerzo":[],"merienda":[],"cena":[]}
  },
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
- Prioriza compuestos/alimentos relativamente accesibles para el país/mercado indicado (${country}) y evita opciones exóticas sin alternativa
- Si el protocolo actual ya incluye algo útil, intégralo y evita duplicados
- Si la preferencia es "Solo naturales", NO incluyas moléculas sintéticas ni fármacos
- Si la preferencia es "Mixto", prioriza naturales y usa sintéticos solo si aportan ventaja fuerte
- Si la preferencia es "Solo alimentos", NO incluyas suplementos. Usa alimentos concretos por franja horaria y en "dose" pon porciones (ej: "150 g", "1 taza", "2 huevos")
- Si la preferencia es "Solo alimentos", respeta estrictamente el estilo alimentario indicado (${foodStyle}): no incluir alimentos fuera de ese estilo
- Si la preferencia es "Solo alimentos", el campo "full" debe describir el alimento/fuente nutricional y "estimated_price" debe ser costo mensual estimado de ese alimento
- Si la preferencia es "Solo alimentos", DEBES completar "weekly_food_plan" con 7 días distintos y al menos 4 comidas por día (desayuno, almuerzo, merienda, cena). En este modo, "diet_extras" puede quedar vacío
- Si la preferencia es "Mixto" o "Incluye sintéticos" o "Solo naturales", NO hagas menú semanal detallado. En esos modos "weekly_food_plan" debe ser {} y debes completar "diet_extras" con 5-10 alimentos para sumar como extra (sin desplazar el foco en suplementos)
- Distribuye por farmacocinética y adherencia real de 30 días
- Responde solo con el JSON.`;
}

function buildPromptEn(profile) {
  const goalLabels = {
    longevity: 'General longevity',
    cognitive: 'Cognitive function',
    cardiovascular: 'Cardiovascular health',
    muscle: 'Muscle mass',
    energy: 'Mitochondrial energy',
    inflammation: 'Anti-inflammation',
  };
  const budgetLabel = profile?.budget_label || 'Not defined';
  const goals = (profile?.goals || []).map((g) => goalLabels[g] || g).join(', ') || 'Not defined';
  const conditions = profile?.conditions_label || 'None';
  const currentProtocol = profile?.current_protocol || 'No current supplement protocol';
  const country = profile?.country || 'GLOBAL';
  const foodStyleMap = { omnivore: 'Omnivore', vegetarian: 'Vegetarian', vegan: 'Vegan' };
  const foodStyle = foodStyleMap[profile?.food_style] || foodStyleMap.omnivore;
  const sourcePreferenceMap = {
    natural_only: 'Natural-only (mushrooms, polyphenols, natural compounds)',
    mixed: 'Mixed (natural + synthetic)',
    synthetic_ok: 'Synthetic compounds allowed',
    food_only: 'Food-only (no supplements, no capsules, no isolated compounds)',
  };
  const sourcePreference = sourcePreferenceMap[profile?.source_preference] || sourcePreferenceMap.mixed;
  const sex = profile.sex === 'male' ? 'Male' : profile.sex === 'female' ? 'Female' : 'Unspecified';

  return `Design a personalized longevity stack for:
- Age: ${profile.age} years
- Biological sex: ${sex}
- Main goals: ${goals}
- Monthly budget: ${budgetLabel}
- Molecule origin preference: ${sourcePreference}
- Dietary style (if applicable): ${foodStyle}
- Country/market for availability: ${country}
- Health conditions / medications: ${conditions}
- Current supplement protocol: ${currentProtocol}

Return ONLY valid JSON with this exact schema (no text before/after, no markdown, no backticks):
{
  "summary": "2-3 personalized sentences on why this stack fits this profile",
  "estimated_cost": 120,
  "monthly_plan_note": "short instruction for 30-day adherence",
  "diet_extras": ["food extra 1", "food extra 2"],
  "weekly_food_plan": {
    "monday": {"breakfast":[],"lunch":[],"snack":[],"dinner":[]},
    "tuesday": {"breakfast":[],"lunch":[],"snack":[],"dinner":[]},
    "wednesday": {"breakfast":[],"lunch":[],"snack":[],"dinner":[]},
    "thursday": {"breakfast":[],"lunch":[],"snack":[],"dinner":[]},
    "friday": {"breakfast":[],"lunch":[],"snack":[],"dinner":[]},
    "saturday": {"breakfast":[],"lunch":[],"snack":[],"dinner":[]},
    "sunday": {"breakfast":[],"lunch":[],"snack":[],"dinner":[]}
  },
  "morning": [{"name":"", "full":"", "priority":"core", "why":"", "dose":"", "synergy":"", "estimated_price":20, "evidence":"★★★★☆"}],
  "afternoon": [],
  "night": [],
  "warnings": ["relevant warning for this profile when applicable"],
  "rationale": "3-5 sentence paragraph explaining the scientific logic of the full stack"
}

Rules:
- priority must be one of: "core", "support", "optional"
- Include only molecules that fit the indicated budget (${budgetLabel})
- Do not repeat molecules across morning/afternoon/night unless truly split by dose
- If conditions or medications exist, remove risky interactions and explain warnings
- Prioritize options that are reasonably available in the target market (${country}) and avoid exotic choices without alternatives
- If current protocol already contains useful items, integrate and avoid duplicates
- If preference is "Natural-only", do NOT include synthetic compounds or drugs
- If preference is "Mixed", prioritize natural compounds and include synthetics only for strong advantage
- If preference is "Food-only", do NOT include supplements. Use concrete foods by day-part and in "dose" provide portions (e.g. "150 g", "1 cup", "2 eggs")
- If preference is "Food-only", strictly respect selected dietary style (${foodStyle}) and do not include foods outside that style
- If preference is "Food-only", field "full" should describe food/nutrient source and "estimated_price" should be estimated monthly food cost
- If preference is "Food-only", you MUST fill "weekly_food_plan" with 7 distinct days and at least 4 meals per day (breakfast, lunch, snack, dinner). In this mode, "diet_extras" may be empty
- If preference is "Mixed", "Synthetic allowed", or "Natural-only", do NOT create a full weekly menu. In those modes "weekly_food_plan" must be {} and "diet_extras" must include 5-10 foods as add-ons
- Distribute by pharmacokinetics and practical 30-day adherence
- Respond with JSON only.`;
}

function cleanEnv(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
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
