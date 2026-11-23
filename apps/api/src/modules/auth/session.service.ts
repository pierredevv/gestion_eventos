import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AppEnv } from '../../common/config/env';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import type { RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { generateOpaqueToken, hashToken } from '../../common/security/tokens';

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface ResolvedSession {
  user: AuthenticatedUser;
  expiresAt: Date;
  /** True when the sliding expiration was extended and the cookie must be refreshed. */
  renewed: boolean;
}

const USER_WITH_ROLES = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: { roles: { include: { role: true } } },
});

type UserWithRoles = Prisma.UserGetPayload<typeof USER_WITH_ROLES>;

/** Writes to the database at most once per minute instead of on every request. */
const LAST_USED_UPDATE_INTERVAL_MS = 60_000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private get idleTtlMs(): number {
    return this.config.get('SESSION_IDLE_MINUTES', { infer: true }) * 60_000;
  }

  private get absoluteTtlMs(): number {
    return this.config.get('SESSION_ABSOLUTE_HOURS', { infer: true }) * 3_600_000;
  }

  /**
   * Creates a session. The returned token exists only in memory and in the
   * response cookie; PostgreSQL stores its SHA-256 hash.
   */
  async create(userId: string, context: RequestContext): Promise<IssuedSession> {
    const token = generateOpaqueToken();
    const now = Date.now();

    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(now + this.idleTtlMs),
        absoluteExpiresAt: new Date(now + this.absoluteTtlMs),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      select: { id: true, expiresAt: true },
    });

    return { token, sessionId: session.id, expiresAt: session.expiresAt };
  }

  async resolve(token: string): Promise<ResolvedSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: USER_WITH_ROLES },
    });

    if (!session) {
      return null;
    }

    const now = new Date();
    if (
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now.getTime() ||
      session.absoluteExpiresAt.getTime() <= now.getTime() ||
      !session.user.isActive
    ) {
      return null;
    }

    let expiresAt = session.expiresAt;
    let renewed = false;

    if (now.getTime() - session.lastUsedAt.getTime() > LAST_USED_UPDATE_INTERVAL_MS) {
      expiresAt = new Date(
        Math.min(now.getTime() + this.idleTtlMs, session.absoluteExpiresAt.getTime()),
      );
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: now, expiresAt },
      });
      renewed = true;
    }

    return { user: toAuthenticatedUser(session.user, session.id), expiresAt, renewed };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Used after a password change or reset: every other device is signed out. */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }
}

export function toAuthenticatedUser(user: UserWithRoles, sessionId: string): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles.map((userRole) => userRole.role.name),
    mustChangePassword: user.mustChangePassword,
    emailVerified: user.emailVerifiedAt !== null,
    sessionId,
  };
}
