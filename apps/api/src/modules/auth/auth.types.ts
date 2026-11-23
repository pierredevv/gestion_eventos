import type { RoleName } from '@prisma/client';

/** Public representation of an account; never includes hashes or tokens. */
export interface AuthUserView {
  id: string;
  fullName: string;
  email: string;
  roles: RoleName[];
  emailVerified: boolean;
  mustChangePassword: boolean;
}
