import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleName } from '@prisma/client';
import type { AuthenticatedRequest } from '../../../common/http/authenticated-request';
import { ROLES_KEY } from '../decorators/auth.decorators';

/** Checks `@Roles(...)` metadata. Routes without metadata require any valid session. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    }

    // SUPER_ADMIN is an explicit break-glass role defined in the SRS.
    if (user.roles.includes('SUPER_ADMIN')) {
      return true;
    }

    if (!requiredRoles.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: 'Insufficient permissions',
      });
    }

    return true;
  }
}
