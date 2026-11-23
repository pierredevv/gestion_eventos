import 'reflect-metadata';

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Exports the OpenAPI document without serving HTTP.
 * Compiled by `nest build` and executed as `node dist/openapi.js` so that
 * TypeScript decorator metadata (required by Nest DI) is emitted by tsc.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
    abortOnError: false,
  });
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gestion de Eventos API')
    .setDescription('API REST para eventos, entradas, pagos y control de acceso')
    .setVersion('1.0.0')
    .addCookieAuth('session')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const outputPath = resolve(process.cwd(), 'openapi.json');

  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  await app.close();

  console.log(`OpenAPI document written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error('Failed to export the OpenAPI document');
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
