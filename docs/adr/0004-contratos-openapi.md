# ADR 0004 — OpenAPI como fuente única de contratos

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

El SRS exige documentación Swagger/OpenAPI y prohíbe que frontend y backend definan tipos
distintos para el mismo recurso.

## Decisión

1. Los DTO viven en el backend con `class-validator` y anotaciones de `@nestjs/swagger`.
2. `GET /api/docs-json` expone el documento OpenAPI 3.
3. `openapi-typescript` genera tipos en `packages/contracts` durante una tarea explícita
   (`openapi:generate`), y esos tipos se versionan.
4. El frontend valida formularios con Zod, pero la forma de la respuesta se toma del contrato
   generado.

## Consecuencias

- Un cambio incompatible en la API rompe el typecheck del frontend.
- La generación es un paso deliberado, no ocurre en cada build (evita builds no deterministas).
- Los enums de estado se documentan en Swagger y se exportan al contrato; no se duplican a mano.
