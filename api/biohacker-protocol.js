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

    const protocol = parseJsonFromModel(text);
    return res.status(200).json({ protocol, provider });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error generando protocolo' });
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
  return `Eres especialista en protocolos experimentales de peptidos para usuarios expertos.
Tu respuesta no debe hacer afirmaciones absolutas ni prometer resultados.
Responde solo JSON valido, sin markdown ni texto adicional.
Prioriza seguridad: si hay riesgos importantes, eleva riesgo y propone alternativa conservadora.
Marca con claridad evidencia humana limitada cuando corresponda.`;
}

function buildPrompt(profile) {
  const goals = {
    muscle: 'Ganancia muscular / rendimiento',
    fat_loss: 'Perdida de grasa / recomposicion',
    longevity: 'Longevidad / salud metabolica',
    skin: 'Salud cutanea / regeneracion',
    recovery: 'Recuperacion / antiinflamacion',
  };

  const objective = goals[profile.objective] || profile.objective || 'General';
  const contraindications = profile.contraindications || 'Ninguna';
  const currentStack = profile.current_stack || 'No reportado';
  const experience = profile.experience || 'intermediate';

  return `Disena un protocolo biohacker EXPERIMENTAL de peptidos para:
- Objetivo principal: ${objective}
- Nivel de experiencia: ${experience}
- Contraindicaciones/medicacion: ${contraindications}
- Protocolo actual: ${currentStack}
- Presupuesto mensual maximo: ${profile.budget_label || 'No definido'}

Responde UNICAMENTE con JSON valido, exactamente en este formato:
{
  "summary": "2-3 frases",
  "risk_level": "alto|medio|bajo",
  "estimated_monthly_cost": 180,
  "protocol_phases": [
    {
      "phase": "Inicio",
      "duration_weeks": "2",
      "goal": "adaptacion",
      "items": [
        {
          "peptide": "nombre",
          "dose": "dosis",
          "frequency": "frecuencia",
          "timing": "momento",
          "route": "subcutanea/oral/etc",
          "reason": "por que para este perfil",
          "stack_with": "sinergia opcional",
          "evidence": "humana limitada|preclinica|mixta",
          "monthly_cost": 60
        }
      ]
    }
  ],
  "monitoring": ["analitica o metrica 1", "analitica o metrica 2"],
  "contraindications": ["riesgo o exclusion 1"],
  "red_flags": ["senal de alarma 1"],
  "expert_notes": "nota tecnica breve sobre ciclos y descansos",
  "disclaimer": "texto de advertencia para expertos"
}

Reglas:
- Es un protocolo solo para expertos: incluir advertencias claras.
- No incluir mas de 4 peptidos en total.
- Si el perfil sugiere alto riesgo, prioriza opcion conservadora o recomendacion de no iniciar.
- Evita sustancias prohibidas/deportivas sin advertencia.
- Ajusta al presupuesto indicado.
- Responde solo con JSON.`;
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
    throw new Error('La IA no devolvio JSON valido');
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
