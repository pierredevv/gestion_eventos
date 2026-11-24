# Informe de preparación operativa y dictamen de producción

**Proyecto:** Plataforma de gestión de eventos  
**Fecha:** 2026-11-24  
**Repositorio:** https://github.com/pierredevv/gestion_eventos  
**Commit desplegado:** `6bc1a83`  
**Supabase reutilizado:** `aofqmxnvcbijynfdzhvf` (producción, sin borrado de datos)  
**Dictamen:** **NOT READY** — la API ya arranca, pero la base de datos rechaza las credenciales; no se declara producción operativa.

> **Actualización 2026-11-24 19:23 UTC:** las credenciales vigentes y el session pooler IPv4 ya
> funcionan: `/api/v1/health/ready` responde 200 y el login administrativo responde 200. Ver
> [`DB_CONNECTION_INCIDENT_RESOLUTION_REPORT.md`](DB_CONNECTION_INCIDENT_RESOLUTION_REPORT.md). Este
> informe conserva el estado histórico del momento en que se emitió.

---

## 1. Resumen ejecutivo

El código auditado en QA (`b9ea47d`) y sus correcciones de despliegue (`f175564`, `e64d2f7`, `08d2252`, `6bc1a83`) ya están publicados en GitHub. Se corrigieron cuatro fallos reales de despliegue:

1. `apps/api/src/common/storage/` no se subió a Git porque `.gitignore` ignoraba cualquier carpeta `storage/`.
2. El contenedor de Render ejecutaba `prisma migrate deploy` y fallaba por conectividad; se eliminó esa ejecución del entrypoint.
3. `vercel.json` apuntaba `outputDirectory` a `apps/web/.next`, ruta que se duplicaba con `rootDirectory=apps/web`; se ajustó a `.next`.
4. `SUPABASE_SERVICE_ROLE_KEY` no estaba cargada en Render; ya fue provista por el usuario y **la API arranca correctamente** (deploy `dep-dc2tjkrncjis73dv4n60`, estado `live`).

La web quedó **READY** en Vercel (`dpl_FEw7iuQaFLQueNm8nq2nu5osc11A`, HTTP 200). Brevo quedó configurado y autenticado por IPv4 con el remitente verificado `pierreelpro19@gmail.com`.

El bloqueo actual es la **contraseña de PostgreSQL**: la API alcanza el host de base de datos, pero Postgres responde `Authentication failed against database server, the provided database credentials for 'postgres' are not valid`. Además, el host directo `db.aofqmxnvcbijynfdzhvf.supabase.co` publica solo registro AAAA (IPv6) y Render necesita el **session pooler IPv4**. No se han ejecutado pagos, correos, check-ins ni cargas de comprobantes en producción.

---

## 2. Estado de infraestructura

| Componente       | Referencia                                                   | Estado                                                                                              |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Repositorio      | `pierredevv/gestion_eventos`, rama `master`                  | PASS — commit `6bc1a83` publicado                                                                   |
| Render API       | `gestion-eventos-api` / `srv-dc2sukp42hec73938ou0`           | PASS parcial — deploy `dep-dc2tjkrncjis73dv4n60` `live`; Nest iniciado sin errores de configuración |
| Render URL       | `https://gestion-eventos-api-km0n.onrender.com`              | FAIL funcional — `/api/v1/health/ready` devuelve 503 por base de datos                              |
| Vercel web       | `gestion-eventos` / `prj_o7aFmDDNx9F6qfjttIk4yRxsHpfV`       | PASS — `dpl_FEw7iuQaFLQueNm8nq2nu5osc11A` READY                                                     |
| Vercel URL       | `https://gestion-eventos-pi.vercel.app`                      | PASS — HTTP 200                                                                                     |
| Supabase DB      | `aofqmxnvcbijynfdzhvf`, región `us-east-2`, `ACTIVE_HEALTHY` | BLOCKED — credencial PostgreSQL inválida                                                            |
| Supabase Storage | Buckets `receipts` y `ticket-assets`                         | PASS — creados privados                                                                             |
| Supabase CLI     | v3.4.0, login completado por el usuario                      | PASS — `supabase whoami` autenticado                                                                |
| Brevo SMTP       | `smtp-relay.brevo.com:587`                                   | PASS — `SMTP_AUTH_OK_IPV4`                                                                          |

---

## 3. Evidencia previa reutilizable

Del informe `docs/testing/TESTING_REPORT.md` (_commit base `5032c69`, cierre `b9ea47d`):

- `pnpm test`: 12 suites / 60 pruebas / 0 fallos.
- E2E con Chrome real: 2 General + 1 VIP = 200.00 Bs, 3 tickets, 3 check-ins y rechazo `409` del segundo scan.
- `typecheck`, `lint`, `build`, `format:check` y `openapi:generate`: PASS.
- Base `public`: 19/19 tablas con RLS, 0 políticas, 0 grants para `anon`/`authenticated`.
- Schema `test`: 19 tablas, sin RLS, 0 grants; privilegios revocados sin borrar datos.

Esa evidencia es local/aislada; no equivale a prueba de producción.

---

## 4. Verificaciones de esta fase

| Verificación                                                | Estado        | Evidencia                                                                                      |
| ----------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| Push a GitHub                                               | PASS          | `git ls-remote origin master` = `6bc1a83`                                                      |
| Fuentes Storage en Git                                      | PASS          | Commit `f175564`; build de Render superó TypeScript                                            |
| Entrypoint sin migraciones                                  | PASS          | Commit `e64d2f7`; logs sin `P1001` por `prisma migrate deploy`                                 |
| Configuración Vercel                                        | PASS          | Commit `08d2252`; deploy READY y HTTP 200                                                      |
| Buckets privados Supabase                                   | PASS          | `receipts` y `ticket-assets`, `public=false`                                                   |
| Login Supabase CLI                                          | PASS          | Usuario completó el flujo; `supabase whoami` devolvió identidad autenticada                    |
| Service role en Render                                      | PASS          | API inició sin `SUPABASE_SERVICE_ROLE_KEY is required in production`                           |
| Arranque de Nest en Render                                  | PASS          | Logs: `Nest application successfully started`, `API listening on http://localhost:4000/api/v1` |
| SMTP key Brevo cargada                                      | PASS          | `SMTP_PASSWORD` reemplazado por clave `xsmtpsib-...`                                           |
| Autenticación SMTP                                          | PASS          | `nodemailer.verify()` → `SMTP_AUTH_OK_IPV4`                                                    |
| CORS: origen hostil                                         | PASS          | `POST /auth/login` con `Origin: https://evil.example` → HTTP 403                               |
| CSRF cookie                                                 | PASS          | Cookie `csrf_token` presente tras `GET /health`                                                |
| `/health`                                                   | PASS          | HTTP 200                                                                                       |
| `/health/ready`                                             | FAIL          | HTTP 503; `checks.database.ok=false`, `error=Database unavailable`                             |
| Login admin real                                            | FAIL          | HTTP 500; logs de Render muestran error de autenticación PostgreSQL                            |
| Catálogo, orden, comprobante, aprobación, tickets, check-in | NOT TESTED    | Bloqueado por base de datos                                                                    |
| Correo real                                                 | NO VERIFICADO | SMTP autenticado; aún no se envía correo de prueba                                             |

---

## 5. Bloqueo actual: credencial PostgreSQL

### 5.1 Diagnóstico

- El proyecto está `ACTIVE_HEALTHY` y accesible por MCP (`select 1` → OK).
- `db.aofqmxnvcbijynfdzhvf.supabase.co` tiene solo registro AAAA `2600:1f16:...` (sin A). Render demonstró no poder conectarse por IPv6; eso explica los errores previos `Can't reach database server ...:5432`.
- Probando la URL directa desde este entorno (que sí tiene IPv6), Postgres responde: `Authentication failed against database server, the provided database credentials for 'postgres' are not valid`. Por lo tanto la contraseña actual en Render/local es inválida, no es un problema de red únicamente.
- La solución es usar el **session pooler IPv4** y una contraseña válida. Según la documentación oficial de Supabase, para redes IPv4-only corresponde `postgresql://postgres.<PROJECT-REF>:<PASSWORD>@<POOLER-HOST>:5432/postgres`; el host exacto debe copiarse del diálogo **Connect → Session pooler** del dashboard, no inventarse.

### 5.2 Acción requerida del usuario

Sin pegar secretos en la conversación:

1. En Supabase → Project Settings → Database, restablecer la contraseña de base de datos si no se recuerda la vigente.
2. En Supabase → **Connect** → **Session pooler**, copiar la cadena completa ya construida con la contraseña vigente.
3. Guardar esa cadena **solo** en un archivo local, por ejemplo `/tmp/opencode/database_url.txt`, sin `cat` ni imprimirla en el chat.
4. Avisar que el archivo está listo. El agente cargará el mismo valor en Render como `DATABASE_URL` y `DIRECT_URL`, disparará el deploy y continuará la verificación.

No se borran datos, no se cambia el esquema y no se crea un proyecto nuevo.

### 5.3 Otros hallazgos

- `NEXT_PUBLIC_PAYMENT_QR_URL` sigue vacío hasta que se facilite una imagen real del QR bancario; la UI ya lo advierte.
- La API key de Brevo, la SMTP key y un bearer token de Render quedaron visibles en el transcript previo. Rotar si la conversación puede compartirse.

---

## 6. Variables configuradas

### Render (API)

```text
NODE_ENV=production
PORT=4000
WEB_ORIGIN=https://gestion-eventos-pi.vercel.app
ADDITIONAL_WEB_ORIGINS=https://gestion-eventos-pierreelpro19-gmailcoms-projects.vercel.app,https://gestion-eventos-git-master-pierreelpro19-gmailcoms-projects.vercel.app
COOKIE_SAME_SITE=none
DEFAULT_CURRENCY=BOB
EVENT_TIMEZONE=America/La_Paz
RESERVATION_TTL_MINUTES=25
MAX_RECEIPT_SIZE_MB=5
SUPABASE_STORAGE_BUCKET_RECEIPTS=receipts
SUPABASE_STORAGE_BUCKET_TICKETS=ticket-assets
DATABASE_URL=*** (inválida: contraseña rechazada y host IPv6)
DIRECT_URL=*** (inválida: contraseña rechazada y host IPv6)
SUPABASE_URL=https://aofqmxnvcbijynfdzhvf.supabase.co
TOKEN_ENCRYPTION_KEY=*** (desde .env local)
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=c4655b001@smtp-brevo.com
SMTP_PASSWORD=*** (SMTP key válida cargada)
EMAIL_FROM=pierreelpro19@gmail.com
SUPABASE_SERVICE_ROLE_KEY=*** (cargada; arranque verificado)
```

### Vercel (web)

```text
NEXT_PUBLIC_API_BASE_URL=https://gestion-eventos-api-km0n.onrender.com/api/v1
NEXT_PUBLIC_API_DOCS_URL=https://gestion-eventos-api-km0n.onrender.com/api/docs
NEXT_PUBLIC_API_HEALTH_URL=https://gestion-eventos-api-km0n.onrender.com/api/v1/health/ready
NEXT_PUBLIC_RESERVATION_MINUTES=25
```

---

## 7. Dictamen final

**NOT READY.**

La API ya compila, despliega e inicia; la web está operativa; CORS/CSRF y SMTP están verificados. No se declara `READY FOR PILOT` ni `READY FOR PRODUCTION` porque:

- La contraseña de PostgreSQL es inválida y el host directo es IPv6-only, por lo que `/health/ready` devuelve 503 y el login admin devuelve 500.
- No hay evidencia de flujo completo en los despliegues: catálogo, orden, comprobante, aprobación, tickets, correo y check-in.
- No se ejecutaron operaciones financieras reales.

Tras cargar la cadena del session pooler y verificar healthcheck, login, catálogo, orden, comprobante, aprobación, tickets, correo autorizado y check-in sin pagos reales, este informe debe actualizarse con el dictamen final.
