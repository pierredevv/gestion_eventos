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
import {
  StorageService,
  type StorageBucket,
  type UploadObjectInput,
} from '../../src/common/storage/storage.service';
import { NotificationWorkerService } from '../../src/modules/notifications/notification-worker.service';

/** End-to-end coverage for ticket issuance, QR tokens and notification delivery. */

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

const REVIEWER_EMAIL = 'tickets-reviewer@example.com';
const REVIEWER_PASSWORD = 'ReviewerPass123!';

class InMemoryStorage extends StorageService {
  async upload(input: UploadObjectInput): Promise<void> {
    // Receipt content is irrelevant for ticket tests.
    void input;
  }
  async createSignedUrl(bucket: StorageBucket, key: string, _ttl: number): Promise<string> {
    return `https://storage.test/${bucket}/${key}?token=signed`;
  }
  async remove(): Promise<void> {}
}

class RecordingEmail extends EmailService {
  readonly sent: EmailMessage[] = [];
  override async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

function cookieValue(headers: Record<string, unknown>, name: string): string | undefined {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  for (const header of list) {
    const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match) return match[1];
  }
  return undefined;
}

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

describeWithDatabase('tickets and notifications', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let email: RecordingEmail;
  let eventId: string;
  let ticketTypeId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl, log: ['error'] });
    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;
    if (schema.at(0)?.current_schema !== 'test') {
      throw new Error('Refusing to run tickets tests outside the "test" schema');
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({ increment: async () => ({ totalHits: 0, timeToExpire: 0, isBlocked: false }) })
      .overrideProvider(EmailService)
      .useClass(RecordingEmail)
      .overrideProvider(StorageService)
      .useValue(new InMemoryStorage())
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    email = app.get<RecordingEmail>(EmailService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    email.sent.length = 0;
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

    const reviewerRole = await prisma.role.findUniqueOrThrow({
      where: { name: RoleName.PAYMENT_REVIEWER },
    });
    const creator = await prisma.user.create({
      data: {
        fullName: 'Ticket Test Creator',
        email: 'ticket-creator@example.com',
        passwordHash: await hashPassword('CreatorPass123!'),
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.user.create({
      data: {
        fullName: 'Ticket Reviewer',
        email: REVIEWER_EMAIL,
        passwordHash: await hashPassword(REVIEWER_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: reviewerRole.id } },
      },
    });

    const event = await prisma.event.create({
      data: {
        createdById: creator.id,
        slug: `ticket-event-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Ticket Test Event',
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
        price: 50.0,
        currency: 'BOB',
        capacity: 20,
        minPerOrder: 1,
        maxPerOrder: 10,
        salesStart: new Date('2026-01-01T00:00:00Z'),
        salesEnd: new Date('2028-01-01T19:00:00Z'),
      },
    });
    ticketTypeId = ticketType.id;
  });

  async function confirmOrder(quantity = 2, key = 'ticket-order-001') {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        eventId,
        idempotencyKey: key,
        buyerName: 'Luis Gomez',
        buyerEmail: 'luis@example.com',
        buyerPhone: '+59170000002',
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
      })
      .expect(201);

    const orderCode = created.body.order.orderCode as string;
    const orderToken = created.body.accessToken as string;

    const receipt = await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderCode}/payment-submissions`)
      .query({ token: orderToken })
      .field('declaredAmount', String(quantity * 50))
      .field('paymentReference', 'TXN-TICKET-001')
      .attach('receipt', pngBuffer(), { filename: 'receipt.png', contentType: 'image/png' })
      .expect(201);

    const agent = request.agent(app.getHttpServer());
    const health = await agent.get('/api/v1/health').expect(200);
    const csrf = cookieValue(health.headers as Record<string, unknown>, 'csrf_token');
    if (!csrf) throw new Error('CSRF cookie missing');
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: REVIEWER_EMAIL, password: REVIEWER_PASSWORD })
      .expect(200);

    await agent
      .patch(`/api/v1/admin/payments/submissions/${receipt.body.submission.id}/approve`)
      .set('X-CSRF-Token', csrf)
      .expect(200);

    return { orderCode, orderToken, orderId: created.body.order.id as string };
  }

  it('issues one ticket per attendee exactly once and delivers the portal link', async () => {
    const order = await confirmOrder(2);
    const worker = app.get(NotificationWorkerService);
    const processed = await worker.run();
    expect(processed).toBeGreaterThan(0);

    const tickets = await prisma.ticket.findMany({ where: { orderId: order.orderId } });
    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.map((ticket) => ticket.tokenHash)).size).toBe(2);
    expect(tickets.every((ticket) => ticket.status === 'VALID')).toBe(true);

    const deliveryEmail = email.sent.find((message) => message.subject.includes('Tus entradas'));
    expect(deliveryEmail).toBeDefined();
    const token = deliveryEmail?.text.match(/\/tickets\?token=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();

    const portal = await request(app.getHttpServer())
      .get('/api/v1/tickets')
      .query({ token })
      .expect(200);
    expect(portal.body.tickets).toHaveLength(2);
    for (const ticket of portal.body.tickets as Array<{ qrPayload: string; attendeeName: string }>) {
      expect(ticket.qrPayload).toMatch(/^EVT1:[A-Za-z0-9_-]{43}$/);
      expect(ticket.qrPayload).not.toContain(ticket.attendeeName);
    }

    // A second run must not issue duplicates or send a second delivery email.
    email.sent.length = 0;
    await worker.run();
    const after = await prisma.ticket.count({ where: { orderId: order.orderId } });
    expect(after).toBe(2);
    expect(email.sent.find((message) => message.subject.includes('Tus entradas'))).toBeUndefined();
  });

  it('rejects an invalid ticket link and allows a resend request', async () => {
    const order = await confirmOrder(1, 'ticket-order-resend');
    await app.get(NotificationWorkerService).run();
    email.sent.length = 0;

    await request(app.getHttpServer())
      .get('/api/v1/tickets')
      .query({ token: 'invalid-token' })
      .expect(404);

    const resend = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.orderCode}/tickets/resend`)
      .query({ token: order.orderToken })
      .expect(201);
    expect(resend.body.queued).toBe(true);

    await app.get(NotificationWorkerService).run();
    const tickets = await prisma.ticket.count({ where: { orderId: order.orderId } });
    expect(tickets).toBe(1);
    expect(email.sent.filter((message) => message.subject.includes('Tus entradas'))).toHaveLength(1);
  });
});
