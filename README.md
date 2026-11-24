# Plataforma de gestión de eventos, entradas y control de acceso QR

Monolito modular para publicar eventos, vender entradas, validar pagos por QR bancario estático y
controlar el ingreso mediante tickets individuales con QR.

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4.
- **Backend:** NestJS 12, TypeScript, Prisma 6, PostgreSQL (Supabase).
- **Almacenamiento:** Supabase Storage, buckets privados.
- **Correo:** adaptador intercambiable (consola en desarrollo, Resend en producción).
- **Gestor de paquetes:** pnpm 12 (workspaces).

## Estructura

```text
apps/
  api/        NestJS: modulos de dominio, Prisma, migraciones, pruebas
  web/        Next.js: sitio publico, cuenta, panel administrativo, escaner
packages/
  contracts/  Tipos compartidos generados desde OpenAPI
docs/
  adr/        Decisiones de arquitectura
  deployment.md  Guía de despliegue en Vercel + Railway
```

`Dockerfile.api`, `railway.json` y `vercel.json` contienen la configuración de producción.

## Requisitos

- Node.js 26 LTS (`nvm use`)
- pnpm 12 (`corepack enable`)
- Un proyecto Supabase con PostgreSQL y dos buckets privados: `receipts`, `ticket-assets`

## Puesta en marcha

```bash
pnpm install
cp .env.example .env          # completar credenciales reales
pnpm --filter @eventos/api prisma:generate
pnpm --filter @eventos/api prisma:migrate
pnpm dev:api                  # http://localhost:4000/api/v1
pnpm dev:web                  # http://localhost:3000
```

Comprobaciones:

```bash
pnpm --filter @eventos/api db:check     # conectividad real contra PostgreSQL
curl http://localhost:4000/api/v1/health/ready
open http://localhost:4000/api/docs
```

## Variables de entorno

Todo se configura en `.env` (ignorado por git). `.env.example` documenta cada variable.

Reglas importantes con Supabase:

1. `DATABASE_URL` usa el **pooler** (puerto 6543) con `pgbouncer=true&connection_limit=1`.
2. `DIRECT_URL` usa la conexión directa (puerto 5432) y solo se emplea para migraciones.
3. `SUPABASE_SERVICE_ROLE_KEY` nunca se expone al navegador ni se prefija con `NEXT_PUBLIC_`.
4. Prisma se conecta por TCP con el rol de base de datos. La autorización vive en NestJS y no
   depende de RLS.
5. La migración inicial revoca los privilegios de `anon` y `authenticated` sobre `public`, pero no
   ejecuta `ENABLE ROW LEVEL SECURITY`: Supabase habilita RLS sin políticas en cada tabla nueva
   mediante su event trigger `ensure_rls`. La Data API no puede leer ni escribir nada aunque la
   clave publicable sea pública. No vuelvas a otorgar esos privilegios. Si el esquema se recrea
   fuera de Supabase, habilita RLS explícitamente.
6. El rol de conexión debe tener `BYPASSRLS` (el rol `postgres` lo tiene). Un rol dedicado sin
   `BYPASSRLS` requiere políticas explícitas.

## Scripts

| Comando                                       | Descripción                                                 |
| --------------------------------------------- | ----------------------------------------------------------- |
| `pnpm build`                                  | Compila API y web                                           |
| `pnpm typecheck`                              | TypeScript estricto en todos los paquetes                   |
| `pnpm lint`                                   | ESLint (flat config)                                        |
| `pnpm test`                                   | Pruebas de todos los paquetes                               |
| `pnpm dev:api` / `pnpm dev:web`               | Desarrollo                                                  |
| `pnpm --filter @eventos/api prisma:migrate`   | Aplica migraciones pendientes                               |
| `pnpm --filter @eventos/api db:check`         | Verifica la conexión a la base de datos                     |
| `pnpm --filter @eventos/api openapi:generate` | Regenera `openapi.json` y los tipos de `packages/contracts` |

## Decisiones clave

Ver `docs/adr/`:

- `0001` monolito modular y monorepo
- `0002` Supabase (PostgreSQL + Storage privado)
- `0003` Prisma 6 sobre NestJS CommonJS
- `0004` OpenAPI como fuente única de contratos
- `0005` inventario, reservas y concurrencia
- `0006` tokens de ticket (hash + cifrado)
- `0007` sesiones opacas y CSRF
- `0008` dinero (`NUMERIC(12,2)`, BOB) y zona horaria
- `0009` rechazo de comprobantes y reintentos
- `0010` estrategia de pruebas
- `0011` cola durable de notificaciones y emisión idempotente de tickets
- `0012` check-in: ventana temporal, auditoría y uso único
- `0013` despliegue separado y cookies entre sitios

## Aclaración sobre los QR

- **QR de pago:** imagen estática proporcionada por la administración. El sistema **no** la genera;
  solo la almacena y la muestra con el monto exacto y las instrucciones.
- **QR de ticket:** lo genera el sistema, uno por asistente, con un token aleatorio. Nunca contiene
  datos personales.

## Despliegue

Web en Vercel y API en Railway, sin dominio propio. La guía completa está en
[`docs/deployment.md`](docs/deployment.md). Puntos críticos:

- `DATABASE_URL` usa el pooler de transacciones; `DIRECT_URL` (conexión directa) solo para migraciones.
- Web y API están en sitios distintos: en producción `COOKIE_SAME_SITE=none` y `WEB_ORIGIN` debe ser
  la URL exacta de Vercel. `Origin`, CORS y el token CSRF se validan en cada mutación. La API expone
  el token CSRF en la cabecera `X-CSRF-Token` porque la cookie pertenece a otro dominio.
- `NEXT_PUBLIC_PAYMENT_QR_URL` apunta a la imagen estática del QR bancario de la organización; el
  sistema nunca genera ese QR.
- El contenedor de la API aplica migraciones y ejecuta un solo worker de notificaciones: usa una réplica.

## Estado

- [x] F1 — Fundaciones del monorepo
- [x] F2 — Esquema de datos y restricciones SQL (aplicado a `public` y `test`)
- [x] F3 — Autenticación y roles
- [x] F4 — Eventos y tipos de entrada
- [x] F5 — Órdenes e inventario
- [x] F6 — Pagos y revisión manual
- [x] F7 — Tickets y notificaciones
- [x] F8 — Escáner y check-in
- [x] F9 — Reportes
- [x] F10 — Frontend público y administrativo
- [x] F11 — Hardening y despliegue
