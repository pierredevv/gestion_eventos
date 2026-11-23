import type { NextFunction, Request, Response } from 'express';
import type { CookieService } from './cookie.service';
import { CSRF_COOKIE_NAME } from './csrf.constants';

/**
 * Ensures every visitor has a CSRF cookie, including before login. The token is
 * not a secret: its only purpose is to prove that the request was issued by
 * same-origin JavaScript that could read the cookie.
 */
export function createCsrfCookieMiddleware(cookies: CookieService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const jar = request.cookies as Record<string, string> | undefined;
    cookies.ensureCsrfToken(response, jar?.[CSRF_COOKIE_NAME]);
    next();
  };
}
