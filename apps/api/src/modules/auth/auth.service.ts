import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import type { AppEnv } from '../../common/config/env';
import { EmailService } from '../../common/email/email.service';
import type { RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  checkPasswordPolicy,
  hashPassword,
  verifyAgainstDummyHash,
  verifyPassword,
} from '../../common/security/password';
import { generateOpaqueToken, hashToken } from '../../common/security/tokens';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import type { VerifyEmailDto } from './dto/verify-email.dto';
import type { AuthUserView } from './auth.types';
import { SessionService, toAuthenticatedUser, type IssuedSession } from './session.service';

type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

const RESET_TOKEN_TTL_MS = 30 * 60_000;
const VERIFICATION_TOKEN_TTL_MS = 24 * 3_600_000;
const AUDIT_ID_MAX_LENGTH = 64;

const shorten = (value: string): string => value.slice(0, AUDIT_ID_MAX_LENGTH);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async login(
    dto: LoginDto,
    context: RequestContext,
  ): Promise<IssuedSession & { user: AuthUserView }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { roles: { include: { role: true } } },
    });

    // Always perform one Argon2 verification, even for unknown emails.
    const passwordOk = user
      ? await verifyPassword(user.passwordHash, dto.password)
      : await verifyAgainstDummyHash(dto.password);

    if (!user || !passwordOk || !user.isActive) {
      await this.audit.record({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'user',
        entityId: shorten(user?.id ?? dto.email),
        actorLabel: dto.email,
        ...context,
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const session = await this.sessions.create(user.id, context);

    await this.audit.record({
      action: 'AUTH_LOGIN',
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      ...context,
    });

    return { ...session, user: this.toView(user) };
  }

  async logout(sessionId: string, userId: string, context: RequestContext): Promise<void> {
    await this.sessions.revoke(sessionId);
    await this.audit.record({
      action: 'AUTH_LOGOUT',
      entityType: 'user',
      entityId: userId,
      userId,
      ...context,
    });
  }

  async me(userId: string): Promise<AuthUserView> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    return this.toView(user);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto,
    context: RequestContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'The current password is incorrect',
      });
    }

    this.assertStrongPassword(dto.newPassword);

    if (await verifyPassword(user.passwordHash, dto.newPassword)) {
      throw new BadRequestException({
        code: 'PASSWORD_REUSED',
        message: 'The new password must differ from the current one',
      });
    }

    const passwordHash = await hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: 'AUTH_PASSWORD_CHANGED',
      entityType: 'user',
      entityId: userId,
      userId,
      ...context,
    });
  }

  async register(dto: RegisterDto, context: RequestContext): Promise<AuthUserView> {
    this.assertStrongPassword(dto.password);

    const email = dto.email.toLowerCase();
    let user: UserWithRoles;

    try {
      user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email,
          passwordHash: await hashPassword(dto.password),
        },
        include: { roles: { include: { role: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'An account with this email already exists',
        });
      }
      throw error;
    }

    await this.issueVerificationToken(user.id, email, 'EMAIL_VERIFY');
    await this.audit.record({
      action: 'AUTH_REGISTERED',
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      ...context,
    });

    return this.toView(user);
  }

  async forgotPassword(dto: ForgotPasswordDto, context: RequestContext): Promise<void> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Do not reveal whether the account exists.
    if (!user || !user.isActive) {
      return;
    }

    await this.issueVerificationToken(user.id, email, 'PASSWORD_RESET');
    await this.audit.record({
      action: 'AUTH_PASSWORD_RESET_REQUESTED',
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      ...context,
    });
  }

  async resetPassword(dto: ResetPasswordDto, context: RequestContext): Promise<void> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });

    if (
      !record ||
      record.purpose !== 'PASSWORD_RESET' ||
      !record.userId ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'The reset link is invalid or has expired',
      });
    }

    this.assertStrongPassword(dto.newPassword);
    const passwordHash = await hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: 'AUTH_PASSWORD_RESET',
      entityType: 'user',
      entityId: record.userId,
      userId: record.userId,
      ...context,
    });
  }

  async verifyEmail(dto: VerifyEmailDto, context: RequestContext): Promise<void> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });

    if (
      !record ||
      record.purpose !== 'EMAIL_VERIFY' ||
      !record.userId ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'The verification link is invalid or has expired',
      });
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: 'AUTH_EMAIL_VERIFIED',
      entityType: 'user',
      entityId: record.userId,
      userId: record.userId,
      ...context,
    });
  }

  private assertStrongPassword(password: string): void {
    const problem = checkPasswordPolicy(password);
    if (problem) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: `The password ${problem}`,
      });
    }
  }

  private async issueVerificationToken(
    userId: string,
    email: string,
    purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET',
  ): Promise<void> {
    const token = generateOpaqueToken();
    const ttl = purpose === 'PASSWORD_RESET' ? RESET_TOKEN_TTL_MS : VERIFICATION_TOKEN_TTL_MS;

    // A single usable link at a time, so an old email cannot override a newer one.
    await this.prisma.verificationToken.deleteMany({
      where: { email, purpose, usedAt: null },
    });
    await this.prisma.verificationToken.create({
      data: {
        userId,
        email,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttl),
      },
    });

    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
    const path = purpose === 'PASSWORD_RESET' ? '/reset-password' : '/verify-email';
    const link = `${webOrigin}${path}?token=${encodeURIComponent(token)}`;
    const subject =
      purpose === 'PASSWORD_RESET' ? 'Restablece tu contraseña' : 'Verifica tu correo';

    try {
      await this.email.send({
        to: email,
        subject,
        text: `${subject}:\n\n${link}\n\nEste enlace vence en ${
          purpose === 'PASSWORD_RESET' ? '30 minutos' : '24 horas'
        }. Si no solicitaste este correo, ignóralo.`,
      });
    } catch (error) {
      // Email delivery is retried by the notification layer in F7; it must not
      // roll back the account operation or leak provider details to the client.
      this.logger.error(
        `Could not deliver ${purpose} email to ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private toView(user: UserWithRoles): AuthUserView {
    const principal = toAuthenticatedUser(user, '');
    return {
      id: principal.id,
      fullName: principal.fullName,
      email: principal.email,
      roles: principal.roles,
      emailVerified: principal.emailVerified,
      mustChangePassword: principal.mustChangePassword,
    };
  }
}
