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

/** End-to-end coverage for the scanner flow and the no-double-check-in invariant. */

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

const REVIEWER_EMAIL = 'checkin-reviewer@example.com';
const REVIEWER_PASSWORD = 'ReviewerPass123!';
const STAFF_EMAIL = 'checkin-staff@example.com';
const STAFF_PASSWORD = 'StaffPass123!';

class InMemoryStorage extends StorageService {
  async upload(input: UploadObjectInput): Promise<void> {
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

describeWithDatabase('check-in', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let email: RecordingEmail;
  let staffId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl, log: ['error'] });
    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;
    if (schema.at(0)?.current_schema !== 'test') {
      throw new Error('Refusing to run check-in tests outside the "test" schema');
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

    const roles = await prisma.role.findMany();
    const roleId = (name: RoleName): string => {
      const role = roles.find((candidate) => candidate.name === name);
      if (!role) throw new Error(`Role ${name} was not seeded`);
      return role.id;
    };

    await prisma.user.create({
      data: {
        fullName: 'Check-in Test Creator',
        email: 'checkin-creator@example.com',
        passwordHash: await hashPassword('CreatorPass123!'),
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.user.create({
      data: {
        fullName: 'Check-in Reviewer',
        email: REVIEWER_EMAIL,
        passwordHash: await hashPassword(REVIEWER_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: roleId(RoleName.PAYMENT_REVIEWER) } },
      },
    });
    const staff = await prisma.user.create({
      data: {
        fullName: 'Check-in Staff',
        email: STAFF_EMAIL,
        passwordHash: await hashPassword(STAFF_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: roleId(RoleName.CHECK_IN_STAFF) } },
      },
    });
    staffId = staff.id;
  });

  async function seedEvent(startsInMinutes: number, durationMinutes: number) {
    const start = new Date(Date.now() + startsInMinutes * 60_000);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const creator = await prisma.user.findFirstOrThrow({
      where: { email: 'checkin-creator@example.com' },
    });
    const event = await prisma.event.create({
      data: {
        createdById: creator.id,
        slug: `checkin-event-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Check-in Test Event',
        description: 'Test description',
        location: 'Test Venue',
        address: 'Test Address',
        capacity: 100,
        startDate: start,
        endDate: end,
        registrationStart: new Date(Date.now() - 86_400_000),
        registrationEnd: new Date(end.getTime() + 3_600_000),
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    const ticketType = await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: 'General',
        price: 50.0,
        currency: 'BOB',
        capacity: 20,
        minPerOrder: 1,
        maxPerOrder: 10,
        salesStart: new Date(Date.now() - 43_200_000),
        salesEnd: new Date(end.getTime() + 1_800_000),
      },
    });
    return { eventId: event.id, ticketTypeId: ticketType.id };
  }

  async function confirmOrder(eventId: string, ticketTypeId: string, key: string) {
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
            quantity: 1,
            attendees: [{ fullName: 'Ana Rojas', email: 'ana@example.com' }],
          },
        ],
      })
      .expect(201);

    const orderCode = created.body.order.orderCode as string;
    const orderToken = created.body.accessToken as string;
    const orderId = created.body.order.id as string;

    const receipt = await request(app.getHttpServer())
      .post(`/api/v1/orders/${orderCode}/payment-submissions`)
      .query({ token: orderToken })
      .field('declaredAmount', '50')
      .field('paymentReference', 'TXN-CHECKIN-001')
      .attach('receipt', pngBuffer(), { filename: 'receipt.png', contentType: 'image/png' })
      .expect(201);

    const reviewer = await login(REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await reviewer.agent
      .patch(`/api/v1/admin/payments/submissions/${receipt.body.submission.id}/approve`)
      .set('X-CSRF-Token', reviewer.csrf)
      .expect(200);

    return { orderCode, orderToken, orderId };
  }

  async function login(emailAddress: string, password: string) {
    const agent = request.agent(app.getHttpServer());
    const health = await agent.get('/api/v1/health').expect(200);
    const csrf = cookieValue(health.headers as Record<string, unknown>, 'csrf_token');
    if (!csrf) throw new Error('CSRF cookie missing');
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: emailAddress, password })
      .expect(200);
    return { agent, csrf };
  }

  /** Confirms an order, issues tickets and returns the QR payload of the first ticket. */
  async function issuedTicket(eventId: string, ticketTypeId: string, key: string) {
    const order = await confirmOrder(eventId, ticketTypeId, key);
    await app.get(NotificationWorkerService).run();

    const deliveryEmail = email.sent.find((message) => message.subject.includes('Tus entradas'));
    const token = deliveryEmail?.text.match(/\/tickets\?token=([A-Za-z0-9_-]+)/)?.[1];
    if (!token) throw new Error('Ticket delivery email missing');

    const portal = await request(app.getHttpServer())
      .get('/api/v1/tickets')
      .query({ token })
      .expect(200);
    const ticket = portal.body.tickets[0] as { ticketCode: string; qrPayload: string };
    const row = await prisma.ticket.findFirstOrThrow({ where: { orderId: order.orderId } });
    return { ...order, ticketId: row.id, ticketCode: ticket.ticketCode, qrPayload: ticket.qrPayload };
  }

  it('previews, checks in within the window and rejects a second use', async () => {
    const { eventId, ticketTypeId } = await seedEvent(-30, 150);
    const ticket = await issuedTicket(eventId, ticketTypeId, 'checkin-order-001');
    const staff = await login(STAFF_EMAIL, STAFF_PASSWORD);

    const preview = await staff.agent
      .post('/api/v1/admin/check-in/preview')
      .set('X-CSRF-Token', staff.csrf)
      .send({ token: ticket.qrPayload })
      .expect(201);
    expect(preview.body.status).toBe('VALID');
    expect(preview.body.withinWindow).toBe(true);
    expect(preview.body.attendeeName).toBe('Ana Rojas');

    // Manual lookup by the human-readable code must resolve the same ticket.
    const byCode = await staff.agent
      .post('/api/v1/admin/check-in/preview')
      .set('X-CSRF-Token', staff.csrf)
      .send({ ticketCode: ticket.ticketCode })
      .expect(201);
    expect(byCode.body.ticketId).toBe(preview.body.ticketId);

    const result = await staff.agent
      .post('/api/v1/admin/check-in')
      .set('X-CSRF-Token', staff.csrf)
      .send({ token: ticket.qrPayload })
      .expect(201);
    expect(result.body.ticketCode).toBe(ticket.ticketCode);
    expect(result.body.overridden).toBe(false);

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.ticketId } });
    expect(row.status).toBe('USED');
    expect(row.usedAt).not.toBeNull();
    const record = await prisma.checkIn.findUniqueOrThrow({
      where: { ticketId: ticket.ticketId },
    });
    expect(record.checkedById).toBe(staffId);

    const second = await staff.agent
      .post('/api/v1/admin/check-in')
      .set('X-CSRF-Token', staff.csrf)
      .send({ token: ticket.qrPayload })
      .expect(409);
    expect(second.body.code).toBe('TICKET_ALREADY_USED');

    const list = await staff.agent
      .get(`/api/v1/admin/events/${eventId}/check-ins`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].ticketCode).toBe(ticket.ticketCode);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'CHECK_IN', entityId: ticket.ticketId },
    });
    expect(audit).not.toBeNull();
  });

  it('allows exactly one check-in when two scanners race on the same ticket', async () => {
    const { eventId, ticketTypeId } = await seedEvent(-30, 150);
    const ticket = await issuedTicket(eventId, ticketTypeId, 'checkin-order-race');
    const staff = await login(STAFF_EMAIL, STAFF_PASSWORD);

    const scan = () =>
      staff.agent
        .post('/api/v1/admin/check-in')
        .set('X-CSRF-Token', staff.csrf)
        .send({ token: ticket.qrPayload });
    const [first, second] = await Promise.all([scan(), scan()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const records = await prisma.checkIn.count({ where: { ticketId: ticket.ticketId } });
    expect(records).toBe(1);
  });

  it('requires an audited override outside the check-in window', async () => {
    const { eventId, ticketTypeId } = await seedEvent(60 * 24 * 30, 180);
    const ticket = await issuedTicket(eventId, ticketTypeId, 'checkin-order-future');
    const staff = await login(STAFF_EMAIL, STAFF_PASSWORD);

    const preview = await staff.agent
      .post('/api/v1/admin/check-in/preview')
      .set('X-CSRF-Token', staff.csrf)
      .send({ token: ticket.qrPayload })
      .expect(201);
    expect(preview.body.withinWindow).toBe(false);

    const blocked = await staff.agent
      .post('/api/v1/admin/check-in')
      .set('X-CSRF-Token', staff.csrf)
      .send({ token: ticket.qrPayload })
      .expect(409);
    expect(blocked.body.code).toBe('OUTSIDE_CHECKIN_WINDOW');

    await staff.agent
      .post('/api/v1/admin/check-in')
      .set('X-CSRF-Token', staff.csrf)
      .send({ token: ticket.qrPayload, override: true })
      .expect(400);

    const overridden = await staff.agent
      .post('/api/v1/admin/check-in')
      .set('X-CSRF-Token', staff.csrf)
      .send({
        token: ticket.qrPayload,
        override: true,
        overrideReason: 'Acceso anticipado autorizado por gerencia',
      })
      .expect(201);
    expect(overridden.body.overridden).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'CHECK_IN_OVERRIDE', entityId: ticket.ticketId },
    });
    expect(audit).not.toBeNull();
    const metadata = audit?.metadata as { reason?: string } | null;
    expect(metadata?.reason).toBe('Acceso anticipado autorizado por gerencia');
  });

  it('enforces roles and rejects unknown or cancelled tickets', async () => {
    const { eventId, ticketTypeId } = await seedEvent(-30, 150);
    const ticket = await issuedTicket(eventId, ticketTypeId, 'checkin-order-guards');

    await request(app.getHttpServer())
      .post('/api/v1/admin/check-in/preview')
      .send({ token: ticket.qrPayload })
      .expect(401);

    const reviewer = await login(REVIEWER_EMAIL, REVIEWER_PASSWORD);
    const forbidden = await reviewer.agent
      .post('/api/v1/admin/check-in/preview')
      .set('X-CSRF-Token', reviewer.csrf)
      .send({ token: ticket.qrPayload })
      .expect(403);
    expect(forbidden.body.code).toBe('INSUFFICIENT_ROLE');

    const staff = await login(STAFF_EMAIL, STAFF_PASSWORD);
    const unknown = await staff.agent
      .post('/api/v1/admin/check-in/preview')
      .set('X-CSRF-Token', staff.csrf)
      .send({ token: 'EVT1:does-not-exist' })
      .expect(404);
    expect(unknown.body.code).toBe('TICKET_NOT_FOUND');

    await prisma.ticket.update({
      where: { id: ticket.ticketId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    const cancelled = await staff.agent
      .post('/api/v1/admin/check-in')
      .set('X-CSRF-Token', staff.csrf)
      .send({ token: ticket.qrPayload })
      .expect(409);
    expect(cancelled.body.code).toBe('TICKET_CANCELLED');
  });
});
