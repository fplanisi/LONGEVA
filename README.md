# LONGEVA — Moléculas de Longevidad
## Guía de Despliegue Completa

---

## Arquitectura

```
longeva/
├── api/
│   ├── analyze.js     ← Backend IA (Groq/Anthropic)
│   └── discover.js    ← Descubrimiento nuevas moléculas
│   ├── create-checkout-session.js ← Stripe paywall
│   ├── checkout-status.js ← Verificación de pago
│   └── stack-builder.js ← IA para stack personalizado (protegido por pago)
├── public/
│   ├── index.html     ← Frontend
│   ├── stack-builder.html ← Wizard premium (paywall)
│   └── data/
│       └── molecules.json  ← Base de datos curada (copiar desde /data/)
├── data/
│   └── molecules.json ← Fuente de verdad (editar aquí)
├── vercel.json
└── .env.example
```

---

## PASO 1 — Clonar y preparar

```bash
git clone https://github.com/TU_USUARIO/longeva.git
cd longeva

# Copiar variables de entorno
cp .env.example .env

# Copiar la DB al directorio público
cp data/molecules.json public/data/molecules.json
```

---

## PASO 2 — Configurar variables (.env)

### Para testing (Groq, gratis):
```env
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key    # console.groq.com
```

### Para producción (Anthropic + web search):
```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key   # console.anthropic.com
```

### Para paywall (Stripe):
```env
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PRICE_ID=price_xxxxx
APP_URL=https://tu-dominio.com
```

Alternativa: usar `STRIPE_PAYMENT_LINK` si prefieres no crear sesiones dinámicas.

---

## PASO 3 — Probar en local

```bash
# Instalar Vercel CLI
npm i -g vercel

# Ejecutar en local (carga .env automáticamente)
vercel dev
# → Abre http://localhost:3000
# → Stack premium: http://localhost:3000/stack-builder.html
```

---

## PASO 4 — Desplegar en Vercel

```bash
# Primera vez:
vercel

# Configurar variables de entorno en Vercel:
vercel env add GROQ_API_KEY
vercel env add AI_PROVIDER

# Cuando tengas Anthropic:
vercel env add ANTHROPIC_API_KEY
# Luego cambiar AI_PROVIDER=anthropic en el dashboard de Vercel

# Deploy a producción:
vercel --prod
```

O usa el dashboard de Vercel:
1. vercel.com → New Project → Import Git Repository
2. Settings → Environment Variables → agregar las variables
3. Redeploy

---

## PASO 5 — Actualizar la base de moléculas

### Formato de una molécula en molecules.json:
```json
{
  "id": "nombre-unico-lowercase",
  "name": "Nombre Corto",
  "full_name": "Nombre Científico Completo",
  "type": "natural",           // "natural" | "synthetic"
  "category": "Polifenoles",   // usar categorías existentes
  "tags": ["natural", "inflamacion", "mTOR"],
  "description": "Descripción breve del mecanismo (2-3 líneas).",
  "pathways": ["AMPK", "mTOR", "NF-κB"],
  "evidence_rating": "★★★☆☆",  // 1-5 estrellas
  "study_count": 150,
  "key_compounds": ["Compuesto activo 1", "Compuesto activo 2"],
  "typical_dose": "100-500 mg/día",
  "key_studies": [
    "Autor et al. 2024 - Journal - Descripción"
  ],
  "added_date": "2026-03-04",
  "last_reviewed": "2026-03-04"
}
```

### Agregar nueva molécula:
1. Editar `data/molecules.json`
2. Actualizar `"total"` y `"last_updated"` al inicio del JSON
3. `cp data/molecules.json public/data/molecules.json`
4. `git commit -am "Add: NombreMolécula"` → auto-deploy en Vercel

---

## Cambiar de Groq a Anthropic (producción)

En el dashboard de Vercel:
1. Settings → Environment Variables
2. Cambiar `AI_PROVIDER` de `groq` a `anthropic`
3. Agregar `ANTHROPIC_API_KEY`
4. Redeploy

Esto activa:
- **web_search** en cada análisis del modo "Novedades 2024-2025"
- **Mejor calidad** de respuestas con Claude Sonnet 4
- **Botón "Descubrir nuevas moléculas"** completamente funcional

---

## Costos estimados

### Groq (testing):
- **Gratis**: 14,400 tokens/minuto, 500,000 tokens/día
- Suficiente para desarrollo y demos

### Anthropic (producción):
- Claude Sonnet 4: ~$3/M input tokens, ~$15/M output tokens
- Cada análisis: ~800-1500 tokens output ≈ $0.01-0.02 por consulta
- 1000 consultas/mes ≈ $15-20/mes

---

## Actualización automática (futuro)

Para automatizar la captura de nuevas moléculas de PubMed:

```bash
# Cron job semanal (GitHub Actions)
# .github/workflows/update-db.yml
# - Llama a la API de PubMed con keywords de longevidad
# - Filtra papers con extensión de vida
# - Propone adiciones al JSON via PR automático
```

---

## Links rápidos

- Groq Console: https://console.groq.com
- Anthropic Console: https://console.anthropic.com
- Vercel Dashboard: https://vercel.com/dashboard
- PubMed Longevity: https://pubmed.ncbi.nlm.nih.gov/?term=longevity+lifespan+extension
