# Informe de preparación operativa y dictamen de producción

**Proyecto:** Plataforma de gestión de eventos  
**Fecha:** 2026-11-24  
**Repositorio:** https://github.com/pierredevv/gestion_eventos  
**Commit desplegado:** `08d2252`  
**Supabase reutilizado:** `aofqmxnvcbijynfdzhvf` (producción, sin borrado de datos)  
**Dictamen:** **NOT READY** — credenciales operativas incompletas; no se declara producción operativa.

---

## 1. Resumen ejecutivo

El código auditado en QA (`b9ea47d`) y sus correcciones de despliegue (`f175564`, `e64d2f7`, `08d2252`) ya están publicados en GitHub. Se crearon los servicios de hosting y se corrigieron tres fallos reales de despliegue:

1. `apps/api/src/common/storage/` no se subió a Git porque `.gitignore` ignoraba cualquier carpeta `storage/`.
2. El contenedor de Render ejecutaba `prisma migrate deploy` y fallaba por conectividad al pooler; se eliminó esa ejecución del entrypoint.
3. `vercel.json` apuntaba `outputDirectory` a `apps/web/.next`, ruta que se duplicaba al combinarla con `rootDirectory=apps/web`; se ajustó a `.next`.

La web quedó **READY** en Vercel con el despliegue `dpl_FEw7iuQaFLQueNm8nq2nu5osc11A`. La IP IPv4 autorizada por Brevo ya responde 200 y el remitente verificado confirmado es `pierreelpro19@gmail.com`, cargado como `EMAIL_FROM`.

La API sigue **bloqueada** en Render por dos credenciales:

- `SUPABASE_SERVICE_ROLE_KEY` aún no está cargada.
- La clave `xkeysib-...` proporcionada es una **API key** de Brevo, no una **SMTP key** (`xsmtpsib-...`). Brevo rechaza el login SMTP con `535 5.7.8`.

Además, las consultas a la API de Brevo desde este entorno salen por IPv6 `2800:cd0:...`, que Brevo todavía marca como no autorizada. No se han ejecutado pagos, correos, check-ins ni cargas de comprobantes en producción.

---

## 2. Estado de infraestructura

| Componente | Referencia | Estado |
| --- | --- | --- |
| Repositorio | `pierredevv/gestion_eventos`, rama `master` | PASS — commit `08d2252` publicado |
| Render API | `gestion-eventos-api` / `srv-dc2sukp42hec73938ou0` | BLOCKED — build OK, arranque rechazado por credenciales |
| Render URL | `https://gestion-eventos-api-km0n.onrender.com` | FAIL — `/api/v1/health/ready` devolvió 503 |
| Vercel web | Proyecto `gestion-eventos` / `prj_o7aFmDDNx9F6qfjttIk4yRxsHpfV` | PASS — despliegue `dpl_FEw7iuQaFLQueNm8nq2nu5osc11A` READY |
| Vercel URL | `https://gestion-eventos-pi.vercel.app` | PASS — HTTP 200, contenido de la web verificado |
| Supabase DB | `aofqmxnvcbijynfdzhvf` | PASS parcial — migración aplicada; sin datos de producción creados |
| Supabase Storage | Buckets `receipts` y `ticket-assets` | PASS — creados privados |
| Supabase CLI | Global vía pnpm, versión `3.4.0` | PASS — `supabase` disponible en PATH |
| Brevo API | `api.brevo.com/v3/account` | PASS parcial — IPv4 autorizado; IPv6 pendiente |

---

## 3. Evidencia previa reutilizable

Del informe `docs/testing/TESTING_REPORT.md` (_commit base `5032c69`, cierre `b9ea47d`):

- `pnpm test`: 12 suites / 60 pruebas / 0 fallos.
- E2E con Chrome real: scenario obligatorio 2 General + 1 VIP = 200.00 Bs, 3 tickets, 3 check-ins y rechazo `409` del segundo scan.
- `typecheck`, `lint`, `build`, `format:check` y `openapi:generate`: PASS.
- Base `public`: 19/19 tablas con RLS, 0 políticas, 0 grants para `anon`/`authenticated`.
- Schema `test`: 19 tablas, sin RLS, 0 grants; se revocaron además privilegios de esquema y tablas durante esta fase, sin borrar datos.

Esta evidencia es **local/aislada**. No equivale a prueba de producción.

---

## 4. Verificaciones de esta fase

| Verificación | Estado | Evidencia |
| --- | --- | --- |
| Push a GitHub | PASS | `git ls-remote origin master` = `08d2252` |
| Corrección de fuentes Storage en Git | PASS | Commit `f175564`; build de Render superó TypeScript |
| Eliminación de migraciones en el contenedor | PASS | Commit `e64d2f7`; logs ya no muestran `P1001` por `prisma migrate deploy` |
| Configuración Vercel corregida | PASS | Commit `08d2252`; despliegue READY y URL con HTTP 200 |
| Buckets privados Supabase | PASS | `receipts` y `ticket-assets`, `public=false` |
| Revocación de privilegios en `test` | PASS | SQL ejecutado; sin borrado de datos |
| Instalación global de Supabase CLI | PASS | `pnpm add -g supabase@3.4.0`; `command -v supabase` disponible |
| Login Supabase en navegador | EN CURSO | Flujo abierto automáticamente; el usuario debe completarlo |
| Brevo IPv4 autorizado | PASS | `api.brevo.com/v3/account` respondió 200 desde IPv4 |
| Brevo IPv6 autorizado | FAIL | `2800:cd0:...` rechazada con `unrecognised IP` |
| Remitente Brevo verificado | PASS | `pierreelpro19@gmail.com` listado como sender activo |
| SMTP autenticación | FAIL | `EAUTH 535 5.7.8`; la clave cargada es API key, no SMTP key |
| CORS/CSRF entre dominios | CONFIGURADO / NO VERIFICADO | `WEB_ORIGIN` y `ADDITIONAL_WEB_ORIGINS` cargados en Render |
| Healthcheck real de API | FAIL | HTTP 503 |
| Login admin | NOT TESTED | API caída |
| Catálogo y orden real | NOT TESTED | API caída |
| Comprobante real | NOT TESTED | API caída |
| Aprobación y emisión de tickets | NOT TESTED | API caída |
| Correo real | BLOCKED | Falta SMTP key y autorización IPv6 |
| Check-in real | NOT TESTED | API caída |

---

## 5. Bloqueos

### 5.1 Credenciales pendientes en Render

Cargar directamente en el dashboard del servicio `gestion-eventos-api`, sin pegarlas en la conversación:

```text
SUPABASE_SERVICE_ROLE_KEY=<secret key de Supabase>
SMTP_PASSWORD=<SMTP key de Brevo, xsmtpsib-...>
```

El resto de variables ya están cargadas. Para obtener el service role con el CLI instalado globalmente:

```bash
supabase login
supabase projects api-keys --remote=aofqmxnvcbijynfdzhvf --reveal --output json
```

El valor secreto se guardará localmente en `/tmp/opencode/` y no se imprimirá en el transcript.

### 5.2 Correo Brevo

Se eligió **Brevo (SMTP)**. Estado real:

- Se cargaron `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=c4655b001@smtp-brevo.com` y `EMAIL_FROM=pierreelpro19@gmail.com`.
- El remitente `pierreelpro19@gmail.com` está verificado en Brevo.
- La clave `xkeysib-...` entregada es una **API key**. Brevo SMTP exige una **SMTP key** con prefijo `xsmtpsib-...`, generada en Brevo → Settings → SMTP & API → SMTP keys. Esa clave debe reemplazar el valor actual de `SMTP_PASSWORD`.
- La IP IPv4 `166.114.162.186` quedó autorizada, pero las consultas desde este entorno también salen por IPv6 `2800:cd0:...` y Brevo la rechaza. Recomendación: desactivar la restricción por IP o agregar también el rango IPv6.
- No hay herramienta MCP de Brevo expuesta en este entorno; la configuración se hizo directamente contra Brevo y Render.
- No se enviarán correos reales sin autorización explícita.

### 5.3 Seguridad de credenciales

- La API key de Brevo y el presunto MCP key quedaron visibles en el transcript. Rotarlos si la conversación puede compartirse.
- Durante la revisión de configuración se imprimió accidentalmente un bearer token de Render en el transcript. Si ese transcript se comparte, rotar también el token de acceso de Render.

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
DATABASE_URL=*** (desde .env local)
DIRECT_URL=*** (desde .env local)
SUPABASE_URL=*** (desde .env local)
TOKEN_ENCRYPTION_KEY=*** (desde .env local)
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=c4655b001@smtp-brevo.com
SMTP_PASSWORD=*** (API key cargada; reemplazar por SMTP key)
EMAIL_FROM=pierreelpro19@gmail.com
SUPABASE_SERVICE_ROLE_KEY=*** (pendiente de carga)
```

### Vercel (web)

```text
NEXT_PUBLIC_API_BASE_URL=https://gestion-eventos-api-km0n.onrender.com/api/v1
NEXT_PUBLIC_API_DOCS_URL=https://gestion-eventos-api-km0n.onrender.com/api/docs
NEXT_PUBLIC_API_HEALTH_URL=https://gestion-eventos-api-km0n.onrender.com/api/v1/health/ready
NEXT_PUBLIC_RESERVATION_MINUTES=25
```

`NEXT_PUBLIC_PAYMENT_QR_URL` queda vacío hasta que se facilite la imagen real del QR bancario; la UI ya muestra esa advertencia.

---

## 7. Dictamen final

**NOT READY.**

No se declara `READY FOR PILOT` ni `READY FOR PRODUCTION` porque:

- La API no arranca en Render: faltan `SUPABASE_SERVICE_ROLE_KEY` y una SMTP key válida.
- La autenticación SMTP de Brevo fue rechazada por usar una API key como contraseña.
- La IP IPv6 de este entorno sigue sin autorización en Brevo.
- El healthcheck de producción devolvió 503.
- No hay evidencia de correo real, subida real a Storage ni flujo completo de compra en los despliegues.
- La web sí quedó READY, pero eso no habilita la operación completa sin la API.

Una vez cargadas las credenciales y tras verificar healthcheck, CORS, login, catálogo, orden, comprobante, aprobación, tickets, correo y check-in sin operaciones financieras reales, este informe debe actualizarse con el dictamen final.
