import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { configureApp } from '../../src/app-config';
import { AppModule } from '../../src/app.module';
import { envSchema, type AppEnv } from '../../src/common/config/env';

/**
 * Verifies the production cross-site setup: Vercel and Railway live on
 * different sites, so cookies need `SameSite=None; Secure` while CORS and the
 * Origin guard stay restricted to explicitly configured browser origins.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

function cookieValue(headers: Record<string, unknown>, name: string): string | undefined {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  return list.find((header) => header.startsWith(`${name}=`));
}

describeWithDatabase('cross-site security configuration', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.EMAIL_PROVIDER = 'console';

    // ConfigModule reads process.env when AppModule is imported, so overriding
    // variables in beforeAll is too late. Inject a fully parsed config instead.
    const config = envSchema.parse({
      ...process.env,
      // A trailing slash must not break the exact Origin comparison.
      WEB_ORIGIN: 'https://app.example.com/',
      ADDITIONAL_WEB_ORIGINS: 'https://preview.example.com, https://preview2.example.com',
      COOKIE_SAME_SITE: 'none',
    });
    const configStub = {
      get: <Key extends keyof AppEnv>(key: Key): AppEnv[Key] => config[key],
    } as unknown as ConfigService<AppEnv, true>;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(configStub)
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({ totalHits: 0, timeToExpire: 0, isBlocked: false }),
      })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('sets SameSite=None and Secure on the CSRF cookie and exposes its token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    const cookie = cookieValue(response.headers as Record<string, unknown>, 'csrf_token');
    expect(cookie).toBeDefined();
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');

    // A browser on another domain cannot read the API cookie, so the client
    // obtains the same token from this CORS-exposed header.
    const headerToken = response.headers['x-csrf-token'];
    expect(typeof headerToken).toBe('string');
    expect(cookie).toContain(`csrf_token=${String(headerToken)}`);
  });

  it('allows only configured origins with credentials', async () => {
    for (const origin of ['https://app.example.com', 'https://preview.example.com']) {
      const response = await request(app.getHttpServer())
        .options('/api/v1/health')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    }

    const denied = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects unsafe requests from origins outside the allowlist', async () => {
    const agent = request.agent(app.getHttpServer());
    const health = await agent.get('/api/v1/health').expect(200);
    const csrfCookie = cookieValue(health.headers as Record<string, unknown>, 'csrf_token');
    expect(csrfCookie).toBeDefined();
    const token = csrfCookie?.split('=')[1]?.split(';')[0] ?? '';

    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('X-CSRF-Token', token)
      .send({ email: 'nobody@example.com', password: 'NotARealPassword123!' })
      .expect(403);

    expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
  });
});
