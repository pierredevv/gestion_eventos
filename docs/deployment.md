# Despliegue (Vercel + Railway)

La web se despliega en **Vercel** y la API en **Railway**. No se comparte dominio, por lo que las
cookies de sesión usan `SameSite=None; Secure` y la API valida `Origin` contra una lista explícita.
Ver `docs/adr/0013-despliegue-y-cookies-cross-site.md`.

## 1. Supabase (una vez)

Proyecto de desarrollo/pruebas usado hasta ahora: `aofqmxnvcbijynfdzhvf`. Para producción crea un
proyecto nuevo; **nunca reutilices la base de desarrollo**.

1. Crea los buckets privados `receipts` y `ticket-assets` en Storage. No actives acceso público.
2. Obtén las cadenas de conexión en _Project Settings → Database_:
   - **Transaction pooler** (puerto 6543) → `DATABASE_URL`, con `?pgbouncer=true&connection_limit=1&sslmode=require`.
   - **Direct connection** (puerto 5432) → `DIRECT_URL`, con `?sslmode=require`. Prisma usa esta para migraciones.
3. Obtén `SUPABASE_SERVICE_ROLE_KEY` (solo servidor) y la clave publishable (solo si se usa Data API; la app no la necesita).
4. Genera la clave de cifrado de tokens:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

5. Verifica la base con `pnpm --filter @eventos/api db:check` apuntando `.env` a producción antes de desplegar.
   La migración inicial ya revoca permisos a `anon`/`authenticated` y habilita RLS sin políticas.

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

## 3. API en Railway

1. _New Project → Deploy from GitHub repo_ seleccionando este repositorio.
2. Railway detecta `railway.json` y construye `Dockerfile.api` desde la raíz del repositorio.
3. En la pestaña **Variables** del servicio carga:

   | Variable                    | Valor                                                               |
   | --------------------------- | ------------------------------------------------------------------- |
   | `NODE_ENV`                  | `production`                                                        |
   | `PORT`                      | `4000`                                                              |
   | `WEB_ORIGIN`                | URL exacta de Vercel (sin `/` final)                                |
   | `ADDITIONAL_WEB_ORIGINS`    | Opcional: previews de Vercel separadas por comas                    |
   | `COOKIE_SAME_SITE`          | `none`                                                              |
   | `DATABASE_URL`              | Pooler 6543 con `pgbouncer=true&connection_limit=1&sslmode=require` |
   | `DIRECT_URL`                | Conexión directa 5432 con `sslmode=require`                         |
   | `SUPABASE_URL`              | `https://<REF>.supabase.co`                                         |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secreto de servicio                                                 |
   | `TOKEN_ENCRYPTION_KEY`      | Base64 de 32 bytes generado arriba                                  |
   | `EMAIL_PROVIDER`            | `resend` (o `smtp`)                                                 |
   | `RESEND_API_KEY`            | Secreto de Resend                                                   |
   | `EMAIL_FROM`                | Remitente verificado                                                |
   | `SEED_ADMIN_EMAIL`          | `pierreelpro19@gmail.com` (solo para el seed)                       |
   | `SEED_ADMIN_PASSWORD`       | Contraseña temporal de al menos 16 caracteres                       |

   El resto de variables de negocio tienen valores por defecto seguros; `.env.example` las documenta.

4. El _healthcheck_ apunta a `/api/v1/health/ready`. El contenedor ejecuta
   `prisma migrate deploy` antes de iniciar NestJS (idempotente). No escales a más de una réplica:
   las migraciones y el worker de notificaciones están pensados para una única instancia.
5. Tras el primer despliegue crea el SUPER_ADMIN (el `upsert` no sobrescribe la contraseña si ya existe):

   ```bash
   railway run --service api pnpm --filter @eventos/api seed:runtime
   ```

   El usuario debe cambiar la contraseña temporal en el primer ingreso.

## 4. Web en Vercel

1. _Add New → Project_ seleccionando el mismo repositorio. No cambies el **Root Directory** (debe ser
   la raíz): `vercel.json` ya define instalación, build y salida para el monorepo.
2. Environment variables (marca también _Preview_ si quieres probar previews):

   | Variable                     | Valor                                                                |
   | ---------------------------- | -------------------------------------------------------------------- |
   | `NEXT_PUBLIC_API_BASE_URL`   | `https://<API-RAILWAY>/api/v1`                                       |
   | `NEXT_PUBLIC_API_DOCS_URL`   | `https://<API-RAILWAY>/api/docs`                                     |
   | `NEXT_PUBLIC_API_HEALTH_URL` | `https://<API-RAILWAY>/api/v1/health/ready`                          |
   | `NEXT_PUBLIC_PAYMENT_QR_URL` | URL pública de la imagen del QR bancario estático de la organización |

   `NEXT_PUBLIC_*` se inyecta en el bundle: un cambio requiere **rebuild**. La imagen del QR de pago
   es pública por diseño y no contiene secretos; la plataforma nunca la genera.

3. Despliega. Vercel añade cabeceras de seguridad definidas en `vercel.json`.

## 5. Verificación posterior

```bash
curl https://<API-RAILWAY>/api/v1/health          # liveness
curl https://<API-RAILWAY>/api/v1/health/ready    # "status":"ok"
```

En el navegador:

1. Ingresa con `pierreelpro19@gmail.com` y cambia la contraseña temporal.
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
  invalidate las sesiones y vuelve a emitir los tickets para que los tokens se cifren con la nueva clave.
- **Correo fallido:** no revierte una compra. Los trabajos quedan en `notification_jobs` y se
  reintentan con backoff; inspecciona `lastError` antes de reprocesar.
- **Rollback:** en Railway selecciona un despliegue anterior en _Deployments → Redeploy_; en Vercel
  usa _Promote to Production_ sobre un deployment anterior. Nunca reviertas una migración aplicada
  sin una migración correctiva nueva.

## 7. Checklist de seguridad

- [ ] `WEB_ORIGIN` y `ADDITIONAL_WEB_ORIGINS` contienen solo orígenes propios y usan HTTPS.
- [ ] `COOKIE_SAME_SITE=none` y `NODE_ENV=production` (implica cookies `Secure`).
- [ ] CORS expone `X-CSRF-Token`: sin esa cabecera el panel en otro dominio no puede enviar el token.
- [ ] Roles `anon`/`authenticated` sin privilegios en `public`; RLS sin políticas en todas las tablas.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY` y credenciales de correo solo en Railway.
- [ ] Buckets `receipts` y `ticket-assets` privados; URLs de acceso son firmadas y caducan.
- [ ] QR de pago alojado como imagen estática pública; QR de ticket renderizado en el navegador.
- [ ] Contraseña temporal del SUPER_ADMIN cambiada y secretos de seed retirados del entorno.
