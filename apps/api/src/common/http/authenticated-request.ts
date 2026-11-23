import type { Request } from 'express';
import type { RoleName } from '@prisma/client';

/**
 * Authenticated principal attached to the request by `SessionAuthGuard`.
 * It never contains the password hash, the session token or internal flags
 * that are not needed to authorize a request.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  roles: RoleName[];
  mustChangePassword: boolean;
  emailVerified: boolean;
  sessionId: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

export function getAuthenticatedUser(request: Request): AuthenticatedUser | undefined {
  return (request as AuthenticatedRequest).user;
}
