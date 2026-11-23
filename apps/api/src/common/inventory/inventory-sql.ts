import { Prisma } from '@prisma/client';

/**
 * Atomic inventory primitives from ADR 0005.
 *
 * Each statement is a single conditional UPDATE: PostgreSQL locks the row,
 * re-checks the predicate and increments/decrements in one step. No read-then-
 * write sequence can oversell, even when many requests race for the same stock.
 * Every caller runs these inside an interactive transaction.
 */

/** Returns 1 when stock was reserved, 0 when the ticket type is unavailable. */
export function reserveStock(
  tx: Prisma.TransactionClient,
  ticketTypeId: string,
  quantity: number,
): Promise<number> {
  return tx.$executeRaw`
    UPDATE "ticket_types"
    SET "reserved_quantity" = "reserved_quantity" + ${quantity}
    WHERE "id" = ${ticketTypeId}::uuid
      AND "is_active"
      AND now() BETWEEN "sales_start" AND "sales_end"
      AND "reserved_quantity" + "sold_quantity" + ${quantity} <= "capacity"
  `;
}

/** Returns 1 when a reservation was released, 0 when the counter was inconsistent. */
export function releaseStock(
  tx: Prisma.TransactionClient,
  ticketTypeId: string,
  quantity: number,
): Promise<number> {
  return tx.$executeRaw`
    UPDATE "ticket_types"
    SET "reserved_quantity" = "reserved_quantity" - ${quantity}
    WHERE "id" = ${ticketTypeId}::uuid
      AND "reserved_quantity" >= ${quantity}
  `;
}

/** Moves reserved stock into sold stock when a payment is approved. */
export function consumeStock(
  tx: Prisma.TransactionClient,
  ticketTypeId: string,
  quantity: number,
): Promise<number> {
  return tx.$executeRaw`
    UPDATE "ticket_types"
    SET "reserved_quantity" = "reserved_quantity" - ${quantity},
        "sold_quantity" = "sold_quantity" + ${quantity}
    WHERE "id" = ${ticketTypeId}::uuid
      AND "reserved_quantity" >= ${quantity}
  `;
}
