# ADR 0001 — Monolito modular en un monorepo pnpm

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

La especificación exige un monolito modular, dos aplicaciones (Next.js y NestJS) y contratos
consistentes entre frontend y backend. El MVP no admite microservicios ni infraestructura extra.

## Decisión

Un único repositorio con pnpm workspaces:

- `apps/api`: NestJS 12, TypeScript, Prisma, PostgreSQL.
- `apps/web`: Next.js 16 (App Router), React 19, Tailwind CSS 4.
- `packages/contracts`: tipos compartidos generados desde OpenAPI.

Cada módulo del backend (`auth`, `events`, `orders`, `inventory`, `payments`, `tickets`,
`check-ins`, `notifications`, `reports`, `audit`) expone servicios y no accede a las tablas de
otro módulo sin una interfaz explícita.

## Consecuencias

- Un solo `pnpm install`, un solo pipeline de lint/test/build.
- Los contratos se generan, no se escriben dos veces.
- Se puede extraer un módulo a un servicio en el futuro sin reescribir el dominio.
- El acoplamiento se controla por revisión de código; no hay fronteras físicas.
