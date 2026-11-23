# ADR 0011 — Cola durable de notificaciones y emisión idempotente de tickets

- **Estado:** Aceptado
- **Fecha:** 2026-11-23

## Contexto

La aprobación de un pago debe producir tickets y entregar el enlace del portal incluso si el
proveedor de correo falla o el proceso se reinicia. Al mismo tiempo, RF-13 exige poder reenviar
los tickets sin duplicarlos, y la invariante crítica prohíbe emitir dos tickets para el mismo
asistente.

## Decisión

- Cada operación de negocio crea un registro en `notification_jobs` dentro de la misma
  transacción que cambia el estado. La aprobación del pago encola `PAYMENT_APPROVED` y
  `TICKET_DELIVERY` con `dedupe_key` únicos por orden.
- Un trabajador programado (`@nestjs/schedule`) reclama trabajos con
  `SELECT ... FOR UPDATE SKIP LOCKED`, de modo que varias instancias de la API pueden ejecutarlo
  sin entregar el mismo mensaje dos veces. Los trabajos `PROCESSING` con más de 10 minutos se
  recuperan automáticamente.
- `TICKET_DELIVERY` llama a `TicketsService.issueForOrder`, que es idempotente: el índice único
  parcial `tickets_active_attendee_uq` impide duplicar un ticket activo por asistente aunque dos
  trabajadores procesen el mismo trabajo a la vez.
- El token del enlace de tickets se genera una sola vez y se guarda en el payload interno del
  trabajo. Un reintento reenvía el mismo enlace en lugar de revocar y reemplazar el anterior.
- Los reintentos usan retroceso exponencial acotado a 60 minutos; al agotar `max_attempts` el
  trabajo queda `DEAD` para inspección manual.
- El reenvío manual (`POST /orders/:code/tickets/resend`) crea un nuevo trabajo con un
  `dedupe_key` distinto; la emisión sigue siendo idempotente.

## Consecuencias

- Ningún correo depende de que la transacción HTTP siga viva.
- El payload del trabajo contiene el token de acceso en claro; es un dato interno y nunca se
  expone en respuestas públicas ni en logs. Si se rota la política de secretos, estos payloads
  deben purgarse tras `SENT`.
- El QR del ticket se regenera descifrando `token_ciphertext`; el token nunca se almacena en claro
  fuera del payload interno del trabajo de entrega.
