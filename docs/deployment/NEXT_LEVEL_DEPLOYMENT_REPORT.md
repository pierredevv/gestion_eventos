# Informe de despliegue y configuración — NEXT LEVEL

**Fecha:** 2026-11-24  
**Repositorio:** https://github.com/pierredevv/gestion_eventos  
**Rama:** `master`  
**Commit de código desplegado:** `42bb858`

**Commit de la API desplegada en Render:** `711fd0f` (deploy `dep-dc2volqvcj2c73aj2et0`, estado `live`)

**Commit del frontend desplegado en Vercel:** `42bb858` (deploy `dpl_6fqqvLqKSpPkN9drmQGKwgJFcE6e`, `READY`)

**Dictamen actualizado:** **READY.** Web y API operativas, conexión a PostgreSQL funcionando, catálogo `/events?limit=100` → 200 con NEXT LEVEL visible, panel administrativo accesible, lugar/dirección y QR bancario configurados. El evento **NEXT LEVEL fue publicado** y la entrada `General` está activa y a la venta.

> **Actualización 2026-11-24 19:23 UTC:** el bloqueo de conexión a PostgreSQL quedó resuelto mediante
> el session pooler IPv4 de Supabase. Ver
> [`DB_CONNECTION_INCIDENT_RESOLUTION_REPORT.md`](DB_CONNECTION_INCIDENT_RESOLUTION_REPORT.md).
>
> **Actualización 2026-11-24 20:07 UTC:** se corrigió el `import type` de `ListEventsDto` que causaba el
> 400 del catálogo, se publicaron los cambios para `location`/`address` opcionales y se creó NEXT LEVEL
> desde la API administrativa con sesión real.
>
> **Actualización 2026-11-24 20:17 UTC:** se cargaron el lugar y la dirección confirmados mediante la
> API administrativa, se publicó el QR real en `apps/web/public/payment-qr.jpeg`, se configuró
> `NEXT_PUBLIC_PAYMENT_QR_URL` en Vercel y se redesplegó la web.
>
> **Actualización 2026-11-24 20:43 UTC:** con autorización explícita del usuario se activó la entrada
> `General` (`isActive = true`, `onSale = true`) y se publicó el evento (`status = PUBLISHED`,
> `publishedAt = 2026-11-24T20:43:13.537Z`). Las secciones técnicas posteriores conservan el estado
> original de la investigación; esta nota y las secciones 11, 13, 14 y 15 reflejan el estado final
> verificado.
>
> **Actualización 2026-11-24 21:08 UTC:** se corrigió el bloqueo del botón “Continuar al pago”. La
> creación de orden esperaba al envío de correo, que se colgaba por el proveedor SMTP; ahora la
> respuesta se envía antes de esa operación best-effort y el correo tiene tiempos de espera acotados.
> Ver la sección 16.

> Clasificación usada: **PASS** = verificado con evidencia; **FAIL** = verificado y negativo; **BLOCKED** = impedimento real que requiere acción/autorización; **NOT TESTED** = no ejecutado.

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

**Clasificación final: PUBLICADO. El evento está activo y a la venta.**

Registro creado y verificado:

| Campo                  | Valor persistido                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                     | `ee88d1db-8d78-44dc-bae0-dda9456362d6`                                                                                                                        |
| Slug                   | `next-level`                                                                                                                                                  |
| Título                 | `NEXT LEVEL`                                                                                                                                                  |
| Estado                 | `PUBLISHED` (`publishedAt = 2026-11-24T20:43:13.537Z`)                                                                                                        |
| `location` / `address` | `Auditorio del Instituto para la Excelencia en Negocios del Gas - INEGAS` / `Inegas, Av. Busch, Santa Cruz de la Sierra, Bolivia, Departamento de Santa Cruz` |
| Evento                 | `2026-11-27T10:00:00-04:00` → `2026-11-27T12:30:00-04:00`                                                                                                     |
| Inscripción            | `2026-11-24T16:30:00-04:00` → `2026-11-27T10:00:00-04:00`                                                                                                     |
| Entrada `General`      | 50.00 BOB, cupo 120, ventas `2026-11-24T16:30:00-04:00` → `2026-11-27T10:00:00-04:00`, `isActive = true`, `onSale = true`                                     |

El eslogan, la categoría, el organizador, el contacto y el programa se conservaron dentro de
`description`, usando solo campos existentes. El lugar y la dirección confirmados se cargaron después
mediante `PATCH /api/v1/admin/events/{id}`. La entrada se activó mediante
`PATCH /api/v1/admin/events/{id}/ticket-types/{ticketTypeId}` y el evento se publicó mediante
`POST /api/v1/admin/events/{id}/publish`, siempre con sesión administrativa real. No se crearon campos
nuevos y no se cargó ningún logo porque no se entregó el archivo.

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

Estado actual: **CONFIGURADO**. No se usó ningún QR ficticio.

El sistema trata el QR como **configuración global**, no por evento:

1. El usuario entregó el archivo real: `/home/pierre/Descargas/WhatsApp Image 2026-11-24 at 4.33.37 PM.jpeg` (JPEG, 824x773, 155 KB).
2. Se publicó en `apps/web/public/payment-qr.jpeg` (commit `42bb858`) y quedó accesible en `https://gestion-eventos-pi.vercel.app/payment-qr.jpeg` → `200`, `image/jpeg`, `158711` bytes. No se creó un bucket público porque `SUPABASE_SERVICE_ROLE_KEY` está vacía en el entorno local y los buckets existentes son privados.
3. Se configuró en Vercel, proyecto `gestion-eventos`, variable `NEXT_PUBLIC_PAYMENT_QR_URL` con ese valor, en `production` y `preview`.
4. Se redesplegó la web: deploy `dpl_6fqqvLqKSpPkN9drmQGKwgJFcE6e`, `READY`, commit `42bb858`, alias `gestion-eventos-pi.vercel.app`. `NEXT_PUBLIC_*` se sustituye en tiempo de build.
5. Las ventas ya están habilitadas (`isActive = true`, `onSale = true`), así que ahora sí se puede verificar en una orden con estado `PENDING_PAYMENT` que aparece la imagen con alt “QR bancario estático proporcionado por la organización”.
6. El evento ya fue publicado; sigue pendiente comprobar el flujo de pago con el QR real sin ejecutar pagos reales.

Observación: no se habilitaron ventas pagadas y no se ejecutaron pagos reales.

---

## 14. Estado final del despliegue

| Ítem                         | Clasificación | Resumen                                                              |
| ---------------------------- | ------------- | -------------------------------------------------------------------- |
| Despliegue de la web         | PASS          | Vercel `READY`, HTTP 200                                             |
| Despliegue de la API         | PASS          | Render `live`, Nest iniciado                                         |
| Operación integral de la API | PASS          | `/health/ready` 200, `/events?limit=100` 200, login admin 200        |
| Conexión app → PostgreSQL    | PASS          | Session pooler IPv4 verificado                                       |
| Proyecto Supabase            | PASS          | Activo, consultable por MCP y desde la app                           |
| Migraciones                  | PASS          | 2 aplicadas, 0 pendientes, 0 revertidas                              |
| CORS / CSRF                  | PASS          | Origen hostil 403, cookie presente                                   |
| SMTP / HTTPS (email)         | PASS          | Brevo HTTPS activo; correo de rechazo entregado al comprador         |
| Correo real                  | PASS          | Rechazo con motivo entregado y confirmado en eventos de Brevo        |
| Storage (existencia)         | PASS          | Buckets privados creados                                             |
| Storage (subida real)        | PASS          | Comprobante PNG subido: `201`, URL firmada `200 image/png`           |
| Compra real                  | PASS          | Orden creada en navegador (`201`), QR visible y cupo liberado        |
| Aprobación de pagos          | NOT TESTED    | Sin aprobaciones; 1 comprobante real queda pendiente de revisión     |
| Emisión de tickets           | BLOCKED       | Sin orden confirmada real                                            |
| Check-in real                | BLOCKED       | Sin ticket real                                                      |
| Evento NEXT LEVEL            | PASS          | PUBLICADO, visible en `/events`, entrada General activa y a la venta |
| QR bancario                  | PASS          | Archivo real publicado y variable de entorno configurada             |
| Railway                      | NOT TESTED    | No utilizado                                                         |
| **Dictamen global**          | **READY**     | Compra y comprobante verificados en producción; sin pagos reales     |

---

## 15. Respuestas directas

1. **¿El sistema está desplegado?** Sí. API `live` en Render en `711fd0f`; web `READY` en Vercel en `42bb858` (deploy `dpl_6fqqvLqKSpPkN9drmQGKwgJFcE6e`). El panel administrativo es utilizable.
2. **¿Cuál es la URL pública?** https://gestion-eventos-pi.vercel.app
3. **¿El frontend se comunica correctamente con el backend?** Sí. `/health` 200, `/health/ready` 200 y `/events?limit=100` 200; el error 400 por `limit` quedó corregido.
4. **¿La base de datos funciona?** Sí. La API usa el session pooler IPv4; `DIRECT_URL` queda reservado para migraciones desde hosts con IPv6.
5. **¿Los correos funcionan?** Sí. Con `EMAIL_PROVIDER=brevo` y `BREVO_API_KEY` en Render se
   entregaron los avisos de rechazo con el motivo al comprador; confirmado en los eventos de Brevo.
6. **¿El almacenamiento funciona?** Sí: bucket privado ya existente, subida real de comprobante `201` y URL firmada HTTP `200` con `image/png`.
7. **¿Se puede realizar una compra?** Sí, verificada en navegador: `POST /orders` → `201`, redirección al pedido y QR real cargado (`824x773`). Todas las órdenes de prueba de la verificación se cancelaron por API.
8. **¿Se pueden aprobar pagos?** La lógica está implementada y probada localmente; en producción **no se aprobó ningún pago**. Existe un comprobante real enviado por el propio usuario en `ORD-261124-PHTXZW` que queda `PENDING_REVIEW` a la espera de su decisión.
9. **¿Se generan tickets?** No en producción (0 filas). Localmente se generaron en E2E.
10. **¿Se pueden validar los QR?** No con tickets reales de producción; localmente el doble scan fue rechazado con `409`.
11. **¿El evento NEXT LEVEL está creado?** **Sí**, publicado, con lugar y dirección confirmados persistidos y una entrada `General` de 50 BOB / cupo 120 activa y a la venta.
12. **¿Qué falta para publicarlo y abrir ventas?** Nada: se publicó y activó con autorización explícita. Lo que queda es verificar compra, comprobante, aprobación, tickets, correo y check-in sin pagos reales. No se agregaron campos nuevos para eslogan, categoría, organizador, contacto, programa ni logo; esa información quedó en `description`.

---

## 16. Incidente: botón “Continuar al pago” sin respuesta

**Síntoma:** la orden se creaba en base de datos, pero la web permanecía en “Reservando…” y no
redirigía al pedido.

**Causa raíz:** `OrdersService.create` hacía `await this.email.send(...)` aunque el envío de correo
está diseñado como best-effort. El transporte SMTP de Render registraba `Connection timeout`, por lo
que la respuesta HTTP no se completaba y el navegador seguía esperando. Existía además un
`NotificationJob` duradero que ya cubre la entrega, así que esperar al correo era innecesario.

**Corrección (commit `711fd0f`):**

- `apps/api/src/modules/orders/orders.service.ts`: el correo se dispara sin `await` y con `.catch()`,
  por lo que nunca retrasa la respuesta de la orden.
- `apps/api/src/common/email/email.service.ts`: timeouts acotados para Resend (10 s) y SMTP
  (5 s conexión/saludo, 10 s socket), para que un proveedor lento no retenga procesos.

**Verificación posterior:**

- `pnpm typecheck` y `pnpm build`: PASS.
- `test/integration/orders.spec.ts`: 6/6 PASS.
- Deploy Render `dep-dc2volqvcj2c73aj2et0`: `live`, commit `711fd0f`.
- Compra de prueba real en navegador: `POST /orders` → `201` en ~3,4 s y redirección a
  `/orders/ORD-261124-FA8AYC`.
- Página del pedido: `GET /orders/{code}` → `200`, estado “Esperando pago” y QR bancario cargado
  (`824x773`, `image/jpeg`).
- Las órdenes de prueba creadas durante la diagnosis se cancelaron por API para liberar cupo.

---

## 17. Incidente: `internal server error` al enviar comprobante y latencia restante del checkout

**Síntoma 1:** `POST /orders/{code}/payment-submissions` respondía `500` aunque el bucket `receipts`
ya existía.

**Causa raíz:** `SupabaseStorageService.ensureBucket()` solo aceptaba “ya existe” cuando el estado
HTTP era `409` o `422`. El gateway administrado de Supabase respondió `400` con
`code: "BucketAlreadyExists"` en el cuerpo, por lo que el adaptador lanzaba
`Storage bucket setup failed (400)` antes de subir el archivo. No se creó ningún registro ni objeto:
la base `payment_submissions` y el bucket seguían vacíos.

**Corrección (commit `1778905`):**

- `apps/api/src/common/storage/supabase-storage.service.ts`: se parsea el cuerpo y se acepta
  `BucketAlreadyExists` o un mensaje “already exists” con cualquier estado HTTP; se mantiene el error
  para fallos reales (por ejemplo `500`). Se memoíza el bucket verificado y se acotan los `fetch` de
  subida,URL firmada y borrado con `AbortSignal.timeout`.
- `apps/api/test/unit/supabase-storage.service.spec.ts`: Regression test con `global.fetch` mockeado:
  `400` + `BucketAlreadyExists` continúa hacia el upload; un `500` real sí falla.

**Síntoma 2:** después del fix del correo, el botón “Continuar al pago” tardaba ~3 s en dar feedback.

**Causa:** el `fetch` de CSRF ocurría dentro del clic, se sumaba al preflight CORS y a la navegación RSC
sin prefetch.

**Corrección (commit `1778905`):**

- `apps/web/src/app/events/[slug]/page.tsx`: `ensureCsrf()` se ejecuta al montar la página; el botón
  muestra de inmediato un spinner, texto `Reservando tus entradas… no cierres esta ventana` con
  `aria-live`, y guarda la orden devuelta en `sessionStorage` (`order:view:{code}`).
- `apps/web/src/app/orders/[code]/page.tsx`: si hay esa entrada, pinta el pedido al instante y
  muestra `Confirmando tu reserva…` mientras llega la API; el caché corrupto se ignora sin bloquear.
- `apps/api/src/app-config.ts`: `maxAge: 600` en CORS para reutilizar el preflight.

**Despliegue:** tras el primer deploy (`dep-dc304jl9fdbs73fgmo70`, `live`) la API seguía sirviendo
código anterior —se confirmó porque `Access-Control-Max-Age` no aparecía y el stack apuntaba a la
línea anterior de `ensureBucket`—. Se hizo un redeploy con caché limpia,
`dep-dc3073rl550s73cdqr50` `live`, commit `1778905`; después `OPTIONS /orders` devolvió
`Access-Control-Max-Age: 600`. Web: Vercel `dpl_FMKSxMRdBkShGrUrPrH7N38wUNAN`, `READY`, mismo
commit, alias `gestion-eventos-pi.vercel.app`.

**Verificación real en producción (sin pagos reales):**

- Compra en navegador: feedback en **135 ms**, `POST /orders` → `201` en **1,98 s**, página del pedido
  lista en **2,61 s**, sin errores de página; QR bancario real cargado (`824x773`).
- Envío de comprobante PNG de prueba: `201` en **3,35 s**, estado `PENDING_REVIEW`, `receiptUrl`
  firmada descargable (`200`, `image/png`, 68 bytes).
- La orden de prueba de la verificación se canceló por API (`201`, `CANCELLED`) para liberar el cupo;
  quedan `119` entradas disponibles de `120`.
- `pnpm typecheck`, `pnpm build` y 13/13 pruebas focalizadas (storage, payments, orders): PASS.
- El propio usuario envió además un comprobante real desde su navegador en `ORD-261124-PHTXZW`;
  esa orden quedó en `PENDING_REVIEW` y **no fue aprobada ni cancelada** por esta verificación.

---

## 18. Verificación de correos de rechazo

**Resultado final:** el flujo de negocio y la entrega son correctos. El destinatario y el motivo son
los del comprador; el bloqueo de red SMTP se resolvió con el adaptador HTTPS de Brevo.

- `PaymentsService.reject()` crea el job `PAYMENT_REJECTED` con
  `recipient = order.buyerEmail` y `reason = notes` (commit `b17552e`, sin cambios de negocio).
- `NotificationWorkerService.deliver()` compone el texto
  `Tu comprobante fue rechazado. Motivo: <reason>. ...` y usa `job.recipient`.
- En el rechazo real del usuario (`ORD-261124-PHTXZW`, motivo “Chupapichi, no es un comprobante”),
  el job `d0f1bc7a…` tiene `recipient = pierreelpro19@gmail.com` y ese motivo en el payload.
- En dos rechazos controlados creados por API (`ORD-261124-DARIC3` y `ORD-261124-CXIZRE`) se
  confirmó el mismo destino y el motivo enviado; ambas órdenes se cancelaron después para liberar cupo.

**Causa del fallo inicial:** los jobs quedaron en `PENDING`/`DEAD` con
`last_error = "Connection timeout"` del transporte SMTP (Brevo `587`, y también `465`). El envío
desde el entorno local sí conecta, pero Render no mantiene conexiones SMTP salientes estables.

**Intentos previos:**

- `24da4a9`: timeouts SMTP ampliados y logging de entrega; no resolvió el bloqueo de red.
- `b17552e` / `a47a80d`: se agregó el adaptador HTTPS `EMAIL_PROVIDER=brevo` con
  `BREVO_API_KEY` dedicada. La clave SMTP (`xsmtpsib-…`) **no** es API key: Brevo respondió
  `401 {"message":"Key not found","code":"unauthorized"}`.

**Resolución final:**

- El usuario entregó una API key válida de Brevo. Se cargó en Render como `BREVO_API_KEY` (sin
  mostrar su valor ni guardarlo en el repositorio) y se fijó `EMAIL_PROVIDER=brevo`; deploy
  `dep-dc30sap5efls7393qat0` `live`, `/health` 200.
- Se reprogramaron los tres jobs `PAYMENT_REJECTED` afectados (`ORD-261124-PHTXZW`,
  `ORD-261124-DARIC3`, `ORD-261124-CXIZRE`): los tres pasaron a `SENT` y los logs muestran
  `Brevo accepted message in 270–733ms`.
- Verificación de extremo a extremo ya con HTTPS: orden controlada `ORD-261124-MQ0TJO`,
  comprobante subido (`201`), rechazo con motivo (`200`) y orden cancelada por API
  (`201`, `CANCELLED`). El job `PAYMENT_REJECTED` quedó `SENT` con
  `recipient = pierreelpro19@gmail.com` y el motivo en el payload.
- La API de estadísticas de Brevo confirma `delivered` para
  `Comprobante rechazado para ORD-261124-MQ0TJO` a las `22:28:02Z` y para
  `Comprobante rechazado para ORD-261124-PHTXZW` a las `22:25:03Z`, ambas a
  `pierreelpro19@gmail.com`.
- Los jobs obsoletos `ORDER_CREATED`/`RECEIPT_RECEIVED` de las órdenes de prueba canceladas se
  cerraron para evitar reenvíos duplicados. **No se aprobó ningún pago real.**

---

## 19. Cronograma NEXT LEVEL, asistentes opcionales y referencia en el QR

**Solicitud atendida:**

- Reemplazar los nombres abreviados por `Lic. David Aróstegui Enríquez` y
  `MSc. Ing. Roque Bueno Gallardo`.
- Cambiar `Programa:` por `CRONOGRAMA`, con el orden indicado: `CONFERENCIAS`, charla de David,
  `BREAK` y charla de Roque.
- Dejar como único contacto `+591 62220214`, sin `plantarrosap@gmail.com` ni el teléfono anterior.
- Permitir que cada evento decida si nombre y correo del asistente son obligatorios; ambos campos
  permanecen visibles en el checkout.
- Mostrar `+591 62220214` como referencia junto al QR de pago.

**Implementación:**

- Migración aditiva `20261124224500_event_optional_attendee_details`: agrega
  `events.require_attendee_details` con default `true` y hace nullable `attendees.full_name` y
  `attendees.email`. No se ejecutó ninguna migración destructiva.
- DTOs `CreateEventDto` / `UpdateEventDto` y `EventView` aceptan y devuelven el flag; el contrato
  OpenAPI se regeneró.
- `AttendeeDto` acepta campos vacíos como omitidos, pero sigue validando nombre y correo cuando se
  proporcionan. `OrdersService` aplica la obligatoriedad según el flag del evento y conserva la regla
  de un asistente por entrada.
- Orders, tickets y check-in muestran fallback al comprador cuando el asistente no tiene datos, para
  no romper el portal ni el control de acceso.
- El panel admin permite editar la descripción completa y el flag desde la tarjeta de cada evento.
- El checkout marca los campos como `(opcional)` cuando el evento lo permite, sin ocultarlos.
- El número de referencia del QR usa `NEXT_PUBLIC_PAYMENT_SUPPORT_PHONE`, con valor por defecto
  `+591 62220214`. La variable ya quedó configurada en Vercel para `production` y `preview`.

**Texto publicado para NEXT LEVEL:**

```text
NEXT LEVEL — Más allá del conocimiento

Ciclo de conferencias. Desarrollo de habilidades para destacar en el mundo profesional.

Organiza: Mozilla Bolivia.
Contacto: +591 62220214

CRONOGRAMA

CONFERENCIAS

10:00 am: Lic. David Aróstegui Enríquez
Emprender, Innovar y Liderar

BREAK

11:00 am: MSc. Ing. Roque Bueno Gallardo
Liderazgo y Estrategia en Ciberseguridad

Fecha: viernes 27 de noviembre de 2026, 10:00–12:30 (America/La_Paz).
```

**Verificación local:** `prisma validate/generate`, `pnpm typecheck`, `pnpm build`, `pnpm lint`,
`pnpm format:check`, DTO 3/3 y orders 8/8 PASS, incluidos los casos de flag obligatorio y opcional.
