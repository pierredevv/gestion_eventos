# Informe de preparación operativa y dictamen de producción

**Proyecto:** Plataforma de gestión de eventos  
**Fecha:** 2026-11-24  
**Repositorio:** https://github.com/pierredevv/gestion_eventos  
**Commit desplegado:** `08d2252`  
**Supabase reutilizado:** `aofqmxnvcbijynfdzhvf` (producción, sin borrado de datos)  
**Dictamen:** **NOT READY** — configuración incompleta; no se declara producción operativa.

---

## 1. Resumen ejecutivo

El código auditado en QA (`b9ea47d`) y sus correcciones de despliegue (`f175564`, `e64d2f7`, `08d2252`) ya están publicados en GitHub. Se crearon los servicios de hosting y se corrigieron tres fallos reales de despliegue:

1. `apps/api/src/common/storage/` no se subió a Git porque `.gitignore` ignoraba cualquier carpeta `storage/`.
2. El contenedor de Render ejecutaba `prisma migrate deploy` y fallaba por conectividad al pooler; se eliminó esa ejecución del entrypoint.
3. `vercel.json` apuntaba `outputDirectory` a `apps/web/.next`, ruta que se duplicaba al combinarla con `rootDirectory=apps/web`; se ajustó a `.next`.

La web quedó **READY** en Vercel con el despliegue `dpl_FEw7iuQaFLQueNm8nq2nu5osc11A`. La API sigue **bloqueada** en Render únicamente por `SUPABASE_SERVICE_ROLE_KEY`: las variables SMTP ya están cargadas, pero la autenticación contra Brevo fue rechazada desde esta IP (`535 5.7.8`) y queda pendiente autorizar/quitar la restricción de IP. No se han ejecutado pagos, correos, check-ins ni cargas de comprobantes en producción.

---

## 2. Estado de infraestructura

| Componente | Referencia | Estado |
| --- | --- | --- |
| Repositorio | `pierredevv/gestion_eventos`, rama `master` | PASS — commit `08d2252` publicado |
| Render API | `gestion-eventos-api` / `srv-dc2sukp42hec73938ou0` | BLOCKED — build OK, arranque rechazado por variables faltantes |
| Render URL | `https://gestion-eventos-api-km0n.onrender.com` | FAIL — `/api/v1/health/ready` devolvió 503 |
| Vercel web | Proyecto `gestion-eventos` / `prj_o7aFmDDNx9F6qfjttIk4yRxsHpfV` | PASS — despliegue `dpl_FEw7iuQaFLQueNm8nq2nu5osc11A` READY |
| Vercel URL | `https://gestion-eventos-pi.vercel.app` | PASS — HTTP 200, contenido de la web verificado |
| Supabase DB | `aofqmxnvcbijynfdzhvf` | PASS parcial — migración aplicada; sin datos de producción creados |
| Supabase Storage | Buckets `receipts` y `ticket-assets` | PASS — creados privados |

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
| SMTP cargado en Render | CONFIGURADO / AUTH FAIL | Variables cargadas; `nodemailer.verify()` devolvió `EAUTH 535 5.7.8` desde IP `166.114.162.186` |
| CORS/CSRF entre dominios | CONFIGURADO / NO VERIFICADO | `WEB_ORIGIN` y `ADDITIONAL_WEB_ORIGINS` cargados en Render |
| Healthcheck real de API | FAIL | HTTP 503 |
| Login admin | NOT TESTED | API caída |
| Catálogo y orden real | NOT TESTED | API caída |
| Comprobante real | NOT TESTED | API caída |
| Aprobación y emisión de tickets | NOT TESTED | API caída |
| Correo real | NOT TESTED | Sin credenciales Brevo |
| Check-in real | NOT TESTED | API caída |

---

## 5. Bloqueos

### 5.1 Credenciales pendientes en Render

Cargar directamente en el dashboard del servicio `gestion-eventos-api`, sin pegarlas en la conversación:

```text
SUPABASE_SERVICE_ROLE_KEY=<secret key de Supabase>
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<usuario Brevo>
SMTP_PASSWORD=<clave SMTP Brevo>
EMAIL_FROM=<remitente verificado en Brevo>
```

Para obtener el service role con CLI:

```bash
supabase login
supabase projects api-keys --remote=aofqmxnvcbijynfdzhvf --reveal
```

Copiar el valor `sb_secret_...` / `service_role` como `SUPABASE_SERVICE_ROLE_KEY`.

### 5.2 Correo

Se eligió **Brevo (SMTP)**. Se cargaron `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`, `SMTP_PASSWORD` y `EMAIL_FROM=c4655b001@smtp-brevo.com`. La verificación de autenticación SMTP falló con `EAUTH 535 5.7.8` y la API de Brevo rechazó la IP `166.114.162.186`. El usuario autorizará la IP o desactivará la restricción. No se enviarán correos reales sin autorización explícita, y `EMAIL_FROM` debe ser un remitente/dominio verificado en Brevo para que la entrega sea aceptada.

### 5.3 Seguridad de credenciales

Durante la revisión de configuración se imprimió accidentalmente un bearer token de Render en el transcript. Si ese transcript se comparte, rotar el token de acceso de Render.

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
SMTP_USER=*** (cargado)
SMTP_PASSWORD=*** (cargado)
EMAIL_FROM=c4655b001@smtp-brevo.com
SUPABASE_SERVICE_ROLE_KEY=*** (pendiente de carga por el usuario)
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

- La API no arranca en Render: falta `SUPABASE_SERVICE_ROLE_KEY`.
- La autenticación SMTP de Brevo fue rechazada por restricción de IP; el correo real no está validado.
- El healthcheck de producción devolvió 503.
- No hay evidencia de correo real, subida real a Storage ni flujo completo de compra en los despliegues.
- La web sí quedó READY, pero eso no habilita la operación completa sin la API.

Una vez cargadas las credenciales y tras verificar healthcheck, CORS, login, catálogo, orden, comprobante, aprobación, tickets, correo y check-in sin operaciones financieras reales, este informe debe actualizarse con el dictamen final.
