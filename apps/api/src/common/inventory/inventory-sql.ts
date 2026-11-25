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

/**
 * Reserves several ticket types in one atomic statement. Callers must pass each
 * ticket type at most once; PostgreSQL would otherwise use an arbitrary row
 * from the VALUES list for the same target row.
 */
export async function reserveStockBatch(
  tx: Prisma.TransactionClient,
  items: ReadonlyArray<{ ticketTypeId: string; quantity: number }>,
): Promise<number> {
  if (items.length === 0) return 0;

  const values = Prisma.join(
    items.map((item) => Prisma.sql`(${item.ticketTypeId}::uuid, ${item.quantity}::int)`),
  );
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "ticket_types" AS tt
    SET "reserved_quantity" = tt."reserved_quantity" + v."quantity"
    FROM (VALUES ${values}) AS v("id", "quantity")
    WHERE tt."id" = v."id"
      AND tt."is_active"
      AND now() BETWEEN tt."sales_start" AND tt."sales_end"
      AND tt."reserved_quantity" + tt."sold_quantity" + v."quantity" <= tt."capacity"
    RETURNING tt."id"
  `;
  return rows.length;
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
