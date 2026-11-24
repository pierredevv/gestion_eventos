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

/**
 * Mandatory acceptance scenario:
 * 2 General (50.00 BOB) + 1 VIP (100.00 BOB) in ONE order.
 * Expected: 1 order, 3 attendees/tickets/check-ins, 200.00 BOB revenue once.
 */

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

const REVIEWER_EMAIL = 'critical-reviewer@example.com';
const REVIEWER_PASSWORD = 'ReviewerPass123!';
const MANAGER_EMAIL = 'critical-manager@example.com';
const MANAGER_PASSWORD = 'ManagerPass123!';
const STAFF_EMAIL = 'critical-staff@example.com';
const STAFF_PASSWORD = 'StaffPass123!';

type Agent = ReturnType<typeof request.agent>;

class RecordingEmail extends EmailService {
  readonly sent: EmailMessage[] = [];

  override async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

class InMemoryStorage extends StorageService {
  async upload(_input: UploadObjectInput): Promise<void> {
    return undefined;
  }

  async createSignedUrl(
    bucket: StorageBucket,
    key: string,
    _expiresInSeconds: number,
  ): Promise<string> {
    return `https://storage.test/${bucket}/${key}?token=signed`;
  }

  async remove(_bucket: StorageBucket, _key: string): Promise<void> {
    return undefined;
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

describeWithDatabase('critical scenario: multi-ticket-type order', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let email: RecordingEmail;
  let eventId: string;
  let generalId: string;
  let vipId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl, log: ['error'] });
    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;
    if (schema.at(0)?.current_schema !== 'test') {
      throw new Error('Refusing critical scenario tests outside the "test" schema');
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
        fullName: 'Critical Scenario Creator',
        email: 'critical-creator@example.com',
        passwordHash: await hashPassword('CreatorPass123!'),
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.user.create({
      data: {
        fullName: 'Critical Manager',
        email: MANAGER_EMAIL,
        passwordHash: await hashPassword(MANAGER_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: roleId(RoleName.EVENT_MANAGER) } },
      },
    });
    await prisma.user.create({
      data: {
        fullName: 'Critical Reviewer',
        email: REVIEWER_EMAIL,
        passwordHash: await hashPassword(REVIEWER_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: roleId(RoleName.PAYMENT_REVIEWER) } },
      },
    });
    await prisma.user.create({
      data: {
        fullName: 'Critical Staff',
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
        slug: 'conferencia-tech-bolivia',
        title: 'Conferencia Tech Bolivia',
        description: 'Escenario crítico de auditoría',
        location: 'La Paz',
        address: 'Centro de Convenciones',
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

    const general = await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: 'General',
        price: 50.0,
        currency: 'BOB',
        capacity: 20,
        minPerOrder: 1,
        maxPerOrder: 10,
        salesStart: new Date(Date.now() - 86_400_000),
        salesEnd: new Date(end.getTime() + 1_800_000),
      },
    });
    generalId = general.id;

    const vip = await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: 'VIP',
        price: 100.0,
        currency: 'BOB',
        capacity: 10,
        minPerOrder: 1,
        maxPerOrder: 10,
        salesStart: new Date(Date.now() - 86_400_000),
        salesEnd: new Date(end.getTime() + 1_800_000),
      },
    });
    vipId = vip.id;
  });

  async function login(
    emailAddress: string,
    password: string,
  ): Promise<{ agent: Agent; csrf: string }> {
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

  it('creates one order with two item types and three attendees priced server-side', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        eventId,
        idempotencyKey: 'critical-multi-item-001',
        buyerName: 'Juan Carlos Rodriguez',
        buyerEmail: 'juan@example.com',
        buyerPhone: '+59170000000',
        items: [
          {
            ticketTypeId: generalId,
            quantity: 2,
            attendees: [
              { fullName: 'Ana Perez', email: 'ana@example.com' },
              { fullName: 'Beto Ruiz', email: 'beto@example.com' },
            ],
          },
          {
            ticketTypeId: vipId,
            quantity: 1,
            attendees: [{ fullName: 'Carla Diaz', email: 'carla@example.com' }],
          },
        ],
      })
      .expect(201);

    expect(response.body.order.status).toBe('PENDING_PAYMENT');
    expect(response.body.order.subtotal).toBe('200.00');
    expect(response.body.order.totalAmount).toBe('200.00');
    expect(response.body.order.items).toHaveLength(2);
    expect(
      response.body.order.items.reduce(
        (sum: number, item: { attendees: unknown[] }) => sum + item.attendees.length,
        0,
      ),
    ).toBe(3);
    expect(
      response.body.order.items.find(
        (item: { ticketTypeId: string }) => item.ticketTypeId === generalId,
      ),
    ).toMatchObject({
      quantity: 2,
      subtotal: '100.00',
    });
    expect(
      response.body.order.items.find(
        (item: { ticketTypeId: string }) => item.ticketTypeId === vipId,
      ),
    ).toMatchObject({
      quantity: 1,
      subtotal: '100.00',
    });

    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.orderItem.count()).toBe(2);
    expect(await prisma.attendee.count()).toBe(3);

    const general = await prisma.ticketType.findUniqueOrThrow({ where: { id: generalId } });
    const vip = await prisma.ticketType.findUniqueOrThrow({ where: { id: vipId } });
    expect(general.reservedQuantity).toBe(2);
    expect(vip.reservedQuantity).toBe(1);
  });

  it('approves payment once, issues three tickets and reports 1 order / 3 tickets / 200.00 BOB', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        eventId,
        idempotencyKey: 'critical-multi-item-002',
        buyerName: 'Juan Carlos Rodriguez',
        buyerEmail: 'juan@example.com',
        buyerPhone: '+59170000000',
        items: [
          {
            ticketTypeId: generalId,
            quantity: 2,
            attendees: [
              { fullName: 'Ana Perez', email: 'ana@example.com' },
              { fullName: 'Beto Ruiz', email: 'beto@example.com' },
            ],
          },
          {
            ticketTypeId: vipId,
            quantity: 1,
            attendees: [{ fullName: 'Carla Diaz', email: 'carla@example.com' }],
          },
        ],
      })
      .expect(201);
    const code = created.body.order.orderCode as string;
    const token = created.body.accessToken as string;

    await request(app.getHttpServer())
      .post(`/api/v1/orders/${code}/payment-submissions`)
      .query({ token })
      .field('declaredAmount', '200.00')
      .field('paymentReference', 'CRITICAL-TXN-001')
      .attach('receipt', pngBuffer(), { filename: 'receipt.png', contentType: 'image/png' })
      .expect(201);

    const reviewer = await login(REVIEWER_EMAIL, REVIEWER_PASSWORD);
    const pending = await reviewer.agent
      .get('/api/v1/admin/payments/submissions')
      .query({ status: 'PENDING' })
      .expect(200);
    expect(pending.body.total).toBe(1);
    const submissionId = pending.body.items[0].id as string;

    await reviewer.agent
      .patch(`/api/v1/admin/payments/submissions/${submissionId}/approve`)
      .set('X-CSRF-Token', reviewer.csrf)
      .expect(200);

    await app.get(NotificationWorkerService).run();

    expect(await prisma.ticket.count()).toBe(3);
    expect(
      await prisma.ticket.findMany({ where: { orderId: created.body.order.id } }),
    ).toHaveLength(3);

    const manager = await login(MANAGER_EMAIL, MANAGER_PASSWORD);
    const sales = await manager.agent.get('/api/v1/admin/reports/sales').expect(200);
    expect(sales.body.totals).toMatchObject({
      orders: 1,
      ticketsSold: 3,
      grossRevenue: '200.00',
      netRevenue: '200.00',
    });

    const tickets = await prisma.ticket.findMany({
      where: { orderId: created.body.order.id },
      orderBy: { createdAt: 'asc' },
    });

    const staff = await login(STAFF_EMAIL, STAFF_PASSWORD);
    for (const ticket of tickets) {
      await staff.agent
        .post('/api/v1/admin/check-in')
        .set('X-CSRF-Token', staff.csrf)
        .send({ ticketCode: ticket.ticketCode })
        .expect(201);
    }
    expect(await prisma.checkIn.count()).toBe(3);

    const duplicate = await staff.agent
      .post('/api/v1/admin/check-in')
      .set('X-CSRF-Token', staff.csrf)
      .send({ ticketCode: tickets[0]?.ticketCode })
      .expect(409);
    expect(duplicate.body.code).toBe('TICKET_ALREADY_USED');
    expect(await prisma.checkIn.count()).toBe(3);

    const attendance = await manager.agent
      .get('/api/v1/admin/reports/attendance')
      .query({ eventId })
      .expect(200);
    expect(attendance.body).toMatchObject({
      ticketsIssued: 3,
      ticketsSold: 3,
      checkedIn: 3,
      noShows: 0,
    });
  });
});
