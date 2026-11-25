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

/** End-to-end coverage for receipt submission and manual payment review. */

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

const REVIEWER_EMAIL = 'payments-reviewer@example.com';
const REVIEWER_PASSWORD = 'ReviewerPass123!';

type Agent = ReturnType<typeof request.agent>;

class InMemoryStorage extends StorageService {
  readonly objects = new Map<string, Buffer>();

  async upload(input: UploadObjectInput): Promise<void> {
    this.objects.set(`${input.bucket}/${input.key}`, input.data);
  }

  async createSignedUrl(
    bucket: StorageBucket,
    key: string,
    _expiresInSeconds: number,
  ): Promise<string> {
    return `https://storage.test/${bucket}/${key}?token=signed`;
  }

  async remove(bucket: StorageBucket, key: string): Promise<void> {
    this.objects.delete(`${bucket}/${key}`);
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
  // Minimal PNG signature; the service validates exactly these 8 bytes.
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

describeWithDatabase('payments and manual review', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let storage: InMemoryStorage;
  let eventId: string;
  let ticketTypeId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl, log: ['error'] });
    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;
    if (schema.at(0)?.current_schema !== 'test') {
      throw new Error('Refusing to run payments tests outside the "test" schema');
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({ increment: async () => ({ totalHits: 0, timeToExpire: 0, isBlocked: false }) })
      .overrideProvider(EmailService)
      .useValue({ send: async (_message: EmailMessage) => undefined })
      .overrideProvider(StorageService)
      .useValue(new InMemoryStorage())
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    storage = app.get<InMemoryStorage>(StorageService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    storage.objects.clear();
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
        fullName: 'Payment Test Creator',
        email: 'payment-creator@example.com',
        passwordHash: await hashPassword('CreatorPass123!'),
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.user.create({
      data: {
        fullName: 'Payment Reviewer',
        email: REVIEWER_EMAIL,
        passwordHash: await hashPassword(REVIEWER_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: reviewerRole.id } },
      },
    });

    const event = await prisma.event.create({
      data: {
        createdById: creator.id,
        slug: `payment-event-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Payment Test Event',
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
        price: 100.0,
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

  async function createOrder(quantity = 2, key = 'payment-order-001') {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        eventId,
        idempotencyKey: key,
        buyerName: 'Ana Perez',
        buyerEmail: 'ana@example.com',
        buyerPhone: '+59170000001',
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
    return {
      code: response.body.order.orderCode as string,
      id: response.body.order.id as string,
      token: response.body.accessToken as string,
    };
  }

  function submitReceipt(
    code: string,
    token: string,
    options: {
      declaredAmount?: string;
      paymentReference?: string;
      file?: Buffer;
      mime?: string;
    } = {},
  ) {
    const req = request(app.getHttpServer())
      .post(`/api/v1/orders/${code}/payment-submissions`)
      .query({ token })
      .field('declaredAmount', options.declaredAmount ?? '200')
      .field('paymentReference', options.paymentReference ?? 'TXN-123456');

    const file = options.file ?? pngBuffer();
    const mime = options.mime ?? 'image/png';
    req.attach('receipt', file, { filename: 'receipt.png', contentType: mime });
    return req;
  }

  async function signInReviewer(): Promise<{ agent: Agent; csrf: string }> {
    const agent = request.agent(app.getHttpServer());
    const health = await agent.get('/api/v1/health').expect(200);
    const csrf = cookieValue(health.headers as Record<string, unknown>, 'csrf_token');
    if (!csrf) throw new Error('CSRF cookie missing');
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: REVIEWER_EMAIL, password: REVIEWER_PASSWORD })
      .expect(200);
    return { agent, csrf };
  }

  it('accepts a receipt, approves it and consumes the reserved stock exactly once', async () => {
    const order = await createOrder(2);
    const submitted = await submitReceipt(order.code, order.token).expect(201);
    expect(submitted.body.submission.orderStatus).toBe('PENDING_REVIEW');
    expect(submitted.body.submission.receiptUrl).toContain('?token=signed');
    expect(storage.objects.size).toBe(1);

    const reviewer = await signInReviewer();
    const pending = await reviewer.agent
      .get('/api/v1/admin/payments/submissions')
      .query({ status: 'PENDING', eventId })
      .expect(200);
    expect(pending.body.total).toBe(1);
    const submissionId = pending.body.items[0].id as string;

    const approved = await reviewer.agent
      .patch(`/api/v1/admin/payments/submissions/${submissionId}/approve`)
      .set('X-CSRF-Token', reviewer.csrf)
      .expect(200);
    expect(approved.body.orderStatus).toBe('CONFIRMED');
    expect(approved.body.paymentStatus).toBe('APPROVED');

    const ticketType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(ticketType.reservedQuantity).toBe(0);
    expect(ticketType.soldQuantity).toBe(2);

    const reservations = await prisma.inventoryReservation.findMany({
      where: { orderId: order.id },
    });
    expect(reservations.every((reservation) => reservation.status === 'CONSUMED')).toBe(true);

    const jobs = await prisma.notificationJob.findMany({
      where: { dedupeKey: { in: [`payment-approved-${order.id}`, `ticket-delivery-${order.id}`] } },
    });
    expect(jobs).toHaveLength(2);
  });

  it('lists legacy import submissions without signing a missing receipt file', async () => {
    const order = await createOrder(1, 'payment-order-legacy');
    await submitReceipt(order.code, order.token, { declaredAmount: '100' }).expect(201);

    await prisma.paymentSubmission.updateMany({
      where: { payment: { orderId: order.id } },
      data: { receiptFileKey: 'legacy/import/no-file/ORD-LEGACY' },
    });

    const reviewer = await signInReviewer();
    const list = await reviewer.agent
      .get('/api/v1/admin/payments/submissions')
      .query({ status: 'PENDING', eventId })
      .expect(200);

    expect(list.body.total).toBe(1);
    expect(list.body.items[0].receiptUrl).toBe('');
  });

  it('prevents double approval with a conflict', async () => {
    const order = await createOrder(1, 'payment-order-double');
    const submitted = await submitReceipt(order.code, order.token, {
      declaredAmount: '100',
    }).expect(201);
    const reviewer = await signInReviewer();
    const submissionId = submitted.body.submission.id as string;

    await reviewer.agent
      .patch(`/api/v1/admin/payments/submissions/${submissionId}/approve`)
      .set('X-CSRF-Token', reviewer.csrf)
      .expect(200);

    const second = await reviewer.agent
      .patch(`/api/v1/admin/payments/submissions/${submissionId}/approve`)
      .set('X-CSRF-Token', reviewer.csrf)
      .expect(409);
    expect(second.body.code).toBe('SUBMISSION_ALREADY_REVIEWED');

    const ticketType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(ticketType.soldQuantity).toBe(1);
  });

  it('rejects with retry, then accepts a replacement receipt', async () => {
    const order = await createOrder(2, 'payment-order-retry');
    const first = await submitReceipt(order.code, order.token).expect(201);
    const reviewer = await signInReviewer();

    const rejected = await reviewer.agent
      .patch(`/api/v1/admin/payments/submissions/${first.body.submission.id}/reject`)
      .set('X-CSRF-Token', reviewer.csrf)
      .send({ notes: 'El monto no coincide' })
      .expect(200);
    expect(rejected.body.orderStatus).toBe('PENDING_PAYMENT');
    expect(rejected.body.paymentAttempts).toBe(1);

    const ticketType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(ticketType.reservedQuantity).toBe(2);
    expect(ticketType.soldQuantity).toBe(0);

    const resubmitted = await submitReceipt(order.code, order.token, {
      declaredAmount: '200',
      paymentReference: 'TXN-654321',
    }).expect(201);
    expect(resubmitted.body.submission.paymentAttempts).toBe(1);

    await reviewer.agent
      .patch(`/api/v1/admin/payments/submissions/${resubmitted.body.submission.id}/approve`)
      .set('X-CSRF-Token', reviewer.csrf)
      .expect(200);

    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.status).toBe('CONFIRMED');
    expect(final.paymentAttempts).toBe(1);
  });

  it('releases stock after the maximum number of rejected attempts', async () => {
    const order = await createOrder(3, 'payment-order-final');
    const reviewer = await signInReviewer();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const submitted = await submitReceipt(order.code, order.token, {
        paymentReference: `TXN-00000${attempt}`,
      }).expect(201);
      const result = await reviewer.agent
        .patch(`/api/v1/admin/payments/submissions/${submitted.body.submission.id}/reject`)
        .set('X-CSRF-Token', reviewer.csrf)
        .send({ notes: 'Comprobante ilegible' })
        .expect(200);
      expect(result.body.paymentAttempts).toBe(attempt);
      if (attempt === 2) {
        expect(result.body.orderStatus).toBe('REJECTED');
      }
    }

    const ticketType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(ticketType.reservedQuantity).toBe(0);
    expect(ticketType.soldQuantity).toBe(0);

    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final.status).toBe('REJECTED');
    expect(final.rejectionReason).toBe('Comprobante ilegible');
  });

  it('rejects invalid or duplicate receipts', async () => {
    const order = await createOrder(1, 'payment-order-invalid');

    const wrongType = await submitReceipt(order.code, order.token, {
      file: Buffer.from('%PDF-1.4 fake'),
      mime: 'text/plain',
    }).expect(400);
    expect(wrongType.body.code).toBe('RECEIPT_INVALID_TYPE');

    const badContent = await submitReceipt(order.code, order.token, {
      file: Buffer.from('not a real png'),
    }).expect(400);
    expect(badContent.body.code).toBe('RECEIPT_INVALID_CONTENT');

    await submitReceipt(order.code, order.token).expect(201);
    // While a receipt is under review the order is no longer PENDING_PAYMENT,
    // so the state guard rejects a second upload before the unique index runs.
    const duplicate = await submitReceipt(order.code, order.token).expect(409);
    expect(duplicate.body.code).toBe('ORDER_INVALID_STATE');
    expect(storage.objects.size).toBe(1);
  });
});
