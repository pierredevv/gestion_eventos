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

/**
 * End-to-end authentication tests against the real NestJS HTTP stack and the
 * dedicated `test` schema. They verify cookie handling, CSRF, forced password
 * changes, session revocation and role-based access control.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

const TABLES = [
  'audit_logs',
  'sessions',
  'verification_tokens',
  'user_roles',
  'roles',
  'users',
] as const;

const ADMIN_EMAIL = 'auth-admin@example.com';
const ADMIN_TEMP_PASSWORD = 'TempAdmin123!';
const ADMIN_NEW_PASSWORD = 'NewAdmin456!';

function cookieValue(headers: Record<string, unknown>, name: string): string | undefined {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  for (const header of list) {
    const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function extractToken(text: string): string {
  const match = text.match(/token=([^\s]+)/);
  if (!match) {
    throw new Error(`No token found in email body: ${text}`);
  }
  const token = match[1];
  if (!token) {
    throw new Error(`No token found in email body: ${text}`);
  }
  return decodeURIComponent(token);
}

type Agent = ReturnType<typeof request.agent>;

describeWithDatabase('auth flows', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  const sentEmails: EmailMessage[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.EMAIL_PROVIDER = 'console';

    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl, log: ['error'] });
    const schema = await prisma.$queryRaw<Array<{ current_schema: string }>>`
      SELECT current_schema() AS current_schema
    `;
    if (schema.at(0)?.current_schema !== 'test') {
      throw new Error('Refusing to run auth tests outside the "test" schema');
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({ totalHits: 0, timeToExpire: 0, isBlocked: false }),
      })
      .overrideProvider(EmailService)
      .useValue({
        send: async (message: EmailMessage) => {
          sentEmails.push(message);
        },
      })
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
    sentEmails.length = 0;
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

    await prisma.user.create({
      data: {
        fullName: 'Auth Admin',
        email: ADMIN_EMAIL,
        passwordHash: await hashPassword(ADMIN_TEMP_PASSWORD),
        mustChangePassword: true,
        emailVerifiedAt: new Date(),
        roles: {
          create: {
            roleId: (await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SUPER_ADMIN } }))
              .id,
          },
        },
      },
    });
  });

  async function freshAgent(): Promise<{ agent: Agent; csrf: string }> {
    const agent = request.agent(app.getHttpServer());
    const health = await agent.get('/api/v1/health').expect(200);
    const csrf = cookieValue(health.headers as Record<string, unknown>, 'csrf_token');
    if (!csrf) {
      throw new Error('CSRF cookie was not set by the health endpoint');
    }
    return { agent, csrf };
  }

  function login(agent: Agent, csrf: string, email = ADMIN_EMAIL, password = ADMIN_TEMP_PASSWORD) {
    return agent.post('/api/v1/auth/login').set('X-CSRF-Token', csrf).send({ email, password });
  }

  it('login sets an httpOnly session cookie and exposes the forced-change flag', async () => {
    const { agent, csrf } = await freshAgent();

    const response = await login(agent, csrf).expect(200);

    const cookies = (response.headers as Record<string, unknown>)['set-cookie'];
    const list = Array.isArray(cookies) ? cookies : [];
    expect(list.some((header) => header.startsWith('session=') && /HttpOnly/i.test(header))).toBe(
      true,
    );

    expect(response.body.user.email).toBe(ADMIN_EMAIL);
    expect(response.body.user.mustChangePassword).toBe(true);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.user.email).toBe(ADMIN_EMAIL);
  });

  it('blocks other endpoints while a password change is pending', async () => {
    const { agent, csrf } = await freshAgent();
    await login(agent, csrf).expect(200);

    const response = await agent.get('/api/v1/users').expect(403);
    expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.user.mustChangePassword).toBe(true);
  });

  it('requires a valid CSRF token on unsafe methods', async () => {
    const { agent, csrf } = await freshAgent();
    await login(agent, csrf).expect(200);

    const missing = await agent.post('/api/v1/auth/logout').expect(403);
    expect(missing.body.code).toBe('CSRF_INVALID');

    const wrong = await agent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', 'not-the-cookie-value')
      .expect(403);
    expect(wrong.body.code).toBe('CSRF_INVALID');
  });

  it('rejects requests from a hostile origin', async () => {
    const { agent, csrf } = await freshAgent();
    const response = await login(agent, csrf).set('Origin', 'https://evil.example').expect(403);
    expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('changing the password clears the flag and revokes other sessions', async () => {
    const { agent, csrf } = await freshAgent();
    await login(agent, csrf).expect(200);

    const other = await freshAgent();
    await login(other.agent, other.csrf).expect(200);

    await agent
      .post('/api/v1/auth/change-password')
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: ADMIN_TEMP_PASSWORD, newPassword: ADMIN_NEW_PASSWORD })
      .expect(204);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.user.mustChangePassword).toBe(false);

    const oldSession = await other.agent.get('/api/v1/auth/me').expect(401);
    expect(oldSession.body.code).toBe('SESSION_INVALID');

    const { agent: fresh, csrf: freshCsrf } = await freshAgent();
    const relogin = await login(fresh, freshCsrf, ADMIN_EMAIL, ADMIN_NEW_PASSWORD).expect(200);
    expect(relogin.body.user.mustChangePassword).toBe(false);
  });

  it('logout clears the cookie and revokes the session server-side', async () => {
    const { agent, csrf } = await freshAgent();
    const loginResponse = await login(agent, csrf).expect(200);
    const sessionToken = cookieValue(loginResponse.headers as Record<string, unknown>, 'session');
    expect(sessionToken).toBeDefined();

    await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf).expect(204);

    // The cookie was cleared, so the agent no longer sends a token.
    await agent.get('/api/v1/auth/me').expect(401);

    // Replaying the old token must still fail: the session is revoked in the DB.
    const replay = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', `session=${sessionToken}`)
      .expect(401);
    expect(replay.body.code).toBe('SESSION_INVALID');
  });

  it('register, verify email and reset password work end to end', async () => {
    const { agent, csrf } = await freshAgent();
    const email = 'buyer@example.com';
    const password = 'BuyerPass123!';

    await agent
      .post('/api/v1/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({ fullName: 'Test Buyer', email, password })
      .expect(201);

    expect(sentEmails).toHaveLength(1);
    const verifyEmail = sentEmails.at(0);
    if (!verifyEmail) throw new Error('Verification email was not captured');
    const verifyToken = extractToken(verifyEmail.text);
    await agent
      .post('/api/v1/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token: verifyToken })
      .expect(204);

    const verifiedUser = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(verifiedUser.emailVerifiedAt).not.toBeNull();

    await agent
      .post('/api/v1/auth/forgot-password')
      .set('X-CSRF-Token', csrf)
      .send({ email })
      .expect(202);

    expect(sentEmails).toHaveLength(2);
    const resetEmail = sentEmails.at(1);
    if (!resetEmail) throw new Error('Reset email was not captured');
    const resetToken = extractToken(resetEmail.text);
    await agent
      .post('/api/v1/auth/reset-password')
      .set('X-CSRF-Token', csrf)
      .send({ token: resetToken, newPassword: 'BuyerNew456!' })
      .expect(204);

    const { agent: fresh, csrf: freshCsrf } = await freshAgent();
    const relogin = await login(fresh, freshCsrf, email, 'BuyerNew456!').expect(200);
    expect(relogin.body.user.email).toBe(email);
  });

  it('only SUPER_ADMIN can manage users', async () => {
    const { agent, csrf } = await freshAgent();
    await login(agent, csrf).expect(200);

    // Clear the forced-change flag directly so the admin can use /users.
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { mustChangePassword: false },
    });

    const created = await agent
      .post('/api/v1/users')
      .set('X-CSRF-Token', csrf)
      .send({
        fullName: 'Staff Member',
        email: 'staff@example.com',
        password: 'StaffPass123!',
        roles: [RoleName.CHECK_IN_STAFF],
      })
      .expect(201);

    expect(created.body.user.roles).toEqual([RoleName.CHECK_IN_STAFF]);

    const { agent: staffAgent, csrf: staffCsrf } = await freshAgent();
    await login(staffAgent, staffCsrf, 'staff@example.com', 'StaffPass123!').expect(200);

    // Staff accounts are created with a temporary password, so change it first.
    const staffSession = await staffAgent.get('/api/v1/auth/me').expect(200);
    expect(staffSession.body.user.mustChangePassword).toBe(true);

    const forbidden = await staffAgent.get('/api/v1/users').expect(403);
    expect(forbidden.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    await prisma.user.update({
      where: { email: 'staff@example.com' },
      data: { mustChangePassword: false },
    });

    const forbiddenAgain = await staffAgent.get('/api/v1/users').expect(403);
    expect(forbiddenAgain.body.code).toBe('INSUFFICIENT_ROLE');
  });
});
