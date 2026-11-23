# ADR 0007 — Sesiones opacas en PostgreSQL y CSRF

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

El sistema tiene cuatro roles administrativos, compradores registrados e invitados con acceso
temporal a su orden. Se necesita revocación inmediata y protección CSRF sin añadir Redis.

## Decisión

- Sesión = token aleatorio de 256 bits enviado en cookie `httpOnly; Secure; SameSite=Lax`.
- En base de datos se guarda solo `sha256(token)` en `sessions`, con vencimiento por inactividad
  (`SESSION_IDLE_MINUTES`) y absoluto (`SESSION_ABSOLUTE_HOURS`).
- Cada respuesta renueva `lastUsedAt`; el logout marca `revokedAt`.
- Mutaciones exigen doble envío CSRF: cookie legible `csrf_token` + cabecera `X-CSRF-Token`, más
  validación de `Origin` contra `WEB_ORIGIN`.
- En producción, web y API comparten origen mediante proxy inverso (`/api/v1` → NestJS), lo que
  elimina CORS y simplifica la cookie de primera parte.

## Consecuencias

- Toda petición autenticada consulta la sesión en Postgres: se indexa `token_hash` y `expiresAt`.
- Escalar a varias instancias no requiere estado compartido adicional.
- Los invitados no usan sesión de usuario: reciben un enlace de un solo uso que canjea por una
  sesión de alcance limitado a esa orden (ver RF-14).
