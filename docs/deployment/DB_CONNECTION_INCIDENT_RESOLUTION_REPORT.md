# Informe de resolución — conexión Render ↔ Supabase

**Fecha:** 2026-11-24  
**Hora de resolución:** 19:23 UTC  
**Servicio Render:** `gestion-eventos-api` (`srv-dc2sukp42hec73938ou0`)  
**Deploy corrector:** `dep-dc2u8115efls738sesn0` (commit `39e6bc7`, estado `live`)  
**Dictamen:** **conectividad resuelta**. La API responde readiness y el login administrativo funciona.

## 1. Síntoma

Tras el despliegue `dep-dc2u2qh3kesc73d9f1gg`, los logs de Render mostraban de forma repetida:

```text
PrismaClientInitializationError
Can't reach database server at `db.aofqmxnvcbijynfdzhvf.supabase.co:5432`
```

Afectaba a `AuthService.login`, `PrismaService.checkConnection`, `NotificationWorkerService` y al
scheduler de órdenes vencidas. `/api/v1/health` devolvía 200, pero `/api/v1/health/ready` devolvía 503.

## 2. Causa raíz

`DATABASE_URL` en Render apuntaba al **direct connection** de Supabase
(`db.aofqmxnvcbijynfdzhvf.supabase.co:5432`). Ese host solo publica un registro AAAA IPv6
(`2600:1f16:...`) y no tiene registro A. Render, en el plan actual, sale por IPv4, por lo que la
conexión TCP de Prisma nunca se establecía (`P1001`). No era un fallo del código, de RLS ni de
permisos de Storage.

Los logs de Supabase también mostraban intentos previos fallidos de autenticación con la contraseña
antigua. Esos intentos desaparecieron al usar las cadenas vigentes proporcionadas por el usuario.

## 3. Acción correctiva

Se actualizaron únicamente dos variables de Render, sin `replace`, preservando el resto:

| Variable       | Valor aplicado                                                      |
| -------------- | ------------------------------------------------------------------- |
| `DATABASE_URL` | Session pooler IPv4 de Supabase, puerto 5432, con `sslmode=require` |
| `DIRECT_URL`   | Direct connection de Supabase, puerto 5432, con `sslmode=require`   |

Las credenciales no se reproducen en este informe. El entorno local (`.env`, ignorado por Git) y
`.env.example` quedaron alineados con el mismo contrato. Render disparó automáticamente el deploy
`dep-dc2u8115efls738sesn0`, que terminó en estado `live`.

Se prefirió el **session pooler** sobre el transaction pooler porque es una instancia persistente y
no necesita `pgbouncer=true&connection_limit=1`. El transaction pooler sigue siendo válido si se
configura con esos parámetros.

## 4. Evidencia de verificación

- `get_deploy`: `dep-dc2u8115efls738sesn0` → `status: live`, `finishedAt: 19:23:20Z`.
- Logs de la instancia nueva (`19:23:14Z` en adelante): `Nest application successfully started`,
  `API listening on http://localhost:4000/api/v1` y **cero** errores de Prisma o autenticación.
  Los errores visibles a las `19:23:00Z` pertenecen a la instancia anterior durante el swap.
- `GET /api/v1/health` → `200`, `{"status":"ok"}`.
- `GET /api/v1/health/ready` → `200`, `{"status":"ok","checks":{"database":{"ok":true,"latencyMs":99}}}`.
- `POST /api/v1/auth/login` con el SUPER_ADMIN y el `Origin` de Vercel → `200`, con cookies de
  sesión y CSRF emitidas.
- Consulta de logs de Supabase ejecutada justo tras el deploy filtrando
  `password authentication failed` y `tenant/user` → sin resultados. Una tentativa aislada externa
  apareció a las `19:30:05Z` (`password authentication failed for user "postgres"`); no provino del
  contenedor de Render, cuyos logs siguen limpios y cuyo readiness continúa en 200.
- Verificación previa con Prisma: `SELECT 1` exitoso contra session pooler y contra direct connection.
- Variables de Vercel comprobadas: `NEXT_PUBLIC_API_BASE_URL`,
  `NEXT_PUBLIC_API_DOCS_URL` y `NEXT_PUBLIC_API_HEALTH_URL` apuntan al servicio de Render.

## 5. Estado posterior

La conexión Render ↔ Supabase quedó operativa. La documentación de despliegue, el README y el ADR
0013 se actualizaron para reflejar Vercel + Render y el uso correcto del pooler IPv4.

Fuera de alcance de este incidente: el evento NEXT LEVEL sigue sin crearse porque el esquema actual
no admite eslogan, organizador, contacto, programa ni logo, y exige campos que se dejaron pendientes.
Eso requiere una decisión de producto o un cambio de esquema, no una corrección de conexión.
