# LONGEVAPP

Plataforma web de longevidad y biohacking con cuatro módulos principales:

- `index.html`: landing y entrada a producto
- `library.html`: biblioteca molecular + análisis IA
- `stack-builder.html`: protocolo personalizado de suplementos/alimentación
- `biohacker-protocol.html`: protocolo experimental de péptidos
- `food-longevity.html`: nutrición gratuita
- `pricing.html`: pricing y bundles

## Estructura útil

```text
longeva/
├── api/                     # serverless functions (Vercel)
├── data/                    # base curada principal
├── molecule_pages/          # páginas SEO por molécula
├── public/                  # espejo deploy estático
├── scripts/                 # utilidades de sync y validación
├── *.html                   # páginas fuente principales
├── sitemap.xml
└── vercel.json
```

## Fuente de verdad

La fuente editable está en la raíz:

- `index.html`
- `library.html`
- `stack-builder.html`
- `biohacker-protocol.html`
- `food-longevity.html`
- `pricing.html`
- `privacy.html`
- `terms.html`
- `data/`
- `molecule_pages/`

`public/` se mantiene como espejo para deploy estático.

## Flujo de trabajo recomendado

1. Editar archivos fuente en raíz.
2. Validar core:

```bash
node scripts/validate-core.mjs
```

3. Sincronizar a `public/`:

```bash
bash scripts/sync-public.sh
```

4. Commit.
5. Push a `main`.

## Variables de entorno

### IA

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=...
OPENAI_MODEL_STACK=...
GROQ_API_KEY=...
ANTHROPIC_API_KEY=...
```

### Stripe

```env
STRIPE_SECRET_KEY=...
STRIPE_PRICE_ID=...
STRIPE_PRICE_ID_STACK=...
STRIPE_PRICE_ID_BIOHACKER=...
STRIPE_PRICE_ID_COMBO_DOUBLE=...
STRIPE_PRICE_ID_COMBO_BIOHACKER=...
STRIPE_PRICE_ID_NUTRITION=...
APP_URL=https://tu-dominio.com
ALLOWED_ORIGIN=https://tu-dominio.com
```

### Desarrollo/testing

Hay bypass de paywall contemplado por backend para testing controlado. No asumir que eso es seguridad real de producción.

## APIs principales

- `api/analyze.js`: análisis IA de biblioteca
- `api/discover.js`: descubrimiento de nuevas moléculas
- `api/stack-builder.js`: generación del protocolo principal
- `api/biohacker-protocol.js`: generación del protocolo biohacker
- `api/replace-item.js`: reemplazos de moléculas
- `api/create-checkout-session.js`: Stripe checkout
- `api/checkout-status.js`: verificación de pago
- `api/track.js`: telemetría simple

## Decisiones actuales de producto

- `library -> stack-builder` puede pasar una molécula priorizada.
- `stack-builder` debe intentar incluir esa molécula si es segura y compatible; si no, debe justificar la exclusión.
- `stack-builder` soporta:
  - suplementos
  - solo alimentos
  - suplementos + food companion
  - doble objetivo
- `biohacker` no expone links de compra de péptidos por ahora.

## Qué validar antes de cada deploy

1. Biblioteca:
   - search
   - modal molecular
   - CTA a plan personalizado
2. Stack builder:
   - questionnaire
   - checkout
   - render del protocolo
   - replace
   - PDF
3. Nutrition:
   - vegetarian/vegan
   - food-only preview
4. Biohacker:
   - cuestionario por pasos
   - checkout
   - render inline
   - PDF

## Deuda técnica consciente

- Hay archivos legacy en la raíz que no deberían usarse como fuente activa:
  - `stack-builder-lab.html`
  - `stack-builder.repaired.from-files-13.html`
  - `longeva-stack.html`
- No los moví todavía para no romper nada sin inventario completo.
- La seguridad de “una compra = un protocolo” está parcialmente reforzada en frontend; para enforcement serio falta persistencia server-side.
- La duplicación raíz/public sigue existiendo; hoy está controlada por `scripts/sync-public.sh`, pero a mediano plazo conviene consolidar una sola fuente de build.

## Próximo nivel técnico razonable

1. Consolidar root/public en una sola fuente de render.
2. Persistir sesiones consumidas y protocolos en DB.
3. Implementar carrito/partner links reales.
4. QA móvil y funnel analytics por evento.
