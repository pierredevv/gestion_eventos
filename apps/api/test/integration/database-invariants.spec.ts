import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Integration tests for the PostgreSQL guarantees that the application relies on.
 *
 * They run against the dedicated `test` schema of the Supabase project
 * (`TEST_DATABASE_URL`). Without that variable the suite is skipped, never
 * reported as passing (see ADR 0010).
 *
 * These tests intentionally bypass the NestJS services: the objective is to
 * prove that the database itself rejects invalid states, so a bug in a service
 * can never turn into overselling, duplicated tickets or double check-ins.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

jest.setTimeout(90_000);

const TABLES = [
  'audit_logs',
  'check_ins',
  'notification_jobs',
  'order_access_tokens',
  'tickets',
  'payment_submissions',
  'payments',
  'inventory_reservations',
  'attendees',
  'order_items',
  'orders',
  'ticket_types',
  'events',
  'verification_tokens',
  'sessions',
  'user_roles',
  'roles',
  'users',
] as const;

describeWithDatabase('database invariants', () => {
  let prisma: PrismaClient;
  let sequence = 0;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl, log: ['error'] });

    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;

    // Hard guard: never truncate the development or production schema.
    if (schema.at(0)?.current_schema !== 'test') {
      throw new Error(
        `Refusing to run destructive tests outside the "test" schema (got "${schema.at(0)?.current_schema}")`,
      );
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  });

  const nextId = (prefix: string): string => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };

  async function createEvent(): Promise<{ eventId: string; userId: string }> {
    const suffix = nextId('event');
    const user = await prisma.user.create({
      data: {
        fullName: 'Test Creator',
        email: `${suffix}@example.com`,
        passwordHash: 'x'.repeat(60),
      },
    });

    const event = await prisma.event.create({
      data: {
        createdById: user.id,
        slug: suffix,
        title: 'Test event',
        description: 'Integration test event',
        location: 'La Paz',
        address: 'Calle 1 #123',
        startDate: new Date('2027-01-10T20:00:00.000Z'),
        endDate: new Date('2027-01-10T23:59:00.000Z'),
        registrationStart: new Date('2026-01-01T00:00:00.000Z'),
        registrationEnd: new Date('2027-01-09T00:00:00.000Z'),
      },
    });

    return { eventId: event.id, userId: user.id };
  }

  async function createTicketType(
    eventId: string,
    overrides: Partial<{ capacity: number; name: string }> = {},
  ) {
    return prisma.ticketType.create({
      data: {
        eventId,
        name: overrides.name ?? `General ${nextId('tt')}`,
        price: new Prisma.Decimal('50.00'),
        capacity: overrides.capacity ?? 10,
        salesStart: new Date(Date.now() - 3_600_000),
        salesEnd: new Date(Date.now() + 3_600_000),
      },
    });
  }

  async function createOrder(eventId: string) {
    const suffix = nextId('order');
    return prisma.order.create({
      data: {
        eventId,
        orderCode: suffix.toUpperCase(),
        buyerName: 'Buyer',
        buyerEmail: `${suffix}@example.com`,
        buyerPhone: '+59170000000',
        subtotal: new Prisma.Decimal('100.00'),
        totalAmount: new Prisma.Decimal('100.00'),
      },
    });
  }

  /**
   * The exact conditional statement from ADR 0005. Returns how many rows were
   * updated (0 means "not enough stock").
   */
  async function reserveStock(ticketTypeId: string, quantity: number): Promise<number> {
    return prisma.$executeRaw`
      UPDATE "ticket_types"
      SET "reserved_quantity" = "reserved_quantity" + ${quantity}
      WHERE "id" = ${ticketTypeId}::uuid
        AND "is_active"
        AND now() BETWEEN "sales_start" AND "sales_end"
        AND "reserved_quantity" + "sold_quantity" + ${quantity} <= "capacity"
    `;
  }

  it('runs in the dedicated test schema', async () => {
    const rows = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;
    expect(rows.at(0)?.current_schema).toBe('test');
  });

  it('never oversells under concurrent purchases', async () => {
    const { eventId } = await createEvent();
    const ticketType = await createTicketType(eventId, { capacity: 5 });

    const results = await Promise.all([
      reserveStock(ticketType.id, 4),
      reserveStock(ticketType.id, 4),
    ]);

    expect(results.filter((affected) => affected === 1)).toHaveLength(1);

    const stored = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(stored.reservedQuantity).toBe(4);
    expect(stored.reservedQuantity + stored.soldQuantity).toBeLessThanOrEqual(stored.capacity);
  });

  it('rejects counters that exceed capacity', async () => {
    const { eventId } = await createEvent();
    const ticketType = await createTicketType(eventId, { capacity: 3 });

    await expect(
      prisma.ticketType.update({
        where: { id: ticketType.id },
        data: { soldQuantity: 4 },
      }),
    ).rejects.toThrow(/no_oversell|check constraint/i);
  });

  it('rejects negative inventory counters', async () => {
    const { eventId } = await createEvent();
    const ticketType = await createTicketType(eventId);

    await expect(
      prisma.ticketType.update({
        where: { id: ticketType.id },
        data: { reservedQuantity: -1 },
      }),
    ).rejects.toThrow(/capacity_check|check constraint/i);
  });

  it('rejects inconsistent order totals', async () => {
    const { eventId } = await createEvent();

    await expect(
      prisma.order.create({
        data: {
          eventId,
          orderCode: 'BROKEN-TOTAL',
          buyerName: 'Buyer',
          buyerEmail: 'buyer@example.com',
          buyerPhone: '+59170000000',
          subtotal: new Prisma.Decimal('100.00'),
          totalAmount: new Prisma.Decimal('80.00'),
        },
      }),
    ).rejects.toThrow(/amounts_check|check constraint/i);
  });

  it('rejects non-lowercase emails', async () => {
    await expect(
      prisma.user.create({
        data: {
          fullName: 'Mixed Case',
          email: 'Mixed.Case@Example.com',
          passwordHash: 'x'.repeat(60),
        },
      }),
    ).rejects.toThrow(/lowercase_check|check constraint/i);
  });

  it('keeps at most one active ticket per attendee and allows reissue after cancellation', async () => {
    const { eventId } = await createEvent();
    const ticketType = await createTicketType(eventId);
    const order = await createOrder(eventId);

    const item = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        quantity: 1,
        unitPrice: ticketType.price,
        subtotal: ticketType.price,
      },
    });

    const attendee = await prisma.attendee.create({
      data: {
        orderItemId: item.id,
        unitIndex: 0,
        fullName: 'Attendee',
        email: 'attendee@example.com',
      },
    });

    const baseTicket = {
      orderId: order.id,
      attendeeId: attendee.id,
      ticketTypeId: ticketType.id,
      tokenCiphertext: 'ciphertext',
    };

    const first = await prisma.ticket.create({
      data: { ...baseTicket, ticketCode: 'T-1', tokenHash: 'a'.repeat(64) },
    });

    await expect(
      prisma.ticket.create({
        data: { ...baseTicket, ticketCode: 'T-2', tokenHash: 'b'.repeat(64) },
      }),
    ).rejects.toThrow(/active_attendee|unique constraint/i);

    await prisma.ticket.update({
      where: { id: first.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    const reissued = await prisma.ticket.create({
      data: { ...baseTicket, ticketCode: 'T-3', tokenHash: 'c'.repeat(64) },
    });

    expect(reissued.status).toBe('VALID');
  });

  it('rejects malformed ticket tokens', async () => {
    const { eventId } = await createEvent();
    const ticketType = await createTicketType(eventId);
    const order = await createOrder(eventId);
    const item = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        quantity: 1,
        unitPrice: ticketType.price,
        subtotal: ticketType.price,
      },
    });
    const attendee = await prisma.attendee.create({
      data: {
        orderItemId: item.id,
        unitIndex: 0,
        fullName: 'Attendee',
        email: 'attendee2@example.com',
      },
    });

    await expect(
      prisma.ticket.create({
        data: {
          orderId: order.id,
          attendeeId: attendee.id,
          ticketTypeId: ticketType.id,
          ticketCode: 'T-BAD',
          tokenHash: 'not-a-hash',
          tokenCiphertext: 'ciphertext',
        },
      }),
    ).rejects.toThrow(/token_hash_check|check constraint/i);
  });

  it('allows only one check-in per ticket even with concurrent scans', async () => {
    const { eventId, userId } = await createEvent();
    const ticketType = await createTicketType(eventId);
    const order = await createOrder(eventId);
    const item = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        quantity: 1,
        unitPrice: ticketType.price,
        subtotal: ticketType.price,
      },
    });
    const attendee = await prisma.attendee.create({
      data: {
        orderItemId: item.id,
        unitIndex: 0,
        fullName: 'Attendee',
        email: 'attendee3@example.com',
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        orderId: order.id,
        attendeeId: attendee.id,
        ticketTypeId: ticketType.id,
        ticketCode: 'T-4',
        tokenHash: 'd'.repeat(64),
        tokenCiphertext: 'ciphertext',
      },
    });

    const results = await Promise.allSettled([
      prisma.checkIn.create({ data: { ticketId: ticket.id, checkedById: userId } }),
      prisma.checkIn.create({ data: { ticketId: ticket.id, checkedById: userId } }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(prisma.checkIn.count({ where: { ticketId: ticket.id } })).resolves.toBe(1);
  });

  it('allows only one receipt awaiting review per payment', async () => {
    const { eventId } = await createEvent();
    const order = await createOrder(eventId);
    const payment = await prisma.payment.create({
      data: { orderId: order.id, amount: new Prisma.Decimal('100.00') },
    });

    const submission = {
      paymentId: payment.id,
      receiptFileKey: 'receipts/test.png',
      receiptMimeType: 'image/png',
      receiptSize: 1024,
      receiptSha256: 'e'.repeat(64),
      declaredAmount: new Prisma.Decimal('100.00'),
    };

    const first = await prisma.paymentSubmission.create({ data: submission });

    await expect(prisma.paymentSubmission.create({ data: submission })).rejects.toThrow(
      /single_pending|unique constraint/i,
    );

    await prisma.paymentSubmission.update({
      where: { id: first.id },
      data: { reviewStatus: 'SUPERSEDED' },
    });

    const second = await prisma.paymentSubmission.create({ data: submission });
    expect(second.reviewStatus).toBe('PENDING');
  });

  it('requires reviewer and receipt evidence to approve a payment', async () => {
    const { eventId } = await createEvent();
    const order = await createOrder(eventId);
    const payment = await prisma.payment.create({
      data: { orderId: order.id, amount: new Prisma.Decimal('100.00') },
    });

    await expect(
      prisma.payment.update({ where: { id: payment.id }, data: { status: 'APPROVED' } }),
    ).rejects.toThrow(/review_evidence_check|check constraint/i);
  });

  it('makes the audit log append-only', async () => {
    const log = await prisma.auditLog.create({
      data: { action: 'TEST', entityType: 'event', entityId: 'one' },
    });

    await expect(
      prisma.auditLog.update({ where: { id: log.id }, data: { action: 'TAMPERED' } }),
    ).rejects.toThrow(/append-only/);

    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
  });

  it('rejects sessions with inconsistent expiry dates', async () => {
    const user = await prisma.user.create({
      data: {
        fullName: 'Session User',
        email: 'session@example.com',
        passwordHash: 'x'.repeat(60),
      },
    });

    await expect(
      prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: 'f'.repeat(64),
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          expiresAt: new Date('2026-05-01T00:00:00.000Z'),
          absoluteExpiresAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toThrow(/expiry_check|check constraint/i);
  });
});
