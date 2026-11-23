# ADR 0010 — Estrategia de pruebas

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

El SRS exige pruebas en operaciones críticas y prohíbe declarar terminado algo que solo compila.
Las garantías de inventario, aprobación y check-in dependen del comportamiento de PostgreSQL, no de
la lógica en memoria.

## Decisión

Tres niveles:

1. **Unitarias (Jest):** reglas puras (cálculo de totales, normalización, validación de DTO,
   máquinas de estado). Sin base de datos.
2. **Integración (Jest + PostgreSQL real):** repositorios y transacciones contra un esquema `test`
   dedicado (`TEST_DATABASE_URL`). Incluye pruebas de concurrencia con `Promise.all` y conexiones
   independientes.
3. **E2E (opcional, Playwright):** flujo de compra y escaneo en navegador cuando exista UI.

## Pruebas obligatorias antes de cerrar cada fase

- Inventario: dos compras simultáneas de las últimas unidades → una sola confirma.
- Inventario: la reserva expira y libera cupos; una orden en `PENDING_REVIEW` no expira.
- Pagos: doble aprobación → un solo conjunto de tickets.
- Tickets: reintento de emisión no duplica (índice único parcial).
- Check-in: dos escaneos concurrentes → un solo ingreso.
- Invitado: no puede consultar una orden ajena con el código público.

## Consecuencias

- Sin `TEST_DATABASE_URL` las pruebas de integración se marcan como omitidas, no como aprobadas.
- Las pruebas nunca apuntan a la base de desarrollo.
- La CI debe proveer un PostgreSQL real (servicio o proyecto Supabase de test).
