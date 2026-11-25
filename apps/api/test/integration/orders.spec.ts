import 'reflect-metadata';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient, RoleName } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../../src/app-config';
import { AppModule } from '../../src/app.module';
import { EmailService, type EmailMessage } from '../../src/common/email/email.service';
import { hashPassword } from '../../src/common/security/password';
import { OrderExpirationService } from '../../src/modules/orders/order-expiration.service';

/** End-to-end coverage for order creation, inventory and access control. */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

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
  'sessions',
  'verification_tokens',
  'user_roles',
  'roles',
  'users',
] as const;

type Agent = ReturnType<typeof request.agent>;

function cookieValue(headers: Record<string, unknown>, name: string): string | undefined {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  for (const header of list) {
    const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match) return match[1];
  }
  return undefined;
}

describeWithDatabase('orders and inventory', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let eventId: string;
  let ticketTypeId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl, log: ['error'] });
    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;
    if (schema.at(0)?.current_schema !== 'test') {
      throw new Error('Refusing to run orders tests outside the "test" schema');
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({ increment: async () => ({ totalHits: 0, timeToExpire: 0, isBlocked: false }) })
      .overrideProvider(EmailService)
      .useValue({ send: async (_message: EmailMessage) => undefined })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );

    for (const name of Object.values(RoleName)) {
      await prisma.role.upsert({
        where: { name },
        create: { name, description: `Test role ${name}` },
        update: {},
      });
    }

    const user = await prisma.user.create({
      data: {
        fullName: 'Order Test Creator',
        email: 'order-creator@example.com',
        passwordHash: await hashPassword('CreatorPass123!'),
        emailVerifiedAt: new Date(),
      },
    });

    const event = await prisma.event.create({
      data: {
        createdById: user.id,
        slug: `test-event-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Test Event',
        description: 'Test description',
        location: 'Test Venue',
        address: 'Test Address',
        capacity: 100,
        startDate: new Date('2028-01-01T20:00:00Z'),
        endDate: new Date('2028-01-01T23:00:00Z'),
        registrationStart: new Date('2026-01-01T00:00:00Z'),
        registrationEnd: new Date('2028-01-01T19:00:00Z'),
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    eventId = event.id;

    const ticketType = await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: 'General',
        price: 150.5,
        currency: 'BOB',
        capacity: 5,
        minPerOrder: 1,
        maxPerOrder: 10,
        salesStart: new Date('2026-01-01T00:00:00Z'),
        salesEnd: new Date('2028-01-01T19:00:00Z'),
      },
    });
    ticketTypeId = ticketType.id;
  });

  function orderPayload(quantity = 2, idempotencyKey?: string) {
    return {
      eventId,
      idempotencyKey,
      buyerName: 'Juan Perez',
      buyerEmail: 'juan@example.com',
      buyerPhone: '+59170000000',
      items: [
        {
          ticketTypeId,
          quantity,
          attendees: Array.from({ length: quantity }, (_, index) => ({
            fullName: `Attendee ${index + 1}`,
            email: `attendee${index + 1}@example.com`,
          })),
        },
      ],
    };
  }

  async function csrfFor(agent: Agent): Promise<string> {
    const health = await agent.get('/api/v1/health').expect(200);
    const csrf = cookieValue(health.headers as Record<string, unknown>, 'csrf_token');
    if (!csrf) throw new Error('CSRF cookie missing');
    return csrf;
  }

  it('creates an order with server-side pricing and reserves inventory', async () => {
    const agent = request.agent(app.getHttpServer());
    const csrf = await csrfFor(agent);

    const response = await agent
      .post('/api/v1/orders')
      .set('X-CSRF-Token', csrf)
      .send(orderPayload(2, 'idem-create-001'))
      .expect(201);

    expect(response.body.order.totalAmount).toBe('301.00');
    expect(response.body.order.subtotal).toBe('301.00');
    expect(response.body.order.status).toBe('PENDING_PAYMENT');
    expect(response.body.order.items[0].attendees).toHaveLength(2);
    expect(response.body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const stored = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(stored.reservedQuantity).toBe(2);
    expect(stored.soldQuantity).toBe(0);

    const reservation = await prisma.inventoryReservation.findFirstOrThrow({
      where: { ticketTypeId },
    });
    expect(reservation.quantity).toBe(2);
    expect(reservation.status).toBe('ACTIVE');
  });

  it('rejects blank attendee details when the event requires them', async () => {
    const payload = orderPayload(1, 'idem-required-details');
    payload.items[0]!.attendees[0]!.fullName = '';
    payload.items[0]!.attendees[0]!.email = '';

    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(payload)
      .expect(400);

    expect(response.body.code).toBe('ATTENDEE_DETAILS_REQUIRED');
  });

  it('accepts blank attendee details when the event makes them optional', async () => {
    await prisma.event.update({
      where: { id: eventId },
      data: { requireAttendeeDetails: false },
    });

    const payload = orderPayload(1, 'idem-optional-details');
    payload.items[0]!.attendees[0]!.fullName = '';
    payload.items[0]!.attendees[0]!.email = '';

    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(payload)
      .expect(201);

    expect(response.body.order.items[0].attendees[0]).toMatchObject({
      fullName: null,
      email: null,
    });

    const storedAttendee = await prisma.attendee.findFirstOrThrow({
      where: { orderItem: { orderId: response.body.order.id } },
    });
    expect(storedAttendee.fullName).toBeNull();
    expect(storedAttendee.email).toBeNull();
  });

  it('derives attendees from the buyer and ignores client attendees for personal purchases', async () => {
    await prisma.event.update({
      where: { id: eventId },
      data: { personalPurchase: true },
    });

    const payload = {
      ...orderPayload(2, 'idem-personal-001'),
      items: [
        {
          ticketTypeId,
          quantity: 2,
          attendees: [{ fullName: 'Intruso', email: 'intruso@example.com' }],
        },
      ],
    };

    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(payload)
      .expect(201);

    expect(response.body.order.items[0].attendees).toHaveLength(2);
    for (const attendee of response.body.order.items[0].attendees) {
      expect(attendee.fullName).toBe('Juan Perez');
      expect(attendee.email).toBe('juan@example.com');
      expect(attendee.phone).toBe('+59170000000');
    }

    const stored = await prisma.attendee.findMany({
      where: { orderItem: { orderId: response.body.order.id } },
    });
    expect(stored.map((attendee) => attendee.fullName)).toEqual(['Juan Perez', 'Juan Perez']);
  });

  it('reserves multiple ticket types in one atomic batch', async () => {
    const second = await prisma.ticketType.create({
      data: {
        eventId,
        name: 'VIP',
        price: 200,
        currency: 'BOB',
        capacity: 5,
        minPerOrder: 1,
        maxPerOrder: 10,
        salesStart: new Date('2026-01-01T00:00:00Z'),
        salesEnd: new Date('2028-01-01T19:00:00Z'),
      },
    });
    const payload = orderPayload(1, 'idem-batch-001');
    payload.items.push({
      ticketTypeId: second.id,
      quantity: 2,
      attendees: [
        { fullName: 'Attendee VIP 1', email: 'vip1@example.com' },
        { fullName: 'Attendee VIP 2', email: 'vip2@example.com' },
      ],
    });

    await request(app.getHttpServer()).post('/api/v1/orders').send(payload).expect(201);

    for (const [id, quantity] of [
      [ticketTypeId, 1],
      [second.id, 2],
    ] as const) {
      const stored = await prisma.ticketType.findUniqueOrThrow({ where: { id } });
      expect(stored.reservedQuantity).toBe(quantity);
    }
  });

  it('rejects duplicate ticket types in one order', async () => {
    const payload = orderPayload(1, 'idem-duplicate-001');
    payload.items.push({
      ticketTypeId,
      quantity: 1,
      attendees: [{ fullName: 'Attendee 2', email: 'attendee2@example.com' }],
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(payload)
      .expect(400);

    expect(response.body.code).toBe('DUPLICATE_TICKET_TYPE');
  });

  it('rejects concurrent orders that exceed available stock', async () => {
    const results = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/orders').send(orderPayload(4, 'idem-race-001')),
      request(app.getHttpServer()).post('/api/v1/orders').send(orderPayload(4, 'idem-race-002')),
    ]);

    // No CSRF token is needed for these two because the guard only checks
    // double-submit when a session cookie is present; there is none here.
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(results.find((result) => result.status === 409)?.body.code).toBe('INSUFFICIENT_STOCK');

    const stored = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(stored.reservedQuantity).toBe(4);
    expect(stored.reservedQuantity + stored.soldQuantity).toBeLessThanOrEqual(stored.capacity);
  });

  it('returns the same order for an idempotency-key replay', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(orderPayload(1, 'idem-replay-001'))
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(orderPayload(1, 'idem-replay-001'))
      .expect(201);

    expect(second.body.order.id).toBe(first.body.order.id);
    expect(second.body.accessToken).toBe('');

    const count = await prisma.order.count();
    expect(count).toBe(1);
  });

  it('protects guest orders from access by other guests', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(orderPayload(1, 'idem-access-001'))
      .expect(201);
    const code = created.body.order.orderCode as string;
    const token = created.body.accessToken as string;

    await request(app.getHttpServer()).get(`/api/v1/orders/${code}`).expect(404);

    const withToken = await request(app.getHttpServer())
      .get(`/api/v1/orders/${code}`)
      .query({ token })
      .expect(200);
    expect(withToken.body.order.orderCode).toBe(code);
  });

  it('cancelling an order releases its inventory', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(orderPayload(3, 'idem-cancel-001'))
      .expect(201);
    const code = created.body.order.orderCode as string;
    const token = created.body.accessToken as string;

    const agent = request.agent(app.getHttpServer());
    const csrf = await csrfFor(agent);
    await agent
      .post(`/api/v1/orders/${code}/cancel`)
      .query({ token })
      .set('X-CSRF-Token', csrf)
      .expect(201);

    const stored = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(stored.reservedQuantity).toBe(0);

    const order = await prisma.order.findFirstOrThrow({ where: { orderCode: code } });
    expect(order.status).toBe('CANCELLED');
    expect(order.cancelledAt).not.toBeNull();
  });

  it('expiration job releases stock from abandoned orders', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(orderPayload(2, 'idem-expire-001'))
      .expect(201);
    expect(created.body.order.status).toBe('PENDING_PAYMENT');

    // Force the reservation window into the past.
    await prisma.order.update({
      where: { id: created.body.order.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await prisma.inventoryReservation.updateMany({
      where: { orderId: created.body.order.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expiration = app.get(OrderExpirationService);
    await expiration.expireAbandonedOrders();

    const stored = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(stored.reservedQuantity).toBe(0);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: created.body.order.id } });
    expect(order.status).toBe('EXPIRED');
    expect(order.expiredAt).not.toBeNull();
  });
});
