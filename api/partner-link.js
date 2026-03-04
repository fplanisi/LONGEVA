export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const itemRaw = String(req.query?.item || '').trim();
  if (!itemRaw) return res.status(400).send('item requerido');

  const item = itemRaw.toLowerCase();
  const explicit = readExplicitMap();
  const direct = explicit[item];
  if (direct) return redirect(res, direct);

  const iherbCode = String(process.env.IHERB_RCODE || '').trim();
  const amazonTag = String(process.env.AMAZON_ASSOC_TAG || '').trim();

  // Prioridad: iHerb (si hay código) -> Amazon búsqueda por defecto.
  if (iherbCode) {
    const url = `https://www.iherb.com/search?kw=${encodeURIComponent(itemRaw)}&rcode=${encodeURIComponent(iherbCode)}`;
    return redirect(res, url);
  }

  const amazonBase = `https://www.amazon.com/s?k=${encodeURIComponent(itemRaw)}`;
  const amazonUrl = amazonTag ? `${amazonBase}&tag=${encodeURIComponent(amazonTag)}` : amazonBase;
  return redirect(res, amazonUrl);
}

function readExplicitMap() {
  try {
    const raw = String(process.env.AFFILIATE_LINKS_JSON || '').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.startsWith('http')) out[String(k).toLowerCase()] = v;
    }
    return out;
  } catch (_e) {
    return {};
  }
}

function redirect(res, url) {
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, url);
}
