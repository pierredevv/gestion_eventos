# ADR 0006 — Tokens de ticket: hash para búsqueda, cifrado para regenerar el QR

- **Estado:** Aceptado
- **Fecha:** 2026-11-22

## Contexto

El QR de acceso debe contener un token aleatorio e impredecible, nunca datos personales ni
identificadores secuenciales.

Si solo se almacena el hash del token, el sistema no puede volver a generar el QR. Eso rompe dos
requisitos: reenviar tickets ante fallos de correo (RF-13) y permitir que el asistente recupere su
entrada desde el portal.

> Nota: el **QR bancario de pago** es distinto. Es una imagen estática que carga la administración;
> el sistema no la genera. El QR que sí genera el sistema es el del ticket.

## Decisión

Cada ticket almacena:

- `token_hash` (SHA-256, 64 hex): búsqueda en el escaneo, índice único.
- `token_ciphertext` (AES-256-GCM, clave `TOKEN_ENCRYPTION_KEY` de 32 bytes): permite regenerar el
  QR sin guardar el token en claro.
- `ticket_code`: código corto legible para consulta manual por personal autorizado; no sirve para
  reconstruir el token.

El token es de 256 bits generados con `crypto.randomBytes(32)`. SHA-256 es suficiente porque el
espacio de búsqueda es inviable para un atacante (no hace falta Argon2 para secretos de alta
entropía).

## Consecuencias

- Rotar `TOKEN_ENCRYPTION_KEY` exige re-cifrar los tokens existentes; se documentará el
  procedimiento.
- Los logs y la auditoría nunca incluyen el token ni el ciphertext.
- El payload del QR es solo el token (con un prefijo de versión), sin PII.
- Un token `USED` o `CANCELLED` se rechaza sin revelar datos del asistente a quien no tiene
  permisos de check-in.
