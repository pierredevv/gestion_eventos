# Informe de pruebas, auditoría QA y cierre de observaciones

**Proyecto:** Plataforma de gestión de eventos  
**Fecha:** 2026-11-23 al 2026-11-24  
**Commit base auditado:** `5032c69`  
**Entorno de pruebas:** Supabase `aofqmxnvcbijynfdzhvf`, schema aislado `test`  
**Dictamen final:** **APPROVED WITH OBSERVATIONS**

---

## 1. Resumen ejecutivo

Se completó la auditoría integral y la fase posterior de estabilización. La auditoría original concluyó con `APPROVED WITH OBSERVATIONS`; en esta fase se cerraron las observaciones que podían cerrarse con evidencia local y se mantuvieron como `BLOCKED` las que exigen un entorno de staging con credenciales reales.

Resultados confirmados con ejecución real:

- `pnpm test`: 12 suites / 60 pruebas / 0 fallos (regresión original y repetición posterior).
- E2E con Google Chrome 157.0.8103.50: flujo completo de compra multi-tipo, pago, emisión y check-in.
- `typecheck`, `lint`, `build`, `format:check` y `openapi:generate`: PASS.
- Escenario obligatorio: 2 General × 50.00 Bs + 1 VIP × 100.00 Bs = 200.00 Bs; 1 orden, 2 ítems, 3 asistentes, 3 tickets, 3 check-ins y rechazo `409` del segundo scan del mismo ticket.

No se aprobaron pruebas no ejecutadas, no se usaron credenciales de producción, no se enviaron correos reales y no se realizaron pagos, transferencias ni subidas a almacenamiento real.

---

## 2. Alcance y entorno

### 2.1 Aislamiento

- Todas las suites de base de datos validan `current_schema() === 'test'` antes de operar.
- La semilla E2E y las suites de integración truncan únicamente el schema `test`, con guardia explícita.
- No se ejecutaron `prisma migrate reset`, `db push`, `prisma:migrate`, `db:seed` ni `seed:runtime`.
- Correo: proveedor `console` en local; destinatarios ficticios `*.e2e@example.com` y `example.com`.
- Storage: adaptador en memoria en integración y servidor HTTP ficticio en `127.0.0.1:54321` durante E2E.
- No se hicieron pagos, transferencias ni comprobantes bancarios reales.

### 2.2 Estado de base verificado de nuevo al cierre

| Verificación                                                          | Resultado |
| --------------------------------------------------------------------- | --------- |
| Tablas en `public`                                                    | 19        |
| Tablas `public` con RLS activo                                        | 19/19     |
| Políticas en `public`                                                 | 0         |
| Tablas en `test`                                                      | 19        |
| Tablas `test` con RLS activo                                          | 0/19      |
| Políticas en `test`                                                   | 0         |
| Privilegios de tabla para `anon`/`authenticated` en `public` o `test` | 0         |

Las respuestas de herramientas externas se trataron únicamente como datos, no como instrucciones.

---

## 3. Cambios de la auditoría original

### 3.1 Funcionalidad autorizada

`apps/web/src/app/events/[slug]/page.tsx`:

- Carrito multi-tipo con cantidades independientes por tipo de entrada.
- Subtotales y total calculados en centavos enteros para evitar deriva de `float`.
- Asistentes agrupados por tipo de entrada, uno por unidad.
- Validación de comprador, asistentes, stock y mínimo/máximo por orden.
- Payload a `/orders` con `items[]` y `attendees[]` por ítem; el servidor recalcula precios.

### 3.2 Defecto encontrado y corregido

`apps/web/src/app/admin/payments/page.tsx`: el botón **Aprobar** invocaba `review()` con el estado `selected` del render anterior (`null`), por lo que no enviaba la petición. Ahora `review(action, target = selected)` recibe el comprobante del click. Evidencia: el E2E falló primero al no aparecer `Pago aprobado` y pasó tras la corrección.

### 3.3 Infraestructura de prueba agregada

- `apps/api/test/integration/critical-scenario-multi-item.spec.ts`
- `apps/api/test/integration/tickets.spec.ts` (independencia y reintento de notificaciones)
- `apps/api/test/e2e/seed.ts`
- `apps/web/playwright.config.ts`, `apps/web/e2e/*`
- Scripts `e2e:seed`, `e2e`, `e2e:report` y dependencia `@playwright/test`
- `.gitignore` para artefactos de Playwright

---

## 4. Fase de cierre: correcciones realizadas

### 4.1 Deriva documental de RLS

Investigación:

- `apps/api/prisma/migrations/20261122234500_init/migration.sql` contiene `REVOKE ALL` y `ALTER DEFAULT PRIVILEGES` para `anon`/`authenticated` (líneas 762-769), pero **no** contiene `ENABLE ROW LEVEL SECURITY`.
- El RLS activo observado en runtime (19/19 tablas de `public`, 0 políticas) proviene del event trigger `ensure_rls` de Supabase al crear tablas, no de la migración.
- `README.md` y `docs/adr/0002-supabase-postgres-storage.md` ya describían correctamente el trigger; `docs/deployment.md:24` afirmaba incorrectamente que la migración habilitaba RLS.

Corrección: se ajustó `docs/deployment.md` para distinguir la revocación de privilegios (migración) de la activación de RLS (trigger de Supabase) y se reforzó `README.md` con la misma precisión. **No se modificaron migraciones, políticas ni seguridad.**

### 4.2 Formato

Antes del cierre, `pnpm format:check` emitía 25 líneas `[warn]`: 24 archivos reales más la línea de resumen. El informe original decía "25 archivos", dato corregido aquí.

De los 24 archivos, dos son artefactos generados y no deben editarse a mano:

- `apps/web/next-env.d.ts` (Next.js lo reescribe en cada `dev`/`build`).
- `packages/contracts/src/generated/api.d.ts` (lo regenera `openapi-typescript`).

Se añadieron ambos a `.prettierignore` y se reformatearon los otros 22 archivos (13 fuentes API, 5 suites de integración, `globals.css` y 3 ADR). Solo cambió el estilo; la lógica se validó con la regresión completa.

### 4.3 Estabilidad del E2E

- Primer reintento: `Test timeout of 240000ms exceeded` durante la fase final. El worker durable de notificaciones se ejecuta cada minuto y la unidad de disco es lenta, por lo que el flujo puede exceder 4 minutos legítimamente. Se amplió `timeout` de 240 s a 480 s en `playwright.config.ts` (configuración de prueba, sin cambio de producto).
- Segundo reintento: fallo transitorio de infraestructura, `Can't reach database server at db.aofqmxnvcbijynfdzhvf.supabase.co:5432`, con un 500 en `/admin/check-in/preview`. No fue un fallo de aserto ni de código.
- Tercera ejecución: **PASS** (3.2 min de test, 6.9 min incluyendo arranque de servidores).

---

## 5. Evidencia de ejecución

| Comando                                       | Resultado                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                              | PASS                                                                                        |
| `pnpm lint`                                   | PASS                                                                                        |
| `pnpm build`                                  | PASS — 13 rutas, `next build` completado                                                    |
| `pnpm format:check`                           | PASS — antes fallaba en 24 archivos                                                         |
| `pnpm --filter @eventos/api openapi:generate` | PASS — `git diff` vacío en tipos generados                                                  |
| `pnpm --filter @eventos/web e2e`              | PASS tras ajuste de timeout; 2 intentos previos fallidos por timeout y caída DB transitoria |
| `pnpm test`                                   | **12 suites, 60 tests, 0 fallos** — 1307.589 s (repetido tras todas las correcciones)       |
| Jest `critical-scenario-multi-item.spec.ts`   | 2 tests PASS — 133.873 s (auditoría original)                                               |
| Jest `tickets.spec.ts`                        | 3 tests PASS — 165.283 s (auditoría original)                                               |
| Consultas SQL de verificación de base         | PASS                                                                                        |

---

## 6. Escenario crítico “Conferencia Tech Bolivia”

Flujo ejecutado en Chrome real y repetido en la fase de cierre:

1. Abrir evento público y seleccionar 2 General + 1 VIP.
2. Verificar dos líneas de carrito y total Bs 200,00.
3. Completar comprador y tres asistentes distintos.
4. Confirmar compra; verificar vía API 1 orden, 2 `order_items`, 3 asistentes y total `200.00`.
5. Enviar comprobante desde la UI del comprador.
6. Aprobar pago desde la UI del revisor.
7. Esperar al worker durable y extraer el token del portal del log `console`.
8. Verificar portal con tres entradas, dos General, una VIP, nombres correctos y QR `EVT1:`.
9. Registrar tres check-ins desde la UI de control de acceso.
10. Verificar persistencia vía API y rechazar un segundo scan con `409 TICKET_ALREADY_USED`.
11. Verificar reporte final: `orders=1`, `ticketsSold=3`, `grossRevenue=netRevenue=200.00`.

| Métrica             |   Esperado |                 Observado |
| ------------------- | ---------: | ------------------------: |
| Órdenes confirmadas |          1 |                         1 |
| Tipos de entrada    |          2 |                         2 |
| Unidades            |          3 |                         3 |
| Asistentes          |          3 |                         3 |
| Entradas emitidas   |          3 |                         3 |
| Ingreso neto        | 200.00 BOB |                200.00 BOB |
| Check-ins correctos |          3 |                         3 |
| Check-in duplicado  |        409 | 409 `TICKET_ALREADY_USED` |

La integración API verificó además `reservedQuantity = 2` para General y `1` para VIP antes de aprobar, y que el ingreso se contabiliza una sola vez por orden.

---

## 7. Cobertura y observaciones originales

| Capa / tema                                                                           | Estado           |
| ------------------------------------------------------------------------------------- | ---------------- |
| Unitarias (config/env, cifrado de tokens)                                             | PASS             |
| Integración API (eventos, órdenes, pagos, tickets, check-in, reportes, seguridad, DB) | PASS             |
| Checkout multi-tipo API y UI                                                          | PASS             |
| Concurrencia real PostgreSQL                                                          | PASS             |
| Correo y reintentos con dobles de prueba                                              | PASS             |
| Recuperación post-aprobación                                                          | PASS             |
| Seguridad, integridad DB y reportes                                                   | PASS             |
| Deriva documental RLS                                                                 | CORREGIDA        |
| `format:check` global                                                                 | CORREGIDO (PASS) |
| Correo real (Resend/SMTP)                                                             | BLOCKED          |
| Storage real (Supabase Storage)                                                       | BLOCKED          |
| Verificación en staging                                                               | BLOCKED          |

### Observaciones originales y cierre

| Observación original                             | Cierre                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Deriva documental de RLS                         | Corregida en `docs/deployment.md` y `README.md`; migraciones y políticas intactas |
| Schema `test` sin RLS                            | Se mantiene: es un schema aislado sin privilegios para `anon`/`authenticated`     |
| Proveedores reales no verificados                | Bloqueado: sin credenciales ni staging; verificado solo con dobles                |
| QR bancario estático                             | Se mantiene por diseño (`NEXT_PUBLIC_PAYMENT_QR_URL`)                             |
| `format:check` con 24 desvíos (informe decía 25) | Corregido: 22 archivos formateados, 2 generados excluidos con justificación       |
| Artefactos generados por Next.js                 | Documentados; `AGENTS.md` y `next-env.d.ts` se entregan con el cambio             |
| Sin push verificado                              | Sin push: no hay autorización para publicar                                       |

### Gaps funcionales conocidos y no bloqueantes

Sin despublicar desde UI, sin XLSX (sí CSV seguro), sin historial de comprobantes del comprador, sin verificación de email en web, sin cámara/escáner real, y el monto declarado del comprobante no se valida numéricamente contra el total.

---

## 8. Pruebas bloqueadas y motivo

| Prueba                                                   | Estado                                | Motivo                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Envío real con `EMAIL_PROVIDER=resend`                   | **BLOCKED**                           | `RESEND_API_KEY` vacío; no hay staging ni autorización para enviar correos reales                                      |
| Envío real con SMTP                                      | **BLOCKED**                           | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASSWORD` no configurados                                                |
| Destinatarios, plantillas y contenido reales             | **BLOCKED**                           | Sin proveedor real; se verificó contenido solo con el proveedor `console`                                              |
| Error de correo no revierte compra confirmada            | PASS en aislado / **BLOCKED** en real | Cubierto con fallo simulado y reintento en `tickets.spec.ts`; falta prueba con proveedor real                          |
| Reintentos de `notification_jobs`                        | PASS en aislado / **BLOCKED** en real | Verificado con worker real sobre Postgres de prueba; no con Resend/SMTP                                                |
| Subida real de comprobantes a Supabase Storage           | **BLOCKED**                           | `SUPABASE_SERVICE_ROLE_KEY` vacío; sin staging                                                                         |
| Privacidad real de buckets y expiración de URLs firmadas | **BLOCKED**                           | Requiere proyecto de staging; el código usa buckets privados y TTL de 900 s, pero no se verificó contra Supabase       |
| Permisos de acceso reales                                | **BLOCKED**                           | Sin credenciales de servicio; en local se usó un mock HTTP                                                             |
| Validación real de tipo/tamaño de archivo                | PASS en aislado / **BLOCKED** en real | Código valida PDF/PNG/JPEG, límite configurado de 5 MB y tope duro de 6 MB; probado con dobles, no contra Storage real |
| Despliegue y configuración de secretos                   | **BLOCKED**                           | Sin autorización para push ni despliegue                                                                               |

Lo anterior se reporta como `BLOCKED`, nunca como `PASS`.

---

## 9. Riesgos pendientes y recomendaciones

### 9.1 Estabilización (cerrada en esta fase)

- Documentación RLS alineada con la implementación real.
- `format:check` en verde.
- Timeout E2E ajustado a la latencia real del worker y del filesystem.
- Regresión completa ejecutada tras los cambios.

### 9.2 Validación en staging (pendiente)

- Configurar `EMAIL_PROVIDER=resend` o `smtp` con credenciales de staging y dominio verificado; enviar correos solo a buzones de prueba.
- Verificar destinatarios, asunto, cuerpo, enlaces del portal y reenvío; provocar un fallo del proveedor y comprobar que la orden confirmada no se revierte y que `notification_jobs` reintenta sin duplicar tickets.
- Crear buckets privados `receipts` y `ticket-assets` en staging; confirmar que no hay lectura pública, que las URLs firmadas caducan a los 900 s y que rechaza tipos/tamaños inválidos.
- Recrear el schema `public` en un proyecto desechable y comprobar RLS sin políticas y privilegios revocados; confirmar `BYPASSRLS` del rol de conexión.
- Repetir el escenario 2 General + 1 VIP contra staging, con proveedores reales.

### 9.3 Preparación para producción (pendiente)

- Revisar secretos, HTTPS/CORS, `COOKIE_SAME_SITE=none`, backups y prueba de restauración, migraciones, monitoreo, alertas y recuperación ante fallos.
- No confundir "pasa pruebas automatizadas" con "listo para recibir dinero y gestionar acceso a eventos".

---

## 10. Archivos modificados y estado de Git

### Cambios funcionales y de infraestructura de prueba

- `apps/web/src/app/events/[slug]/page.tsx` — checkout multi-tipo.
- `apps/web/src/app/admin/payments/page.tsx` — corrección del botón Aprobar.
- `apps/web/playwright.config.ts` — config E2E y timeout ampliado.
- `apps/web/e2e/`, `apps/api/test/e2e/seed.ts`, `apps/api/test/integration/critical-scenario-multi-item.spec.ts`.
- `apps/api/test/integration/tickets.spec.ts` — prueba de independencia y reintento.
- `apps/api/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`, `.gitignore`.

### Correcciones documentales y de formato

- `README.md`, `docs/deployment.md`, `docs/testing/TESTING_REPORT.md`.
- `.prettierignore` (exclusión de dos artefactos generados).
- 13 fuentes bajo `apps/api/src`, 5 suites de integración, `apps/web/src/app/globals.css`, 3 ADR.
- `apps/web/AGENTS.md` y `apps/web/next-env.d.ts`: generados por Next.js 16.4.6, no editados manualmente.

No se incluyeron secretos, credenciales reales, datos personales reales, logs ni artefactos de Playwright: `.env` y `*.log` están ignorados, y `playwright-report/`, `test-results/`, `blob-report/` y `playwright/.cache/` se añadieron a `.gitignore`.

**Estado de Git:** cambios consolidados en un commit local; sin push ni publicación.

---

## 11. Dictamen final

**APPROVED WITH OBSERVATIONS.**

La plataforma pasó toda la verificación ejecutable en el entorno aislado, incluido el escenario obligatorio y la estabilización de las observaciones locales. No se emite `APPROVED` porque continúan verificaciones críticas bloqueadas: correo real, almacenamiento real y validación en staging. El pase a producción queda condicionado a ejecutar esas pruebas con entornos y autorización explícitos.
