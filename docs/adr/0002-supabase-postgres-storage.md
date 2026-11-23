# ADR 0002 — Supabase como PostgreSQL gestionado y Storage privado

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

No hay PostgreSQL ni Docker en el entorno local. El proyecto necesita una base de datos real para
probar concurrencia (sobreventa, doble check-in) y un almacenamiento privado para comprobantes.

## Decisión

- PostgreSQL de Supabase para desarrollo y producción.
- Buckets privados `receipts` y `ticket-assets`.
- Acceso a archivos exclusivamente mediante URLs firmadas emitidas por el backend.
- Prisma se conecta por TCP con el rol de base de datos; no se usa `supabase-js` para autenticación
  ni para acceso a datos.
- La migración inicial **revoca todos los privilegios de `anon` y `authenticated`** sobre el
  esquema `public` (tablas, secuencias y funciones) y sobre los objetos que creen las migraciones
  futuras (`ALTER DEFAULT PRIVILEGES`). Sin esto, la clave publicable que viaja al navegador
  permitiría leer y escribir todas las tablas por la Data API de Supabase, saltándose NestJS.
- Supabase habilita RLS automáticamente en cada tabla nueva de `public` mediante el event trigger
  `ensure_rls`. No se crea ninguna política, por lo que el resultado es denegación total para los
  roles de la Data API.

## Consecuencias

- Toda lectura y escritura pasa por NestJS. La Data API de Supabase queda inutilizable sobre
  `public`, que es exactamente lo buscado: doble defensa (RLS sin políticas + privilegios
  revocados).
- Prisma se conecta con el rol `postgres`, que tiene `BYPASSRLS`; por eso RLS no afecta a la API.
  **Requisito de despliegue:** el rol de conexión debe tener `BYPASSRLS` (o ser propietario de las
  tablas). Si se migra a un rol de aplicación dedicado sin `BYPASSRLS`, hay que añadir políticas
  explícitas; de lo contrario todas las consultas fallarán en silencio.
- Los buckets siguen siendo privados y solo se acceden con URLs firmadas del backend.
- La app usa la cadena del *pooler* (6543) y las migraciones la conexión directa (5432).
- El plan gratuito no ofrece backups automáticos ni PITR. Producción requiere plan Pro o
  `pg_dump` programado con prueba de restauración.
- Las pruebas de integración usan un esquema `test` dedicado para no truncar datos de desarrollo.
