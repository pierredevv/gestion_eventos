import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { AppEnv } from './common/config/env';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { createCsrfCookieMiddleware } from './common/security/csrf-cookie.middleware';
import { CookieService } from './common/security/cookie.service';

/**
 * Shared HTTP-layer configuration used by both `bootstrap()` and integration
 * tests. Keeping it in one place guarantees that the test app exercises the
 * same middleware, validation and global prefix as production.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService<AppEnv, true>);
  const allowedOrigins = [
    config.get('WEB_ORIGIN', { infer: true }),
    ...(config.get('ADDITIONAL_WEB_ORIGINS', { infer: true }) ?? []),
  ];

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  // Runs before guards: every visitor gets a CSRF cookie before their first mutation.
  app.use(createCsrfCookieMiddleware(app.get(CookieService)));
  app.use(requestIdMiddleware);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: ['x-request-id', 'X-CSRF-Token'],
    // Avoid a fresh OPTIONS round trip before every checkout mutation.
    maxAge: 600,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}
