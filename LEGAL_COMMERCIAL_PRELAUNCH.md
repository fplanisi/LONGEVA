# Capa legal/comercial mínima (pre-tráfico pago)

## Dominio final

- Definir dominio principal (ej. `longevapp.com`) y redirecciones (www ↔ apex)
- Configurar `APP_URL` y `ALLOWED_ORIGIN` con el dominio final

## Analytics / funnel

- Confirmar que `POST /api/track` está recibiendo eventos en producción (logs)
- Asegurar que el funnel mínimo emite:
  - `landing_view`
  - `module_click`
  - `checkout_start`
  - `checkout_success`
  - `protocol_generated`
  - `replace_used`
  - `pdf_exported`

## Stripe (productos / precios definitivos)

- Crear Products/Prices finales (incluyendo combos)
- Setear:
  - `STRIPE_PRICE_ID_STACK`
  - `STRIPE_PRICE_ID_BIOHACKER`
  - `STRIPE_PRICE_ID_COMBO_DOUBLE`
  - `STRIPE_PRICE_ID_COMBO_BIOHACKER`
  - `STRIPE_PRICE_ID_NUTRITION` (si aplica)
- Verificar `success_url`/`cancel_url` contra dominio final

## Persistencia monetización (obligatoria)

- Activar Vercel KV (Upstash Redis)
- Setear:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- Validar comportamiento: **1 compra = 1 protocolo** (idempotente por `session_id`)

## Términos / privacidad / disclaimers

- Revisar `terms.html` y `privacy.html` (contenido + jurisdicción + contacto)
- Confirmar disclaimers consistentes:
  - en checkout/gates (links a términos/privacidad)
  - en outputs (stack + biohacker PDFs / print)

## Afiliados (mínimo viable)

- Configurar:
  - `IHERB_RCODE` o `AMAZON_ASSOC_TAG`
  - opcional: `AFFILIATE_LINKS_JSON` para mapeos explícitos
- Validar que links de compra pasen por `/api/partner-link`
