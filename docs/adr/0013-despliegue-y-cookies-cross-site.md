# ADR 0013 — Despliegue separado y cookies entre sitios

- Estado: Aceptado
- Fecha: 2026-11-23
- Relacionado: ADR 0007 (sesiones opacas y CSRF)

## Contexto

La web se publica en Vercel y la API en Render. Sus orígenes tienen dominios registrables
distintos (`vercel.app` frente a `onrender.com`), por lo que el navegador los considera **sitios
distintos**. Las cookies con `SameSite=Lax` no se envían en peticiones `fetch` entre sitios: la
sesión del panel administrativo quedaría inutilizable aunque CORS permitiera la petición.

Además, los previews de Vercel generan orígenes nuevos y la API debe poder aceptarlos sin abrir CORS
a cualquier sitio.

## Decisión

1. Las cookies de sesión y CSRF usan `SameSite=None; Secure` en producción, controlado por
   `COOKIE_SAME_SITE`. En desarrollo se mantiene `Lax` porque web y API comparten `localhost`.
2. La API valida `Origin` en cada método inseguro contra `WEB_ORIGIN` más una lista opcional
   `ADDITIONAL_WEB_ORIGINS`. La misma lista alimenta CORS con `credentials: true`.
3. Se conserva el doble envío de CSRF: la cookie `csrf_token` debe coincidir con la cabecera
   `X-CSRF-Token`. La cookie pertenece al dominio de la API y **no** es legible desde la web en otro
   dominio, así que el middleware expone el mismo token en la cabecera de respuesta `X-CSRF-Token`
   (permitida por CORS mediante `Access-Control-Expose-Headers`). El cliente la guarda en memoria y
   la devuelve en cada mutación. `SameSite=None` permite que la cookie llegue, pero `Origin` sigue
   bloqueando a terceros.
4. `WEB_ORIGIN` se normaliza (sin slash final) porque el navegador nunca envía la barra en `Origin`.
5. Las URLs de Vercel cambian en cada preview; se documentan como orígenes adicionales explícitos en
   lugar de usar comodines.

## Consecuencias

- Funciona sin dominio propio. Si un navegador bloquea cookies de terceros, la alternativa es
  publicar web y API bajo un mismo dominio (proxy inverso o dominios propios) y volver a `Lax`.
- `SameSite=None` exige HTTPS en ambos extremos; la validación de entorno ya obliga a `WEB_ORIGIN`
  HTTPS en producción y la cookie se marca `Secure`.
- Un atacante no puede crear una sesión válida solo induciendo una petición: necesita la cookie
  httpOnly y el token CSRF, y el origen debe estar en la allowlist.
- Si se elimina la exposición de la cabecera, el panel dejará de funcionar en dominios separados:
  el token de la API no puede leerse con `document.cookie` desde Vercel.
