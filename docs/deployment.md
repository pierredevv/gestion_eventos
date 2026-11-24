# Despliegue (Vercel + Render)

La web se despliega en **Vercel** y la API en **Render**. No se comparte dominio, por lo que las
cookies de sesión usan `SameSite=None; Secure` y la API valida `Origin` contra una lista explícita.
Ver `docs/adr/0013-despliegue-y-cookies-cross-site.md`.

Servicios actuales:

- Web: `https://gestion-eventos-pi.vercel.app` (proyecto Vercel `gestion-eventos`).
- API: `https://gestion-eventos-api-km0n.onrender.com` (servicio Render `gestion-eventos-api`).

## 1. Supabase (una vez)

Proyecto usado en este despliegue: `aofqmxnvcbijynfdzhvf`. Para un entorno de producción nuevo, crea
un proyecto nuevo; **nunca reutilices la base de desarrollo**.

1. Crea los buckets privados `receipts` y `ticket-assets` en Storage. No actives acceso público.
2. Obtén las cadenas de conexión en _Project Settings → Database → Connect_:
   - **Session pooler** (puerto 5432, IPv4) → `DATABASE_URL` en el runtime de Render, con
     `?sslmode=require`. Es la opción usada actualmente porque Render sale por IPv4.
   - **Transaction pooler** (puerto 6543) también sirve para `DATABASE_URL`, pero exige
     `?pgbouncer=true&connection_limit=1&sslmode=require`.
   - **Direct connection** (puerto 5432, IPv6) → `DIRECT_URL`, con `?sslmode=require`. Prisma la
     usa solo para migraciones y debe ejecutarse desde una máquina con IPv6. El host directo
     `db.<REF>.supabase.co` no publica registro A; usarlo como `DATABASE_URL` en Render produce
     `P1001: Can't reach database server`.
3. Obtén `SUPABASE_SERVICE_ROLE_KEY` (solo servidor) y la clave publishable (solo si se usa Data API;
   la app no la necesita).
4. Genera la clave de cifrado de tokens:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

5. Verifica la base con `pnpm --filter @eventos/api db:check` apuntando `.env` a producción antes de
   desplegar. La migración inicial revoca permisos a `anon`/`authenticated`, pero no ejecuta
   `ENABLE ROW LEVEL SECURITY`. En Supabase, el event trigger `ensure_rls` habilita RLS sin políticas
   en cada tabla nueva de `public`. Si el esquema se recrea fuera de Supabase, hay que habilitar RLS
   explícitamente.

## 2. Correo

`EMAIL_PROVIDER=console` está prohibido en producción (la validación de entorno lo rechaza).
Configura Resend:

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_FROM=Eventos <no-reply@tu-dominio.verificado>
```

Verifica el dominio de envío en Resend. Alternativamente usa `EMAIL_PROVIDER=smtp` con los cuatro
valores `SMTP_*`.

## 3. API en Render

1. _New Web Service → Build from GitHub repo_ seleccionando este repositorio. Render detecta
   `Dockerfile.api` desde la raíz y construye la imagen con contexto `.`.
2. En la pestaña **Environment** del servicio carga:

   | Variable                    | Valor                                                                   |
   | --------------------------- | ----------------------------------------------------------------------- |
   | `NODE_ENV`                  | `production`                                                            |
   | `PORT`                      | `4000`                                                                  |
   | `WEB_ORIGIN`                | URL exacta de Vercel (sin `/` final)                                    |
   | `ADDITIONAL_WEB_ORIGINS`    | Opcional: previews de Vercel separadas por comas                        |
   | `COOKIE_SAME_SITE`          | `none`                                                                  |
   | `DATABASE_URL`              | Session pooler IPv4 con `sslmode=require`                               |
   | `DIRECT_URL`                | Conexión directa IPv6 con `sslmode=require` (solo referencia/migración) |
   | `SUPABASE_URL`              | `https://<REF>.supabase.co`                                             |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secreto de servicio                                                     |
   | `TOKEN_ENCRYPTION_KEY`      | Base64 de 32 bytes generado arriba                                      |
   | `EMAIL_PROVIDER`            | `resend` (o `smtp`)                                                     |
   | `RESEND_API_KEY`            | Secreto de Resend                                                       |
   | `EMAIL_FROM`                | Remitente verificado                                                    |
   | `SEED_ADMIN_EMAIL`          | Correo del SUPER_ADMIN (solo para el seed)                              |
   | `SEED_ADMIN_PASSWORD`       | Contraseña temporal de al menos 16 caracteres                           |

   El resto de variables de negocio tienen valores por defecto seguros; `.env.example` las documenta.

3. El health check recomendado es `/api/v1/health/ready`. El entrypoint **no** ejecuta migraciones:
   solo `node dist/main.js`. No escales a más de una réplica: el worker de notificaciones y el
   scheduler están pensados para una única instancia.
4. Tras el primer despliegue crea el SUPER_ADMIN desde una máquina con `.env` de producción:

   ```bash
   pnpm --filter @eventos/api seed:runtime
   ```

   El usuario debe cambiar la contraseña temporal en el primer ingreso.

5. Si cambias variables de entorno, Render dispara un deploy automáticamente para que el contenedor
   las lea. Con `autoDeploy=no`, los cambios de código requieren _Manual Deploy_.

## 4. Web en Vercel

1. _Add New → Project_ seleccionando el mismo repositorio. No cambies el **Root Directory** (debe ser
   la raíz): `vercel.json` ya define instalación, build y salida para el monorepo.
2. Environment variables (marca también _Preview_ si quieres probar previews):

   | Variable                     | Valor                                                                |
   | ---------------------------- | -------------------------------------------------------------------- |
   | `NEXT_PUBLIC_API_BASE_URL`   | `https://gestion-eventos-api-km0n.onrender.com/api/v1`               |
   | `NEXT_PUBLIC_API_DOCS_URL`   | `https://gestion-eventos-api-km0n.onrender.com/api/docs`             |
   | `NEXT_PUBLIC_API_HEALTH_URL` | `https://gestion-eventos-api-km0n.onrender.com/api/v1/health/ready`  |
   | `NEXT_PUBLIC_PAYMENT_QR_URL` | URL pública de la imagen del QR bancario estático de la organización |

   `NEXT_PUBLIC_*` se inyecta en el bundle: un cambio requiere **rebuild**. La imagen del QR de pago
   es pública por diseño y no contiene secretos; la plataforma nunca la genera.

3. Despliega. Vercel añade cabeceras de seguridad definidas en `vercel.json`.

## 5. Verificación posterior

```bash
curl https://gestion-eventos-api-km0n.onrender.com/api/v1/health          # liveness
curl https://gestion-eventos-api-km0n.onrender.com/api/v1/health/ready    # "status":"ok"
```

En el navegador:

1. Ingresa con el SUPER_ADMIN y cambia la contraseña temporal.
2. Crea un evento con un tipo de entrada y publícalo.
3. Compra como invitado, sube un comprobante y apruébalo desde _Administración → Pagos_.
4. Abre _Mis tickets_ desde el correo y comprueba que el QR se dibuja localmente.
5. Registra un ingreso desde _Administración → Check-in_ y verifica que un segundo escaneo devuelve
   `TICKET_ALREADY_USED`.
6. Genera un reporte y exporta el CSV.

## 6. Operación y recuperación

- **Backup:** usa el punto de restauración de Supabase o `pg_dump` sobre `DIRECT_URL`. Prueba el
  restore en un proyecto nuevo antes de necesitarlo.
- **Rotación de secretos:** cambia `TOKEN_ENCRYPTION_KEY` solo en una ventana de mantenimiento;
  invalida las sesiones y vuelve a emitir los tickets para que los tokens se cifren con la nueva clave.
- **Correo fallido:** no revierte una compra. Los trabajos quedan en `notification_jobs` y se
  reintentan con backoff; inspecciona `lastError` antes de reprocesar.
- **Rollback:** en Render selecciona un despliegue anterior en _Deploys → Redeploy_; en Vercel usa
  _Promote to Production_ sobre un deployment anterior. Nunca reviertas una migración aplicada sin
  una migración correctiva nueva.

## 7. Checklist de seguridad

- [ ] `WEB_ORIGIN` y `ADDITIONAL_WEB_ORIGINS` contienen solo orígenes propios y usan HTTPS.
- [ ] `COOKIE_SAME_SITE=none` y `NODE_ENV=production` (implica cookies `Secure`).
- [ ] CORS expone `X-CSRF-Token`: sin esa cabecera el panel en otro dominio no puede enviar el token.
- [ ] Roles `anon`/`authenticated` sin privilegios en `public`; RLS sin políticas en todas las tablas.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY` y credenciales de correo solo en Render.
- [ ] Buckets `receipts` y `ticket-assets` privados; URLs de acceso son firmadas y caducan.
- [ ] QR de pago alojado como imagen estática pública; QR de ticket renderizado en el navegador.
- [ ] Contraseña temporal del SUPER_ADMIN cambiada y secretos de seed retirados del entorno.
