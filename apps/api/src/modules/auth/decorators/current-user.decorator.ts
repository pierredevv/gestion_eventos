import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../../../common/http/authenticated-request';

/**
 * Injects the authenticated user, or one of its properties:
 * `@CurrentUser() user: AuthenticatedUser` / `@CurrentUser('id') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'Authentication required',
      });
    }

    return property ? user[property] : user;
  },
);

/**
 * Injects the authenticated user when present, otherwise `undefined`.
 * Intended for public routes that behave differently for signed-in buyers.
 */
export const OptionalCurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return property ? user[property] : user;
  },
);
