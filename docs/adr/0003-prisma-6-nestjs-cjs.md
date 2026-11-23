# ADR 0003 — Prisma 6 sobre NestJS CommonJS

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

Prisma 7 exige ESM, `prisma.config.ts`, un *driver adapter* (`@prisma/adapter-pg`) y un `output`
obligatorio para el cliente generado. NestJS 12 se construye por defecto como CommonJS con
decoradores y `emitDecoratorMetadata`.

Combinar NestJS CJS con un cliente ESM generado añade riesgo de resolución de módulos y de
generación de tipos sin aportar valor al MVP.

## Decisión

Fijar Prisma **6.19.3** (`prisma` + `@prisma/client`) con el generador `prisma-client-js`.

## Consecuencias

- Integración probada con NestJS, `ts-jest` y TypeScript 6.
- Se conserva `directUrl` para migraciones.
- La actualización a Prisma 7 requiere: migrar a ESM, añadir `prisma.config.ts` y el adapter `pg`.
  Queda registrada como deuda técnica planificada, no como bloqueo del MVP.
- `prisma generate` debe ejecutarse explícitamente tras instalar dependencias.
