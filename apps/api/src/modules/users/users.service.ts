import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type RoleName } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import type { RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { checkPasswordPolicy, hashPassword } from '../../common/security/password';
import { toAuthenticatedUser } from '../auth/session.service';
import type { AuthUserView } from '../auth/auth.types';
import type { CreateUserDto } from './dto/create-user.dto';
import type { SetRolesDto } from './dto/set-roles.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

export interface ManagedUserView extends AuthUserView {
  isActive: boolean;
  createdAt: string;
}

const USER_INCLUDE = { roles: { include: { role: true } } } satisfies Prisma.UserInclude;
type UserWithRoles = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<ManagedUserView[]> {
    const users = await this.prisma.user.findMany({
      include: USER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((user) => this.toView(user));
  }

  async create(
    dto: CreateUserDto,
    currentUserId: string,
    context: RequestContext,
  ): Promise<ManagedUserView> {
    const problem = checkPasswordPolicy(dto.password);
    if (problem) {
      throw new BadRequestException({ code: 'WEAK_PASSWORD', message: `The password ${problem}` });
    }

    const roleRecords = await this.findRoles(dto.roles);
    const email = dto.email.toLowerCase();

    let user: UserWithRoles;
    try {
      user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email,
          passwordHash: await hashPassword(dto.password),
          mustChangePassword: true,
          emailVerifiedAt: new Date(),
          roles: {
            create: roleRecords.map((role) => ({ roleId: role.id })),
          },
        },
        include: USER_INCLUDE,
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

    await this.audit.record({
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: user.id,
      userId: currentUserId,
      ...context,
      metadata: { roles: dto.roles, email },
    });

    return this.toView(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUserId: string,
    context: RequestContext,
  ): Promise<ManagedUserView> {
    if (id === currentUserId && dto.isActive === false) {
      throw new BadRequestException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message: 'You cannot deactivate your own account',
      });
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: USER_INCLUDE,
    });

    await this.audit.record({
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      userId: currentUserId,
      ...context,
      metadata: { fullName: dto.fullName ?? null, isActive: dto.isActive ?? null },
    });

    return this.toView(user);
  }

  async setRoles(
    id: string,
    dto: SetRolesDto,
    currentUserId: string,
    context: RequestContext,
  ): Promise<ManagedUserView> {
    if (id === currentUserId) {
      throw new BadRequestException({
        code: 'CANNOT_CHANGE_OWN_ROLES',
        message: 'You cannot change your own roles',
      });
    }

    const roles = await this.findRoles(dto.roles);

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: roles.map((role) => ({ userId: id, roleId: role.id })),
      }),
    ]);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: USER_INCLUDE,
    });

    await this.audit.record({
      action: 'USER_ROLES_CHANGED',
      entityType: 'user',
      entityId: id,
      userId: currentUserId,
      ...context,
      metadata: { roles: dto.roles },
    });

    return this.toView(user);
  }

  private async findRoles(names: RoleName[]) {
    const roles = await this.prisma.role.findMany({ where: { name: { in: names } } });
    if (roles.length !== names.length) {
      throw new BadRequestException({ code: 'UNKNOWN_ROLE', message: 'Unknown role' });
    }
    return roles;
  }

  private toView(user: UserWithRoles): ManagedUserView {
    const { sessionId: _sessionId, ...view } = toAuthenticatedUser(user, '');
    return {
      ...view,
      createdAt: user.createdAt.toISOString(),
      isActive: user.isActive,
    };
  }
}
