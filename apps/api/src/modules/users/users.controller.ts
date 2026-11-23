import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Request } from 'express';
import { getRequestContext } from '../../common/http/request-context';
import { Roles } from '../auth/decorators/auth.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { SetRolesDto } from './dto/set-roles.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { ManagedUserView } from './users.service';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@Roles(RoleName.SUPER_ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List accounts and their roles (SUPER_ADMIN only)' })
  async list(): Promise<{ users: ManagedUserView[] }> {
    return { users: await this.users.list() };
  }

  @Post()
  @ApiOperation({ summary: 'Create a staff account with a temporary password' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser('id') currentUserId: string,
    @Req() request: Request,
  ): Promise<{ user: ManagedUserView }> {
    return { user: await this.users.create(dto, currentUserId, getRequestContext(request)) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an account name or active state' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') currentUserId: string,
    @Req() request: Request,
  ): Promise<{ user: ManagedUserView }> {
    return {
      user: await this.users.update(id, dto, currentUserId, getRequestContext(request)),
    };
  }

  @Put(':id/roles')
  @ApiOperation({ summary: 'Replace the roles assigned to an account' })
  async setRoles(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetRolesDto,
    @CurrentUser('id') currentUserId: string,
    @Req() request: Request,
  ): Promise<{ user: ManagedUserView }> {
    return {
      user: await this.users.setRoles(id, dto, currentUserId, getRequestContext(request)),
    };
  }
}
