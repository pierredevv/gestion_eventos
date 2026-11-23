import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { AppEnv } from '../../../common/config/env';
import type { AuthenticatedRequest } from '../../../common/http/authenticated-request';
import { CookieService } from '../../../common/security/cookie.service';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  UNSAFE_METHODS,
} from '../../../common/security/csrf.constants';
import { safeEqual } from '../../../common/security/tokens';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { SessionService } from '../session.service';

/**
 * Default-deny authentication guard.
 *
 * Order of checks: Origin -> session -> CSRF (on unsafe methods) -> forced
 * password change. `@Public()` only skips the session requirement; Origin is
 * still validated so public mutations (login, register, reset) cannot be
 * triggered from a hostile origin.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly cookies: CookieService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    this.assertAllowedOrigin(request);

    const isPublic = this.isMarked(context, IS_PUBLIC_KEY);
    const token = request.cookies?.[SESSION_COOKIE_NAME];

    if (!token) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    }

    const resolved = await this.sessions.resolve(token);

    if (!resolved) {
      this.cookies.clearSession(response);
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Session expired or invalid',
      });
    }

    request.user = resolved.user;

    if (resolved.renewed) {
      this.cookies.setSession(response, token, resolved.expiresAt);
    }

    if (UNSAFE_METHODS.has(request.method)) {
      this.assertCsrfToken(request);
    }

    const allowPendingChange = this.isMarked(context, ALLOW_PENDING_PASSWORD_KEY);
    if (resolved.user.mustChangePassword && !allowPendingChange) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your temporary password before continuing',
      });
    }

    return true;
  }

  private isMarked(context: ExecutionContext, key: string): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]) ??
      false
    );
  }

  private assertAllowedOrigin(request: Request): void {
    if (!UNSAFE_METHODS.has(request.method)) {
      return;
    }

    // Non-browser clients (curl, server-to-server) do not send Origin.
    const origin = request.header('origin');
    const allowedOrigins = [
      this.config.get('WEB_ORIGIN', { infer: true }),
      ...(this.config.get('ADDITIONAL_WEB_ORIGINS', { infer: true }) ?? []),
    ];

    if (origin && !allowedOrigins.includes(origin)) {
      throw new ForbiddenException({
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'Request origin is not allowed',
      });
    }
  }

  private assertCsrfToken(request: Request): void {
    const cookieToken = request.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = request.header(CSRF_HEADER_NAME);

    if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        message: 'Missing or invalid CSRF token',
      });
    }
  }
}
