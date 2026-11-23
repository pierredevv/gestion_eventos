# ADR 0009 — Rechazo de comprobantes y reintentos

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

RF-07 define `REJECTED` como estado definitivo de la orden, mientras RF-11 permite reenviar un
comprobante cuando el pago fue rechazado. Ambas reglas no pueden cumplirse a la vez sin una
política explícita.

## Decisión

- El rechazo se registra sobre el **envío** (`payment_submissions.review_status = REJECTED`) con
  motivo obligatorio y auditoría.
- La orden vuelve a `PENDING_PAYMENT` con `payment_attempts + 1` y un nuevo plazo de
  `PAYMENT_RETRY_WINDOW_HOURS`.
- La reserva se mantiene durante la ventana de reintento (`HELD_FOR_REVIEW`); si el comprador no
  envía un nuevo comprobante, expira y los cupos se liberan.
- Al alcanzar `PAYMENT_RETRY_MAX_ATTEMPTS` (por defecto 2), la orden pasa a `REJECTED`
  definitivamente.
- Cada envío es inmutable: nunca se sobrescribe el archivo anterior.

## Consecuencias

- El comprador sabe cuántos intentos le quedan y hasta cuándo.
- Nunca se emiten tickets antes de una aprobación.
- El estado de la orden y el del pago se actualizan en la misma transacción.
