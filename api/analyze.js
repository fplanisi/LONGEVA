// api/analyze.js — Vercel Serverless Function
// Soporta: OpenAI, Groq (testing/gratis) y Anthropic (producción con web search)
// Cambiar en .env: AI_PROVIDER=openai | groq | anthropic

export default async function handler(req, res) {
  // CORS para desarrollo local y producción
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { molecule, full_name, pathways, category, study_count, mode } = req.body;

  if (!molecule) return res.status(400).json({ error: 'molecule field required' });

  const provider = process.env.AI_PROVIDER || 'openai'; // 'openai' | 'groq' | 'anthropic'
  if (molecule === '__ping__') {
    return res.status(200).json({ text: 'ok', provider, ping: true });
  }

  try {
    let result;
    if (provider === 'anthropic') {
      result = await callAnthropic(molecule, full_name, pathways, category, study_count, mode);
    } else if (provider === 'openai') {
      result = await callOpenAI(molecule, full_name, pathways, category, study_count, mode);
    } else {
      result = await callGroq(molecule, full_name, pathways, category, study_count, mode);
    }
    return res.status(200).json({ text: result, provider });
  } catch (error) {
    console.error(`[${provider}] Error:`, error.message);
    return res.status(500).json({ error: error.message, provider });
  }
}

// ─────────────────────────────────────────────
// OPENAI — Recomendado para producción general
// ─────────────────────────────────────────────
async function callOpenAI(molecule, fullName, pathways, category, studyCount, mode) {
  const isSearch = mode === 'latest';
  const model = process.env.OPENAI_MODEL_LIBRARY || process.env.OPENAI_MODEL_ANALYZE || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      temperature: 0.3,
      messages: [
        { role: 'system', content: getSystemPrompt(false) },
        { role: 'user', content: buildUserPrompt(molecule, fullName, pathways, category, studyCount, isSearch) },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${data?.error?.message || 'request failed'}`);
  return data.choices?.[0]?.message?.content || '';
}

// ─────────────────────────────────────────────
// ANTHROPIC — Producción con web search real
// ─────────────────────────────────────────────
async function callAnthropic(molecule, fullName, pathways, category, studyCount, mode) {
  const isSearch = mode === 'latest'; // busca papers recientes vs explicación base

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1800,
    system: getSystemPrompt(isSearch),
    messages: [{ role: 'user', content: buildUserPrompt(molecule, fullName, pathways, category, studyCount, isSearch) }],
  };

  // Activar web search solo cuando se piden novedades
  if (isSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Anthropic ${response.status}: ${err.error?.message}`);
  }

  const data = await response.json();
  // Extraer solo los bloques de texto (ignorar tool_use/tool_result)
  return data.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');
}

// ─────────────────────────────────────────────
// GROQ — Testing gratuito (sin web search)
// ─────────────────────────────────────────────
async function callGroq(molecule, fullName, pathways, category, studyCount) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', // el más potente de Groq gratis
      max_tokens: 1800,
      temperature: 0.3,
      messages: [
        { role: 'system', content: getSystemPrompt(false) },
        { role: 'user', content: buildUserPrompt(molecule, fullName, pathways, category, studyCount, false) },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Groq ${response.status}: ${err.error?.message}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ─────────────────────────────────────────────
// PROMPTS
// ─────────────────────────────────────────────
function getSystemPrompt(withSearch) {
  const searchNote = withSearch
    ? 'Tienes acceso a búsqueda web. BUSCA estudios recientes en PubMed, bioRxiv, Nature Aging y Cell Metabolism publicados en 2025-2026 antes de responder.'
    : 'Responde con el conocimiento científico más riguroso disponible sobre geroscience y longevidad.';

  return `Eres el máximo experto mundial en geroscience, biología del envejecimiento y medicina de longevidad. ${searchNote}

Responde SIEMPRE en español. Estructura tu análisis con estas secciones usando ### para los títulos:

### Descripción y clasificación
### Mecanismo de acción en longevidad
(Especifica vías moleculares: mTOR, AMPK, sirtuinas, NAD+, autofagia, senescencia, telómeros, epigenética, mitocondria, inflamación...)
### Evidencia científica
(Cita estudios clave: modelos utilizados, si hay RCT en humanos, nivel de evidencia)
### Dosis y protocolo
### Sinergias con otras moléculas
### Limitaciones y controversias
### Estado actual ${withSearch ? '(incluye hallazgos de 2025-2026 si los encuentras)' : '(2025-2026)'}

Usa **negritas** para términos clave. Si la evidencia es débil, indícalo honestamente. Sé técnico pero comprensible.`;
}

function buildUserPrompt(molecule, fullName, pathways, category, studyCount, isSearch) {
  const base = fullName && fullName !== molecule
    ? `Analiza en profundidad la molécula "${fullName}" (nombre común: ${molecule}).`
    : `Analiza en profundidad la molécula "${molecule}".`;

  const context = [
    category ? `Categoría: ${category}.` : '',
    pathways?.length ? `Vías conocidas: ${pathways.join(', ')}.` : '',
    studyCount ? `Referencias en literatura: ${studyCount}+ estudios.` : '',
  ].filter(Boolean).join(' ');

  const searchInstruction = isSearch
    ? `Busca específicamente estudios publicados en 2025 y 2026 sobre esta molécula y longevidad. Prioriza ensayos clínicos, estudios en primates o humanos, y mecanismos moleculares nuevos.`
    : `Explica el mecanismo de acción detallado y la evidencia científica para la extensión de la vida saludable.`;

  return `${base} ${context} ${searchInstruction}`;
}
