// api/discover.js — Descubrimiento de nuevas moléculas via web search
// Solo disponible con Anthropic (requiere web search)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body; // ej: "nuevas moléculas longevidad 2025"

  const provider = process.env.AI_PROVIDER || 'groq';

  // discover solo funciona con Anthropic web search
  if (provider !== 'anthropic') {
    return res.status(200).json({
      text: 'La función de descubrimiento de nuevas moléculas requiere el modo producción (Anthropic con web search). Actualmente en modo testing (Groq).',
      provider,
      limited: true,
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `Eres un científico experto en geroscience. Tu trabajo es descubrir y reportar los últimos hallazgos sobre moléculas y compuestos que alargan la vida. 
        
Busca en PubMed, bioRxiv, Nature Aging, Cell Metabolism, y medios científicos como longevity.technology y lifespan.io.
Responde SIEMPRE en español. Sé riguroso: solo incluye hallazgos con evidencia real, no especulaciones.

Formato de respuesta para cada molécula/hallazgo encontrado:
**[NOMBRE]** — [Tipo: Natural/Sintética] — [Categoría]
- Hallazgo: [descripción del nuevo descubrimiento]
- Mecanismo: [vía molecular]
- Fuente: [publicación/journal + año]
- Nivel evidencia: [in vitro / animal / humanos]
---`,
        messages: [{
          role: 'user',
          content: query || 'Busca los últimos descubrimientos de 2025-2026 sobre moléculas, compuestos o intervenciones que han demostrado extender la vida o mejorar la salud en el envejecimiento. Incluye tanto naturales como sintéticas. Prioriza estudios en humanos o primates.',
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Anthropic ${response.status}: ${err.error?.message}`);
    }

    const data = await response.json();
    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    return res.status(200).json({ text, provider: 'anthropic' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
