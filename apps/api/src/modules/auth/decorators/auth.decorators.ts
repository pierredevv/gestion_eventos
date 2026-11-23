import { SetMetadata } from '@nestjs/common';
import type { RoleName } from '@prisma/client';

/** Marks a route as reachable without a session (login, health, public catalog). */
export const IS_PUBLIC_KEY = 'auth:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires the authenticated user to have at least one of the given roles. */
export const ROLES_KEY = 'auth:roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Allows the route while `mustChangePassword` is true. Only `me`, `logout` and
 * `change-password` should use it.
 */
export const ALLOW_PENDING_PASSWORD_KEY = 'auth:allowPendingPassword';
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);
