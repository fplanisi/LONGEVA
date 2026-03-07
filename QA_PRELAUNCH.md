# QA pre-lanzamiento (Longevapp)

## Matriz de dispositivos

- iPhone: Safari (iOS)
- Android: Chrome
- Desktop: Chrome + Safari

## Flujos críticos (end-to-end)

### 1) Biblioteca → Plan

- Abrir `library.html`
- Buscar una molécula, abrir modal
- CTA “Agregar a mi protocolo personalizado” → navega a `stack-builder.html?molecule=...`
- Completar cuestionario mínimo
- Checkout → vuelta con `?paid=1&session_id=...`
- Generar protocolo (debe ser idempotente: recargar página no debe crear uno nuevo)

### 2) Nutrition → Plan

- Abrir `food-longevity.html`
- CTA hacia Plan (si aplica)
- Completar cuestionario y generar protocolo (con y sin `food_only`)

### 3) Plan → checkout → protocolo → replace/pdf/buy

- `stack-builder.html`
- Checkout start → Stripe → success → `checkout_success` track
- Generar protocolo → `protocol_generated` track
- Usar reemplazo 1 vez → `replace_used` track
- Exportar PDF ejecutivo → `pdf_exported` track
- Click en “Comprar ↗” (afiliado) y “Comprar stack completo ↗” (si aplica)

### 4) Biohacker → checkout → protocolo → pdf

- `biohacker-protocol.html`
- Checkout start → Stripe → success → `checkout_success` track
- Generar protocolo → `protocol_generated` track
- Exportar PDF → `pdf_exported` track

## Observabilidad mínima (qué mirar)

Eventos esperados en backend via `POST /api/track` (logs):

- `landing_view`
- `module_click`
- `checkout_start`
- `checkout_success`
- `protocol_generated`
- `replace_used`
- `pdf_exported`

Tip: en Vercel, filtrar logs por el prefijo `[LONGEVA_TRACK]`.
