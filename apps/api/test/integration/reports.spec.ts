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

/** End-to-end coverage for sales/attendance reports and CSV export. */

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

const MANAGER_EMAIL = 'reports-manager@example.com';
const MANAGER_PASSWORD = 'ManagerPass123!';
const REVIEWER_EMAIL = 'reports-reviewer@example.com';
const REVIEWER_PASSWORD = 'ReviewerPass123!';
const STAFF_EMAIL = 'reports-staff@example.com';
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

describeWithDatabase('admin reports', () => {
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
      throw new Error('Refusing to run report tests outside the "test" schema');
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

    const creator = await prisma.user.create({
      data: {
        fullName: 'Reports Creator',
        email: 'reports-creator@example.com',
        passwordHash: await hashPassword('CreatorPass123!'),
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.user.create({
      data: {
        fullName: 'Reports Manager',
        email: MANAGER_EMAIL,
        passwordHash: await hashPassword(MANAGER_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: roleId(RoleName.EVENT_MANAGER) } },
      },
    });
    await prisma.user.create({
      data: {
        fullName: 'Reports Reviewer',
        email: REVIEWER_EMAIL,
        passwordHash: await hashPassword(REVIEWER_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: roleId(RoleName.PAYMENT_REVIEWER) } },
      },
    });
    await prisma.user.create({
      data: {
        fullName: 'Reports Staff',
        email: STAFF_EMAIL,
        passwordHash: await hashPassword(STAFF_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: roleId(RoleName.CHECK_IN_STAFF) } },
      },
    });

    const start = new Date(Date.now() - 30 * 60_000);
    const end = new Date(Date.now() + 150 * 60_000);
    const event = await prisma.event.create({
      data: {
        createdById: creator.id,
        slug: `reports-event-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Reportes "Especiales" 2028',
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
        salesStart: new Date(Date.now() - 43_200_000),
        salesEnd: new Date(end.getTime() + 1_800_000),
      },
    });
    ticketTypeId = ticketType.id;
  });

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

  function manager() {
    return login(MANAGER_EMAIL, MANAGER_PASSWORD);
  }

  async function confirmOrder(key: string, quantity: number) {
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
      .field('paymentReference', `TXN-REPORT-${key}`)
      .attach('receipt', pngBuffer(), { filename: 'receipt.png', contentType: 'image/png' })
      .expect(201);

    const reviewer = await login(REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await reviewer.agent
      .patch(`/api/v1/admin/payments/submissions/${receipt.body.submission.id}/approve`)
      .set('X-CSRF-Token', reviewer.csrf)
      .expect(200);
    return created.body.order.id as string;
  }

  /** Issues tickets and returns the QR payload of one of them. */
  async function firstQrPayload(): Promise<string> {
    await app.get(NotificationWorkerService).run();
    const deliveryEmail = email.sent.find((message) => message.subject.includes('Tus entradas'));
    const token = deliveryEmail?.text.match(/\/tickets\?token=([A-Za-z0-9_-]+)/)?.[1];
    if (!token) throw new Error('Ticket delivery email missing');
    const portal = await request(app.getHttpServer())
      .get('/api/v1/tickets')
      .query({ token })
      .expect(200);
    const ticket = (portal.body.tickets as Array<{ qrPayload: string }>).find(
      (candidate) => candidate.qrPayload.length > 0,
    );
    if (!ticket) throw new Error('No QR payload in portal');
    return ticket.qrPayload;
  }

  it('reports confirmed sales, ignores pending orders and exports CSV', async () => {
    await confirmOrder('reports-order-001', 1);
    await confirmOrder('reports-order-002', 2);
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        eventId,
        idempotencyKey: 'reports-order-pending',
        buyerName: 'Pending Buyer',
        buyerEmail: 'pending@example.com',
        buyerPhone: '+59170000009',
        items: [
          {
            ticketTypeId,
            quantity: 1,
            attendees: [{ fullName: 'Pending Attendee', email: 'pending-attendee@example.com' }],
          },
        ],
      })
      .expect(201);

    const { agent } = await manager();
    const response = await agent.get('/api/v1/admin/reports/sales').expect(200);
    const report = response.body as {
      totals: {
        orders: number;
        ticketsSold: number;
        grossRevenue: string;
        discounts: string;
        netRevenue: string;
        averageOrderValue: string;
      };
      byStatus: Array<{ status: string; orders: number }>;
      byEvent: Array<{ ticketsSold: number; netRevenue: string }>;
      byTicketType: Array<{ ticketsSold: number; grossRevenue: string }>;
    };

    expect(report.totals.orders).toBe(2);
    expect(report.totals.ticketsSold).toBe(3);
    expect(report.totals.grossRevenue).toBe('150.00');
    expect(report.totals.discounts).toBe('0.00');
    expect(report.totals.netRevenue).toBe('150.00');
    expect(report.totals.averageOrderValue).toBe('75.00');
    expect(report.byStatus.find((entry) => entry.status === 'PENDING_PAYMENT')?.orders).toBe(1);
    expect(report.byEvent).toHaveLength(1);
    expect(report.byEvent[0]?.ticketsSold).toBe(3);
    expect(report.byTicketType[0]?.grossRevenue).toBe('150.00');

    const csv = await agent.get('/api/v1/admin/reports/sales.csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.startsWith('\uFEFF')).toBe(true);
    expect(csv.text).toContain('"evento","tipo_entrada","entradas_vendidas","ingreso_bruto"');
    expect(csv.text).toContain('"TOTAL","","3","150.00"');
    // Quotes inside admin-controlled names must be escaped, not break the row.
    expect(csv.text).toContain('"Reportes ""Especiales"" 2028"');
  });

  it('filters by period and rejects an inverted range', async () => {
    await confirmOrder('reports-order-period', 1);
    const { agent } = await manager();

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const empty = await agent
      .get('/api/v1/admin/reports/sales')
      .query({ from: future })
      .expect(200);
    expect(empty.body.totals.orders).toBe(0);

    const past = new Date(Date.now() - 86_400_000).toISOString();
    const before = await agent
      .get('/api/v1/admin/reports/sales')
      .query({ to: past })
      .expect(200);
    expect(before.body.totals.orders).toBe(0);

    const invalid = await agent
      .get('/api/v1/admin/reports/sales')
      .query({ from: future, to: past })
      .expect(400);
    expect(invalid.body.code).toBe('REPORT_INVALID_PERIOD');
  });

  it('reports attendance, no-shows and the attendance rate', async () => {
    await confirmOrder('reports-order-attendance', 2);
    const qrPayload = await firstQrPayload();
    const staff = await login(STAFF_EMAIL, STAFF_PASSWORD);
    await staff.agent
      .post('/api/v1/admin/check-in')
      .set('X-CSRF-Token', staff.csrf)
      .send({ token: qrPayload })
      .expect(201);

    const { agent } = await manager();
    const response = await agent
      .get('/api/v1/admin/reports/attendance')
      .query({ eventId })
      .expect(200);
    const report = response.body as {
      ticketsIssued: number;
      ticketsSold: number;
      checkedIn: number;
      noShows: number;
      attendanceRate: string;
      byTicketType: Array<{ sold: number; checkedIn: number; noShows: number }>;
    };

    expect(report.ticketsIssued).toBe(2);
    expect(report.ticketsSold).toBe(2);
    expect(report.checkedIn).toBe(1);
    expect(report.noShows).toBe(1);
    expect(report.attendanceRate).toBe('50.0');
    expect(report.byTicketType[0]).toMatchObject({ sold: 2, checkedIn: 1, noShows: 1 });
  });

  it('enforces roles and validates the event identifier', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/reports/sales')
      .expect(401);

    const reviewer = await login(REVIEWER_EMAIL, REVIEWER_PASSWORD);
    await reviewer.agent.get('/api/v1/admin/reports/sales').expect(403);

    const { agent } = await manager();
    await agent.get('/api/v1/admin/reports/attendance').expect(400);

    const missing = await agent
      .get('/api/v1/admin/reports/attendance')
      .query({ eventId: '9e7c0d6b-9b44-4cd5-8c3a-000000000000' })
      .expect(404);
    expect(missing.body.code).toBe('EVENT_NOT_FOUND');
  });
});
