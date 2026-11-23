# ADR 0012 — Check-in: ventana temporal, auditoría y uso único

- **Estado:** Aceptado
- **Fecha:** 2026-11-23

## Contexto

El control de acceso debe impedir que una misma entrada permita dos ingresos, incluso si dos
escáneres leen el mismo QR al mismo tiempo. También debe evitar check-ins arbitrarios fuera del
horario del evento, sin dejar sin capacidad operativa a los organizadores ante imprevistos.

## Decisión

- El QR contiene un token opaco de 256 bits. El escáner puede hacer una vista previa
  (`POST /admin/check-in/preview`) antes de confirmar; la búsqueda usa el hash SHA-256 del token,
  nunca el token en claro (ADR 0006).
- El personal autorizado también puede buscar por `ticket_code` legible como respaldo.
- La ventana permitida es `[inicio − 2 h, fin + 1 h]`, configurable mediante
  `CHECKIN_WINDOW_BEFORE_HOURS` y `CHECKIN_WINDOW_AFTER_HOURS` (ADR 0008).
- Fuera de la ventana se exige `override: true` **y** una razón de al menos 3 caracteres. El
  check-in forzado se registra con la acción de auditoría `CHECK_IN_OVERRIDE` y la razón en los
  metadatos.
- El registro de check-in y el cambio de estado del ticket a `USED` ocurren en la misma transacción.
  Se adquiere `SELECT ... FOR UPDATE` sobre la fila del ticket y el índice único de `check_ins`
  sobre `ticket_id` actúa como segunda barrera: solo una de dos peticiones concurrentes puede
  completarse; la otra recibe `409 TICKET_ALREADY_USED`.
- Se registran IP, agente de usuario e identificador de petición para cada check-in.

## Consecuencias

- La concurrencia se resuelve en la base de datos, no con estado en memoria: funciona con varias
  instancias de la API y con varios escáneres.
- Un ticket `CANCELLED` o `USED` nunca se puede volver a usar; reemitirlo implica crear un ticket
  nuevo para el asistente.
- El endpoint de listado por evento permite cuadrar asistencia con entradas vendidas.
