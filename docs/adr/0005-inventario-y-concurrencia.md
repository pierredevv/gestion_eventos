# ADR 0005 — Inventario: contadores protegidos y reservas atómicas

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

El SRS exige que nunca se vendan más entradas que las disponibles, incluso con compras
simultáneas, y que una orden con comprobante en revisión conserve sus cupos.

Dos fuentes de verdad (`ticket_types.sold_quantity/reserved_quantity` e
`inventory_reservations`) pueden desincronizarse si se actualizan con lógica de aplicación.

## Decisión

- `inventory_reservations` es la bitácora de cada retención; `ticket_types` mantiene contadores
  agregados para consultas rápidas y disponibilidad.
- La reserva se hace con **una sola sentencia condicional** por tipo de entrada:

  ```sql
  UPDATE ticket_types
  SET reserved_quantity = reserved_quantity + $2
  WHERE id = $1
    AND is_active
    AND now() BETWEEN sales_start AND sales_end
    AND reserved_quantity + sold_quantity + $2 <= capacity
  RETURNING reserved_quantity, sold_quantity, capacity;
  ```

  Cero filas significa stock insuficiente y toda la orden se revierte.
- Los tipos se bloquean en orden determinista (`ORDER BY id`) para evitar deadlocks.
- PostgreSQL impone `CHECK (reserved_quantity >= 0 AND sold_quantity >= 0 AND
  reserved_quantity + sold_quantity <= capacity)` como última línea de defensa.
- La confirmación mueve cantidades en **un solo UPDATE** (`sold += q`, `reserved -= q`) para no
  violar el CHECK de forma intermedia.
- Un job libera reservas con `FOR UPDATE SKIP LOCKED` y solo toca órdenes cuyo estado sigue siendo
  `PENDING_PAYMENT`; una orden en `PENDING_REVIEW` nunca expira.
- Un test de concurrencia con PostgreSQL real valida: 5 cupos, dos compras simultáneas de 4 →
  exactamente una se confirma.

## Consecuencias

- La disponibilidad se calcula como `capacity - reserved - sold`; no se almacena.
- Cualquier ajuste manual de capacidad debe validarse contra `reserved + sold` y auditarse.
- Se añade una consulta de reconciliación (contadores vs. suma de reservas) para detectar deriva.
