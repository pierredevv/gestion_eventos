import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { AppEnv } from '../config/env';
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from './csrf.constants';
import { generateOpaqueToken } from './tokens';

@Injectable()
export class CookieService {
  private readonly secureCookies: boolean;
  private readonly sameSite: 'lax' | 'none' | 'strict';

  constructor(config: ConfigService<AppEnv, true>) {
    this.sameSite = config.get('COOKIE_SAME_SITE', { infer: true });
    // `SameSite=None` is only accepted by browsers together with `Secure`.
    this.secureCookies =
      config.get('NODE_ENV', { infer: true }) === 'production' || this.sameSite === 'none';
  }

  private baseOptions(): CookieOptions {
    return {
      path: '/',
      sameSite: this.sameSite,
      secure: this.secureCookies,
    };
  }

  /**
   * Session cookie: httpOnly, so JavaScript (and therefore XSS payloads) cannot
   * read the token. `lax` allows normal navigation while blocking cross-site
   * POSTs; CSRF is additionally enforced with the double-submit token.
   */
  setSession(res: Response, token: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE_NAME, token, {
      ...this.baseOptions(),
      httpOnly: true,
      expires: expiresAt,
    });
  }

  clearSession(res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, { ...this.baseOptions(), httpOnly: true });
  }

  /** Readable cookie; it is not a secret by itself (it only proves same-site). */
  ensureCsrfToken(res: Response, existingToken?: string): string {
    if (existingToken) {
      return existingToken;
    }

    const token = generateOpaqueToken(24);
    res.cookie(CSRF_COOKIE_NAME, token, {
      ...this.baseOptions(),
      httpOnly: false,
      // Session-scoped: no `expires`, cleared when the browser closes.
    });
    return token;
  }
}
