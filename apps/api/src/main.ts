import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureApp } from './app-config';
import { AppModule } from './app.module';
import type { AppEnv } from './common/config/env';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<AppEnv, true>);

  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gestion de Eventos API')
    .setDescription('API REST para eventos, entradas, pagos y control de acceso')
    .setVersion('1.0.0')
    .addCookieAuth('session')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api/v1`);
  logger.log(`OpenAPI documentation on http://localhost:${port}/api/docs`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error('Application failed to start', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
