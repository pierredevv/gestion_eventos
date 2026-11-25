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
import { StorageService } from '../../src/common/storage/storage.service';

/** End-to-end coverage for event and ticket-type management. */

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
  'order_items',
  'orders',
  'ticket_types',
  'event_email_branding',
  'events',
  'sessions',
  'verification_tokens',
  'user_roles',
  'roles',
  'users',
] as const;

const MANAGER_EMAIL = 'events-manager@example.com';
const MANAGER_PASSWORD = 'ManagerPass123!';
const BUYER_EMAIL = 'events-buyer@example.com';
const BUYER_PASSWORD = 'BuyerPass123!';

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

describeWithDatabase('events and ticket types', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  const storage = {
    upload: jest.fn(async () => undefined),
    createSignedUrl: jest.fn(async (_bucket: string, key: string) => `https://storage.test/${key}`),
    remove: jest.fn(async () => undefined),
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl, log: ['error'] });
    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;
    if (schema.at(0)?.current_schema !== 'test') {
      throw new Error('Refusing to run events tests outside the "test" schema');
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({ increment: async () => ({ totalHits: 0, timeToExpire: 0, isBlocked: false }) })
      .overrideProvider(EmailService)
      .useValue({ send: async (_message: EmailMessage) => undefined })
      .overrideProvider(StorageService)
      .useValue(storage)
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

    const managerRole = await prisma.role.findUniqueOrThrow({
      where: { name: RoleName.EVENT_MANAGER },
    });
    await prisma.user.create({
      data: {
        fullName: 'Event Manager',
        email: MANAGER_EMAIL,
        passwordHash: await hashPassword(MANAGER_PASSWORD),
        emailVerifiedAt: new Date(),
        roles: { create: { roleId: managerRole.id } },
      },
    });

    await prisma.user.create({
      data: {
        fullName: 'Plain Buyer',
        email: BUYER_EMAIL,
        passwordHash: await hashPassword(BUYER_PASSWORD),
        emailVerifiedAt: new Date(),
      },
    });
  });

  async function signIn(email: string, password: string): Promise<{ agent: Agent; csrf: string }> {
    const agent = request.agent(app.getHttpServer());
    const health = await agent.get('/api/v1/health').expect(200);
    const csrf = cookieValue(health.headers as Record<string, unknown>, 'csrf_token');
    if (!csrf) throw new Error('CSRF cookie missing');
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password })
      .expect(200);
    return { agent, csrf };
  }

  function eventPayload(overrides: Record<string, unknown> = {}) {
    return {
      title: 'Concierto de Verano 2027',
      description: 'Un concierto al aire libre.',
      location: 'Teatro Municipal',
      address: 'Av. Colón 123, La Paz',
      capacity: 100,
      startDate: '2027-03-15T20:00:00.000Z',
      endDate: '2027-03-15T23:00:00.000Z',
      registrationStart: '2027-01-10T00:00:00.000Z',
      registrationEnd: '2027-03-15T19:00:00.000Z',
      ...overrides,
    };
  }

  function ticketTypePayload(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Entrada General',
      price: 150.5,
      capacity: 60,
      minPerOrder: 1,
      maxPerOrder: 10,
      salesStart: '2027-01-10T00:00:00.000Z',
      salesEnd: '2027-03-15T19:00:00.000Z',
      ...overrides,
    };
  }

  it('creates, publishes and lists an event with derived sold-out status', async () => {
    const manager = await signIn(MANAGER_EMAIL, MANAGER_PASSWORD);

    const created = await manager.agent
      .post('/api/v1/admin/events')
      .set('X-CSRF-Token', manager.csrf)
      .send(eventPayload())
      .expect(201);

    expect(created.body.event.slug).toBe('concierto-de-verano-2027');
    expect(created.body.event.status).toBe('DRAFT');

    const eventId = created.body.event.id as string;

    // Drafts are not visible in the public catalog.
    const draftList = await request(app.getHttpServer()).get('/api/v1/events').expect(200);
    expect(draftList.body.items).toHaveLength(0);

    await manager.agent
      .post(`/api/v1/admin/events/${eventId}/ticket-types`)
      .set('X-CSRF-Token', manager.csrf)
      .send(ticketTypePayload())
      .expect(201);

    const published = await manager.agent
      .post(`/api/v1/admin/events/${eventId}/publish`)
      .set('X-CSRF-Token', manager.csrf)
      .expect(201);
    expect(published.body.event.status).toBe('PUBLISHED');
    expect(published.body.event.publishedAt).not.toBeNull();

    const publicList = await request(app.getHttpServer()).get('/api/v1/events').expect(200);
    expect(publicList.body.items).toHaveLength(1);
    expect(publicList.body.items[0].ticketTypes).toHaveLength(1);

    const detail = await request(app.getHttpServer())
      .get('/api/v1/events/concierto-de-verano-2027')
      .expect(200);
    expect(detail.body.totalAvailable).toBe(60);

    // Exhaust inventory directly; the derived status must reflect it.
    await prisma.ticketType.update({
      where: { id: published.body.event.ticketTypes[0].id },
      data: { soldQuantity: 60 },
    });
    const soldOut = await request(app.getHttpServer())
      .get('/api/v1/events/concierto-de-verano-2027')
      .expect(200);
    expect(soldOut.body.status).toBe('SOLD_OUT');
    expect(soldOut.body.totalAvailable).toBe(0);
  });

  it('enforces capacity, date and state rules', async () => {
    const manager = await signIn(MANAGER_EMAIL, MANAGER_PASSWORD);

    const badDates = await manager.agent
      .post('/api/v1/admin/events')
      .set('X-CSRF-Token', manager.csrf)
      .send(eventPayload({ startDate: '2027-03-16T20:00:00.000Z' }))
      .expect(400);
    expect(badDates.body.code).toBe('EVENT_INVALID_DATES');

    const created = await manager.agent
      .post('/api/v1/admin/events')
      .set('X-CSRF-Token', manager.csrf)
      .send(eventPayload())
      .expect(201);
    const eventId = created.body.event.id as string;

    const noTicketTypes = await manager.agent
      .post(`/api/v1/admin/events/${eventId}/publish`)
      .set('X-CSRF-Token', manager.csrf)
      .expect(400);
    expect(noTicketTypes.body.code).toBe('EVENT_NO_TICKET_TYPES');

    await manager.agent
      .post(`/api/v1/admin/events/${eventId}/ticket-types`)
      .set('X-CSRF-Token', manager.csrf)
      .send(ticketTypePayload({ capacity: 80 }))
      .expect(201);

    const tooMuch = await manager.agent
      .post(`/api/v1/admin/events/${eventId}/ticket-types`)
      .set('X-CSRF-Token', manager.csrf)
      .send(ticketTypePayload({ name: 'VIP', capacity: 30 }))
      .expect(400);
    expect(tooMuch.body.code).toBe('TICKET_TYPE_CAPACITY_EXCEEDED');

    await manager.agent
      .post(`/api/v1/admin/events/${eventId}/publish`)
      .set('X-CSRF-Token', manager.csrf)
      .expect(201);

    const doublePublish = await manager.agent
      .post(`/api/v1/admin/events/${eventId}/publish`)
      .set('X-CSRF-Token', manager.csrf)
      .expect(400);
    expect(doublePublish.body.code).toBe('EVENT_INVALID_STATE');
  });

  it('reopens a cancelled event through publish', async () => {
    const manager = await signIn(MANAGER_EMAIL, MANAGER_PASSWORD);
    const created = await manager.agent
      .post('/api/v1/admin/events')
      .set('X-CSRF-Token', manager.csrf)
      .send(eventPayload())
      .expect(201);
    const eventId = created.body.event.id as string;

    await manager.agent
      .post(`/api/v1/admin/events/${eventId}/ticket-types`)
      .set('X-CSRF-Token', manager.csrf)
      .send(ticketTypePayload({ capacity: 80 }))
      .expect(201);

    await manager.agent
      .post(`/api/v1/admin/events/${eventId}/publish`)
      .set('X-CSRF-Token', manager.csrf)
      .expect(201);

    const cancelled = await manager.agent
      .post(`/api/v1/admin/events/${eventId}/cancel`)
      .set('X-CSRF-Token', manager.csrf)
      .expect(201);
    expect(cancelled.body.event.status).toBe('CANCELLED');

    const republished = await manager.agent
      .post(`/api/v1/admin/events/${eventId}/publish`)
      .set('X-CSRF-Token', manager.csrf)
      .expect(201);
    expect(republished.body.event.status).toBe('PUBLISHED');
    expect(republished.body.event.publishedAt).toBe(cancelled.body.event.publishedAt);
  });

  it('blocks non-managers from admin event routes', async () => {
    const buyer = await signIn(BUYER_EMAIL, BUYER_PASSWORD);
    const response = await buyer.agent
      .post('/api/v1/admin/events')
      .set('X-CSRF-Token', buyer.csrf)
      .send(eventPayload())
      .expect(403);
    expect(response.body.code).toBe('INSUFFICIENT_ROLE');
  });

  async function createEventForEmail(manager: { agent: Agent; csrf: string }): Promise<string> {
    const created = await manager.agent
      .post('/api/v1/admin/events')
      .set('X-CSRF-Token', manager.csrf)
      .send(eventPayload())
      .expect(201);
    return created.body.event.id as string;
  }

  it('returns platform defaults for an event without email branding', async () => {
    const manager = await signIn(MANAGER_EMAIL, MANAGER_PASSWORD);
    const eventId = await createEventForEmail(manager);

    const config = await manager.agent.get(`/api/v1/admin/events/${eventId}/email`).expect(200);

    expect(config.body).toEqual({
      brandName: 'Eventos',
      primaryColor: '#b8431a',
      textColor: '#12141a',
      backgroundColor: '#f8f6f1',
      logoUrl: null,
      layout: {},
      templates: {},
      eventTitle: 'Concierto de Verano 2027',
      currency: 'BOB',
    });
  });

  it('persists per-event colours and copy and rejects invalid values', async () => {
    const manager = await signIn(MANAGER_EMAIL, MANAGER_PASSWORD);
    const eventId = await createEventForEmail(manager);
    const base = `/api/v1/admin/events/${eventId}/email`;

    const updated = await manager.agent
      .patch(base)
      .set('X-CSRF-Token', manager.csrf)
      .send({
        brandName: 'Festival',
        primaryColor: '#123456',
        textColor: '#654321',
        backgroundColor: '#fffeee',
        layout: { variant: 'nextLevel', tagline: 'MÁS ALLÁ DEL CONOCIMIENTO' },
        templates: {
          TICKET_DELIVERY: {
            subject: 'Tus entradas del Festival',
            headline: 'Ya puedes entrar',
            footer: 'Equipo del Festival',
          },
        },
      })
      .expect(200);

    expect(updated.body.brandName).toBe('Festival');
    expect(updated.body.primaryColor).toBe('#123456');
    expect(updated.body.layout).toEqual({
      variant: 'nextLevel',
      tagline: 'MÁS ALLÁ DEL CONOCIMIENTO',
    });
    expect(updated.body.templates.TICKET_DELIVERY).toEqual({
      subject: 'Tus entradas del Festival',
      headline: 'Ya puedes entrar',
      footer: 'Equipo del Festival',
    });

    const row = await prisma.eventEmailBranding.findUniqueOrThrow({ where: { eventId } });
    expect(row.templates).toMatchObject({
      TICKET_DELIVERY: { subject: 'Tus entradas del Festival' },
    });
    expect(row.layout).toMatchObject({ variant: 'nextLevel' });

    await manager.agent
      .patch(base)
      .set('X-CSRF-Token', manager.csrf)
      .send({ primaryColor: 'red' })
      .expect(400);
    await manager.agent
      .patch(base)
      .set('X-CSRF-Token', manager.csrf)
      .send({ layout: { headerColor: 'red' } })
      .expect(400);
    await manager.agent
      .patch(base)
      .set('X-CSRF-Token', manager.csrf)
      .send({ templates: { PASSWORD_RESET: { subject: 'x' } } })
      .expect(400);
  });

  it('uploads a logo and renders it in a draft preview without saving the draft', async () => {
    const manager = await signIn(MANAGER_EMAIL, MANAGER_PASSWORD);
    const eventId = await createEventForEmail(manager);
    const base = `/api/v1/admin/events/${eventId}/email`;

    const uploaded = await manager.agent
      .post(`${base}/logo`)
      .set('X-CSRF-Token', manager.csrf)
      .attach('logo', Buffer.from('89504e470d0a1a0a', 'hex'), {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(uploaded.body.logoUrl).toMatch(/^https:\/\/storage\.test\/events\//);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'event-assets', contentType: 'image/png' }),
    );

    const preview = await manager.agent
      .post(`${base}/preview`)
      .set('X-CSRF-Token', manager.csrf)
      .send({
        type: 'TICKET_DELIVERY',
        config: { templates: { TICKET_DELIVERY: { subject: 'Borrador del correo' } } },
      })
      .expect(201);

    expect(preview.body.subject).toBe('Borrador del correo');
    expect(preview.body.html).toContain(uploaded.body.logoUrl);
    expect(preview.body.html).toContain('Borrador del correo');
    expect(preview.body.text).toContain('Tus entradas están listas');

    const stored = await manager.agent.get(base).expect(200);
    expect(stored.body.templates).toEqual({});
  });
});
