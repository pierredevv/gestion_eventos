import type { NextFunction, Request, Response } from 'express';
import type { CookieService } from './cookie.service';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './csrf.constants';

/**
 * Ensures every visitor has a CSRF token, including before login. The cookie
 * is scoped to the API domain; when the web app is hosted on another domain it
 * cannot be read from JavaScript there, so the same non-secret token is also
 * exposed in a response header (CORS must expose it). The Origin allowlist is
 * the primary defence against cross-site writes.
 */
export function createCsrfCookieMiddleware(cookies: CookieService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const jar = request.cookies as Record<string, string> | undefined;
    const token = cookies.ensureCsrfToken(response, jar?.[CSRF_COOKIE_NAME]);
    response.setHeader(CSRF_HEADER_NAME, token);
    next();
  };
}
