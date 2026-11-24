# Informe de despliegue y configuración — NEXT LEVEL

**Fecha:** 2026-11-24  
**Repositorio:** https://github.com/pierredevv/gestion_eventos  
**Rama:** `master`  
**Commit de código desplegado:** `4fb84b6`

**Commit de la API desplegada en Render:** `4fb84b6` (deploy `dep-dc2uqu3l550s73c9rm60`, estado `live`)

**Commit del frontend desplegado en Vercel:** `4fb84b6` (deploy `dpl_9iMKRvZmpDYhmesjk7CL3dUK8KLG`, `READY`)

**Dictamen actualizado:** **READY para administración.** Web y API operativas, conexión a PostgreSQL funcionando, catálogo `/events?limit=100` → 200, panel administrativo accesible y evento **NEXT LEVEL creado como DRAFT**, sin publicar y sin ventas habilitadas.

> **Actualización 2026-11-24 19:23 UTC:** el bloqueo de conexión a PostgreSQL quedó resuelto mediante
> el session pooler IPv4 de Supabase. Ver
> [`DB_CONNECTION_INCIDENT_RESOLUTION_REPORT.md`](DB_CONNECTION_INCIDENT_RESOLUTION_REPORT.md).
>
> **Actualización 2026-11-24 20:07 UTC:** se corrigió el `import type` de `ListEventsDto` que causaba el
> 400 del catálogo, se publicaron los cambios para `location`/`address` opcionales y se creó NEXT LEVEL
> desde la API administrativa con sesión real. Las secciones técnicas posteriores conservan el estado
> original de la investigación; esta nota y la sección 14 reflejan el estado final verificado.

> Clasificación usada: **PASS** = verificado con evidencia; **FAIL** = verificado y negativo; **BLOCKED** = impedimento real que requiere acción/autorizaciónn; **NOT TESTED** = no ejecutado.

---

## 1. Infraestructura utilizada

| Componente       | Referencia                                                                                            | Estado                                            | Clasificación                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| GitHub           | `pierredevv/gestion_eventos`, rama `master`                                                           | Sin cambios sin commitear; HEAD `d044fc8`         | PASS                                           |
| Vercel (web)     | Proyecto `gestion-eventos` / `prj_o7aFmDDNx9F6qfjttIk4yRxsHpfV`, team `team_573tpVpu53whMEZIAx4WV1VI` | Deploy `dpl_926EfXzqEgvtDzToPfHSBVPcMjDC` `READY` | PASS                                           |
| Render (API)     | `gestion-eventos-api` / `srv-dc2sukp42hec73938ou0`, plan `free`, región `oregon`, Docker              | Servicio `live`; arranque de Nest correcto        | PASS (despliegue) / FAIL (operación)           |
| Railway          | No utilizado; reemplazado por Render por decisión del usuario                                         | Sin servicio, sin configuración, sin dependencia  | NOT TESTED (fuera de alcance)                  |
| Supabase (DB)    | Proyecto `aofqmxnvcbijynfdzhvf`, región `us-east-2`, `ACTIVE_HEALTHY`                                 | Acceso MCP/SQL PASS; acceso desde la app FAIL     | PASS / FAIL                                    |
| Supabase Storage | Buckets privados `receipts` y `ticket-assets`                                                         | Existen y son privados                            | PASS (existencia) / NOT TESTED (subida real)   |
| Brevo SMTP       | `smtp-relay.brevo.com:587`, remitente verificado `pierreelpro19@gmail.com`                            | `nodemailer.verify()` → `SMTP_AUTH_OK_IPV4`       | PASS (autenticación) / NOT TESTED (envío real) |
| Supabase CLI     | v3.4.0, login completado por el usuario                                                               | `supabase whoami` autenticado                     | PASS                                           |

No se creó un proyecto nuevo, no se borraron datos, no se aplicaron migraciones destructivas y no se ejecutaron operaciones financieras reales.

---

## 2. URLs de producción

| Uso                   | URL                                                               |
| --------------------- | ----------------------------------------------------------------- |
| Web pública           | https://gestion-eventos-pi.vercel.app                             |
| API base              | https://gestion-eventos-api-km0n.onrender.com/api/v1              |
| Documentación OpenAPI | https://gestion-eventos-api-km0n.onrender.com/api/docs            |
| Health simple         | https://gestion-eventos-api-km0n.onrender.com/api/v1/health       |
| Health readiness      | https://gestion-eventos-api-km0n.onrender.com/api/v1/health/ready |
| Dashboard Render      | https://dashboard.render.com/web/srv-dc2sukp42hec73938ou0         |

Verificación: web `HTTP 200`; `/health` `HTTP 200`; `/health/ready` `HTTP 503`.

---

## 3. Estado de Vercel

| Verificación                  | Resultado                                                                                                                  | Clasificación |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Deploy de `d044fc8`           | `dpl_926EfXzqEgvtDzToPfHSBVPcMjDC`, estado `READY`, target `production`                                                    | PASS          |
| URL pública                   | `https://gestion-eventos-pi.vercel.app` responde `HTTP 200` y renderiza la web                                             | PASS          |
| Build                         | `pnpm build`, `outputDirectory=.next`, `rootDirectory=apps/web`                                                            | PASS          |
| Variables públicas inyectadas | `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_API_DOCS_URL`, `NEXT_PUBLIC_API_HEALTH_URL`, `NEXT_PUBLIC_RESERVATION_MINUTES=25` | PASS          |
| QR de pago                    | `NEXT_PUBLIC_PAYMENT_QR_URL` no configurado                                                                                | BLOCKED       |

---

## 4. Estado de Railway

**Clasificación: NOT TESTED.** Railway no forma parte del despliegue actual. El usuario confirmó que la API se aloja en Render (“es render, no railway”). No hay servicios, variables ni dominios de Railway que verificar.

---

## 5. Estado de Supabase

| Verificación                             | Resultado                                                                                                                                                                                | Clasificación              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Proyecto                                 | `aofqmxnvcbijynfdzhvf`, `ACTIVE_HEALTHY`, PostgreSQL 17.12                                                                                                                               | PASS                       |
| Consulta SQL vía MCP                     | `select 1` → OK                                                                                                                                                                          | PASS                       |
| Host directo                             | `db.aofqmxnvcbijynfdzhvf.supabase.co` publica solo AAAA IPv6 (`2600:1f16:...`), sin registro A                                                                                           | FAIL para Render IPv4-only |
| Contraseña PostgreSQL provista           | `postgresql://postgres:***@db.aofq...:5432/postgres` → Postgres responde `Authentication failed against database server, the provided database credentials for 'postgres' are not valid` | FAIL                       |
| Pooler IPv4 `aws-0-us-east-2`            | `tenant/user postgres.aofqmxnvcbijynfdzhvf not found`                                                                                                                                    | FAIL                       |
| Pooler IPv4 `aws-1-us-east-2`            | Autenticación rechazada con la misma contraseña                                                                                                                                          | FAIL                       |
| Intento de alinear la contraseña vía SQL | `alter role postgres ...` → `42501: permission denied to alter privileged roles`                                                                                                         | BLOCKED                    |
| Buckets Storage                          | `receipts`, `ticket-assets`, ambos `public=false`                                                                                                                                        | PASS                       |
| RLS                                      | 19/19 tablas en `public` con RLS, 0 políticas, 0 grants `anon`/`authenticated` (evidencia previa)                                                                                        | PASS                       |
| Schema `test`                            | Conservado, sin privilegios públicos; usado solo en QA local                                                                                                                             | PASS                       |
| Datos                                    | 0 eventos, 0 tipos de entrada, 0 órdenes, 0 tickets, 0 comprobantes                                                                                                                      | PASS (sin datos creados)   |

La base de datos **sí responde** a consultas administrativas por MCP; **no acepta** las credenciales configuradas en la aplicación. No es un fallo de código.

---

## 6. Conexiones verificadas

| Conexión                    | Evidencia                                                                            | Clasificación                   |
| --------------------------- | ------------------------------------------------------------------------------------ | ------------------------------- |
| Web → API (HTTP)            | `NEXT_PUBLIC_API_BASE_URL` apunta a Render; `/api/v1/health` respondió `200`         | PASS                            |
| Web → API (flujo funcional) | `/health/ready` `503`; `/auth/login` `500` por PostgreSQL                            | FAIL                            |
| Render → PostgreSQL         | Logs: `Authentication failed ... for 'postgres'`                                     | FAIL                            |
| MCP → PostgreSQL            | `select 1` → OK                                                                      | PASS                            |
| Render → Supabase Storage   | Buckets creados; subida real no ejecutada                                            | NOT TESTED                      |
| Render → Brevo SMTP         | `SMTP_AUTH_OK_IPV4`                                                                  | PASS                            |
| Envío real de correo        | No ejecutado                                                                         | NOT TESTED                      |
| GitHub → Render             | Deploy `dep-dc2tskd9el5s73crctg0` con commit `d044fc8`                               | PASS                            |
| GitHub → Vercel             | Deploy `dpl_926EfXzqEgvtDzToPfHSBVPcMjDC` con commit `d044fc8`                       | PASS                            |
| CORS / CSRF                 | Origen hostil → `403`; cookie `csrf_token` presente; flujo de login bloqueado por DB | PASS (CORS/CSRF) / FAIL (login) |

---

## 7. Variables de entorno verificadas (sin secretos)

### Render — API

| Variable                                                                                            | Estado                                                 | Clasificación |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------- |
| `NODE_ENV`, `PORT`                                                                                  | Configuradas                                           | PASS          |
| `WEB_ORIGIN`, `ADDITIONAL_WEB_ORIGINS`, `COOKIE_SAME_SITE`                                          | Configuradas; CORS hostil rechazado                    | PASS          |
| `DEFAULT_CURRENCY=BOB`, `EVENT_TIMEZONE=America/La_Paz`                                             | Configuradas                                           | PASS          |
| `RESERVATION_TTL_MINUTES=25`, `MAX_RECEIPT_SIZE_MB=5`                                               | Configuradas                                           | PASS          |
| `SUPABASE_STORAGE_BUCKET_RECEIPTS=receipts`, `SUPABASE_STORAGE_BUCKET_TICKETS=ticket-assets`        | Configuradas; buckets existen                          | PASS          |
| `SUPABASE_URL`                                                                                      | `https://aofqmxnvcbijynfdzhvf.supabase.co`             | PASS          |
| `DATABASE_URL`, `DIRECT_URL`                                                                        | Configuradas pero **rechazadas** por Postgres          | FAIL          |
| `TOKEN_ENCRYPTION_KEY`                                                                              | Configurada (valor no mostrado)                        | PASS          |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                         | Configurada; la API arranca sin error de configuración | PASS          |
| `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`, `EMAIL_FROM` | Configuradas                                           | PASS          |
| `SMTP_PASSWORD`                                                                                     | SMTP key Brevo cargada; autenticación verificada       | PASS          |
| `NEXT_PUBLIC_PAYMENT_QR_URL`                                                                        | No aplica en API; se configura en Vercel               | BLOCKED       |

### Vercel — Web

| Variable                          | Valor/estado                                                        | Clasificación |
| --------------------------------- | ------------------------------------------------------------------- | ------------- |
| `NEXT_PUBLIC_API_BASE_URL`        | `https://gestion-eventos-api-km0n.onrender.com/api/v1`              | PASS          |
| `NEXT_PUBLIC_API_DOCS_URL`        | `https://gestion-eventos-api-km0n.onrender.com/api/docs`            | PASS          |
| `NEXT_PUBLIC_API_HEALTH_URL`      | `https://gestion-eventos-api-km0n.onrender.com/api/v1/health/ready` | PASS          |
| `NEXT_PUBLIC_RESERVATION_MINUTES` | `25`                                                                | PASS          |
| `NEXT_PUBLIC_PAYMENT_QR_URL`      | **No configurada**                                                  | BLOCKED       |

Ningún secreto se muestra en este documento.

---

## 8. Estado de migraciones

| Verificación                        | Resultado                                                 | Clasificación |
| ----------------------------------- | --------------------------------------------------------- | ------------- |
| Migraciones en `_prisma_migrations` | 1 total, 1 finalizada, 0 revertidas                       | PASS          |
| Última finalización                 | `2026-11-23T03:59:19Z`                                    | PASS          |
| Ejecución automática en Render      | **No**; se eliminó `prisma migrate deploy` del entrypoint | PASS          |
| Cambios de esquema en esta sesión   | Ninguno                                                   | PASS          |

---

## 9. Pruebas realizadas

### Evidencia previa reutilizable (`docs/testing/TESTING_REPORT.md`)

| Prueba                                                           | Resultado                                                                 | Clasificación |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------- |
| `pnpm test`                                                      | 12 suites / 60 pruebas / 0 fallos                                         | PASS          |
| `typecheck`, `lint`, `build`, `format:check`, `openapi:generate` | PASS                                                                      | PASS          |
| E2E Playwright con Chrome (schema `test`)                        | 2 General + 1 VIP = 200.00 Bs, 3 tickets, 3 check-ins, segundo scan `409` | PASS          |
| RLS / grants                                                     | 19/19 tablas con RLS, 0 grants públicos                                   | PASS          |

Esta evidencia es **local y aislada**; no demuestra operación en producción.

### Pruebas de esta fase

| Prueba                                                         | Resultado                                                             | Clasificación        |
| -------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| Deploy Vercel de `d044fc8`                                     | `READY`                                                               | PASS                 |
| HTTP de la web pública                                         | `200`                                                                 | PASS                 |
| Deploy Render de `d044fc8`                                     | `dep-dc2tskd9el5s73crctg0` estado `live`; arranque de Nest verificado | PASS                 |
| `/health` en producción                                        | `200`                                                                 | PASS                 |
| `/health/ready` en producción                                  | `503`, `database.ok=false`                                            | FAIL                 |
| Login admin en producción                                      | `500`                                                                 | FAIL                 |
| CORS con origen hostil                                         | `403`                                                                 | PASS                 |
| CSRF cookie                                                    | Presente                                                              | PASS                 |
| Conexión directa PostgreSQL con la credencial provista         | `Authentication failed`                                               | FAIL                 |
| Conexión pooler `aws-0`                                        | `tenant/user not found`                                               | FAIL                 |
| Conexión pooler `aws-1`                                        | `Authentication failed`                                               | FAIL                 |
| Cambio de contraseña vía SQL                                   | Permiso denegado                                                      | BLOCKED              |
| Autenticación SMTP Brevo                                       | `SMTP_AUTH_OK_IPV4`                                                   | PASS                 |
| Envío real de correo                                           | No ejecutado                                                          | NOT TESTED           |
| Subida real de comprobante                                     | No ejecutada                                                          | NOT TESTED           |
| Compra, aprobación, emisión de tickets, check-in en producción | No ejecutados                                                         | NOT TESTED / BLOCKED |

---

## 10. Problemas encontrados

1. **Contraseña PostgreSQL inválida (bloqueante).** La cadena entregada usa la misma credencial que ya estaba en `.env`; Postgres la rechaza. No es un problema de DNS ni de código.
2. **Host directo IPv6-only.** `db.aofq...supabase.co` no tiene registro A; Render necesita el session pooler IPv4. El host exacto del pooler debe copiarse del diálogo **Connect** de Supabase; `aws-0` no reconoce el tenant y `aws-1` rechaza la contraseña.
3. **No se pudo corregir la contraseña por SQL.** La cuenta `postgres` es privilegiada y `ALTER ROLE` fue denegado (`42501`). Requiere cambio desde el dashboard de Supabase.
4. **Panel administrativo inaccesible.** `/auth/login` devuelve `500` por el problema de DB, así que no se pudo usar la UI para crear el evento.
5. **El evento NEXT LEVEL no se pudo crear sin inventar datos.** `location` y `address` son obligatorios con mínimo 2 caracteres en DB, DTO y UI; `registrationStart`/`registrationEnd` y `salesStart`/`salesEnd` también son obligatorios y no fueron confirmados.
6. **Campos no soportados por el sistema.** No existen columnas/DTO/UI para eslogan, categoría, organizador, teléfono/email de contacto, programa/speakers ni logotipo del evento. Agregarlos sería una funcionalidad nueva, explícitamente prohibida.
7. **QR de pago global, no por evento.** Se configura mediante `NEXT_PUBLIC_PAYMENT_QR_URL` en Vercel y requiere rebuild; no hay campo por evento ni endpoint de carga.
8. **Sin QR real.** No se utilizó ningún QR ficticio ni de otro evento.
9. **Detalle menor de UI:** el filtro “Aprobados” en administración de pagos envía `status=APPROVED`, pero el enum del servidor es `ACCEPTED` (hallazgo de código, no corregido por ser cambio funcional).

---

## 11. Estado de la creación del evento NEXT LEVEL

**Clasificación final: RESUELTO. El evento fue creado como DRAFT.**

Registro creado y verificado:

| Campo                  | Valor persistido                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| ID                     | `ee88d1db-8d78-44dc-bae0-dda9456362d6`                                                                    |
| Slug                   | `next-level`                                                                                              |
| Título                 | `NEXT LEVEL`                                                                                              |
| Estado                 | `DRAFT` (`publishedAt = null`)                                                                            |
| `location` / `address` | `null` / `null`; la UI muestra “Por definir”                                                              |
| Evento                 | `2026-11-27T10:00:00-04:00` → `2026-11-27T12:30:00-04:00`                                                 |
| Inscripción            | `2026-11-24T16:30:00-04:00` → `2026-11-27T10:00:00-04:00`                                                 |
| Entrada `General`      | 50.00 BOB, cupo 120, ventas `2026-11-24T16:30:00-04:00` → `2026-11-27T10:00:00-04:00`, `isActive = false` |

El eslogan, la categoría, el organizador, el contacto y el programa se conservaron dentro de
`description`, usando solo campos existentes. No se crearon campos nuevos, no se publicó el evento,
no se habilitaron ventas y no se cargó ningún logo porque no se entregó el archivo.

Estado original de la investigación (histórico):

Datos confirmados que se respetaron y NO se inventaron:

| Dato                    | Valor confirmado                                                   | Situación en el sistema                            |
| ----------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Nombre                  | `NEXT LEVEL`                                                       | No persistido                                      |
| Eslogan                 | `Más allá del conocimiento`                                        | Sin campo; no persistido                           |
| Descripción / subtítulo | `Desarrollo de habilidades para destacar en el mundo profesional.` | No persistido                                      |
| Categoría               | `Ciclo de conferencias`                                            | Sin campo; no persistido                           |
| Fecha                   | `2026-11-27`                                                       | No persistido                                      |
| Horario                 | `10:00` a `12:30`, `America/La_Paz`                                | No persistido                                      |
| Organizador             | Mozilla Bolivia                                                    | Sin campo; no persistido                           |
| Contacto                | `+591 73670858`, `plantarrosap@gmail.com`                          | Sin campo de evento; no persistido                 |
| Lugar / dirección       | “Por definir”                                                      | Campo obligatorio mínimo 2 caracteres; impedimento |
| Entrada                 | `General`, `50 BOB`, cupo `120`, única                             | No persistido                                      |
| Programa                | David Aróstegui / BREAK / Roque Bueno                              | Sin campo; no persistido                           |
| Identidad visual        | Logotipo NEXT LEVEL                                                | Archivo no entregado; sin endpoint de carga        |

Impedimentos exactos:

- `POST /api/v1/admin/events` exige `location` (2–180) y `address` (2–255); la UI también valida ambos. No se permitió introducir texto no confirmado.
- `registrationStart` y `registrationEnd` son obligatorios y no fueron confirmados.
- `POST /api/v1/admin/events/{id}/ticket-types` exige `salesStart` y `salesEnd`, tampoco confirmados.
- No existen campos para eslogan, categoría, organizador, contacto, programa ni logo.
- La API administrativa no es usable por la credencial de DB inválida.
- No se usó SQL directo para evadir validaciones, porque el usuario pidió informar el impedimento antes de modificar el sistema y no inventar datos.

**No se publicó el evento, no se abrieron ventas y no se creó ningún tipo de entrada.**

---

## 12. Datos pendientes de confirmación

1. Lugar y dirección reales del evento (editables en el panel una vez creado).
2. Ventana de registro (`registrationStart` / `registrationEnd`).
3. Ventana de ventas del tipo `General` (`salesStart` / `salesEnd`).
4. Archivo real del QR bancario estático y su URL pública estable.
5. Instrucciones de pago visibles para el comprador (referencia, monto exacto a pagar, alineación con 50 Bs).
6. Decisión sobre los datos sin campo en el sistema: eslogan, categoría, organizador, contacto, programa/speakers e identidad visual. Hoy solo podrían conservarse fuera del sistema; guardarlos exigiría un cambio de esquema/UI no autorizado.
7. Corrección de la credencial PostgreSQL para poder usar el panel administrativo y verificar flujos reales.

---

## 13. Procedimiento para cargar el QR bancario

Estado actual: **BLOCKED — no cargado**. No se usó ningún QR ficticio.

El sistema trata el QR como **configuración global**, no por evento:

1. Obtener el archivo real del QR de la organización (PNG/JPG/SVG/webp; el frontend no valida formato, solo renderiza una URL de imagen; recomendable HTTPS).
2. Publicar ese archivo en una URL pública y estable. No se hizo: los buckets de Supabase existentes son privados y no se autorizó crear un bucket público ni modificar `public/`.
3. En Vercel → Proyecto `gestion-eventos` → Settings → Environment Variables, configurar:

   ```text
   NEXT_PUBLIC_PAYMENT_QR_URL=https://<url-publica-del-archivo-qr>
   ```

   en `production` y `preview`.

4. Redesplegar la web: `NEXT_PUBLIC_*` se sustituye en tiempo de build.
5. Verificar en una orden con estado `PENDING_PAYMENT` que aparece la imagen con alt “QR bancario estático proporcionado por la organización”.
6. Solo después de comprobar el flujo de pago con el QR real, publicar el evento y abrir ventas.

Observación: no se habilitaron ventas pagadas y no se ejecutaron pagos reales.

---

## 14. Estado final del despliegue

| Ítem                         | Clasificación | Resumen                                                               |
| ---------------------------- | ------------- | --------------------------------------------------------------------- |
| Despliegue de la web         | PASS          | Vercel `READY`, HTTP 200                                              |
| Despliegue de la API         | PASS          | Render `live`, Nest iniciado                                          |
| Operación integral de la API | PASS          | `/health/ready` 200, `/events?limit=100` 200, login admin 200         |
| Conexión app → PostgreSQL    | PASS          | Session pooler IPv4 verificado                                        |
| Proyecto Supabase            | PASS          | Activo, consultable por MCP y desde la app                            |
| Migraciones                  | PASS          | 2 aplicadas, 0 pendientes, 0 revertidas                               |
| CORS / CSRF                  | PASS          | Origen hostil 403, cookie presente                                    |
| SMTP (autenticación)         | PASS          | Brevo verificado por IPv4                                             |
| Correo real                  | NOT TESTED    | Sin envío                                                             |
| Storage (existencia)         | PASS          | Buckets privados creados                                              |
| Storage (subida real)        | NOT TESTED    | Sin comprobante real                                                  |
| Compra real                  | BLOCKED       | DB de aplicación caída; sin QR                                        |
| Aprobación de pagos          | BLOCKED       | Sin comprobante real                                                  |
| Emisión de tickets           | BLOCKED       | Sin orden confirmada real                                             |
| Check-in real                | BLOCKED       | Sin ticket real                                                       |
| Evento NEXT LEVEL            | PASS          | Creado como DRAFT con entrada General; sin publicar ni vender         |
| QR bancario                  | BLOCKED       | Archivo no entregado                                                  |
| Railway                      | NOT TESTED    | No utilizado                                                          |
| **Dictamen global**          | **READY**     | Administración operativa; publicación y ventas requieren autorización |

---

## 15. Respuestas directas

1. **¿El sistema está desplegado?** Sí. Web `READY` en Vercel y API `live` en Render, ambas en `4fb84b6`. El panel administrativo es utilizable.
2. **¿Cuál es la URL pública?** https://gestion-eventos-pi.vercel.app
3. **¿El frontend se comunica correctamente con el backend?** Sí. `/health` 200, `/health/ready` 200 y `/events?limit=100` 200; el error 400 por `limit` quedó corregido.
4. **¿La base de datos funciona?** Sí. La API usa el session pooler IPv4; `DIRECT_URL` queda reservado para migraciones desde hosts con IPv6.
5. **¿Los correos funcionan?** Autenticación SMTP verificada; envío real **no probado**.
6. **¿El almacenamiento funciona?** Buckets privados creados; subida real **no probada**.
7. **¿Se puede realizar una compra?** No en producción actual: DB de aplicación caída y QR pendiente. La E2E local en schema `test` sí pasó históricamente.
8. **¿Se pueden aprobar pagos?** No con evidencia real; sin comprobantes en producción. La lógica está implementada y probada localmente.
9. **¿Se generan tickets?** No en producción (0 filas). Localmente se generaron en E2E.
10. **¿Se pueden validar los QR?** No con tickets reales de producción; localmente el doble scan fue rechazado con `409`.
11. **¿El evento NEXT LEVEL está creado?** **Sí**, como `DRAFT`, con `location`/`address` vacíos y una entrada `General` de 50 BOB / cupo 120. No está publicado y `isActive = false`.
12. **¿Qué falta para publicarlo y abrir ventas?** Autorizar la publicación, activar la entrada, completar lugar/dirección cuando se confirmen, entregar el QR real y publicarlo en `NEXT_PUBLIC_PAYMENT_QR_URL`; después verificar compra, comprobante, aprobación, tickets, correo y check-in sin pagos reales. No se agregaron campos nuevos para eslogan, categoría, organizador, contacto, programa ni logo; esa información quedó en `description`.
