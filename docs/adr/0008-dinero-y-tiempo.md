# ADR 0008 — Dinero y tiempo

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

El mercado inicial es Bolivia. El SRS prohíbe aritmética de punto flotante para importes y no
define zona horaria.

## Decisión

- Moneda `BOB`, almacenada como `NUMERIC(12,2)` y manejada con `Prisma.Decimal`. Nunca `number`
  para cálculo monetario.
- Una sola moneda por evento; las órdenes y sus ítems heredan esa moneda y se valida su igualdad.
- Fechas con `timestamptz` en PostgreSQL. Cada evento guarda su zona (`America/La_Paz` por
  defecto) y la interfaz renderiza en esa zona.
- Los precios se congelan en `order_items.unit_price` y el nombre del tipo en
  `order_items.ticket_type_name`, para que un cambio posterior no altere el histórico.

## Consecuencias

- Los reportes suman `Decimal` y formatean con `Intl.NumberFormat('es-BO', { currency: 'BOB' })`.
- El QR bancario estático y los montos se muestran con dos decimales exactos.
- Cambiar de moneda requiere migración de datos y decisión de negocio, no un ajuste de UI.
