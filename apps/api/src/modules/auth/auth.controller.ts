import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CSRF_COOKIE_NAME } from '../../common/security/csrf.constants';
import { CookieService } from '../../common/security/cookie.service';
import { getRequestContext } from '../../common/http/request-context';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request';
import { AuthService } from './auth.service';
import type { AuthUserView } from './auth.types';
import {
  AllowPendingPasswordChange,
  Public,
} from './decorators/auth.decorators';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly cookies: CookieService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({ status: 200, description: 'Session cookie set' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthUserView }> {
    const result = await this.auth.login(dto, getRequestContext(request));
    this.cookies.setSession(response, result.token, result.expiresAt);
    this.cookies.ensureCsrfToken(
      response,
      request.cookies?.[CSRF_COOKIE_NAME],
    );
    return { user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Create a buyer account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<{ user: AuthUserView }> {
    return { user: await this.auth.register(dto, getRequestContext(request)) };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Verify an email address from a token' })
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: Request): Promise<void> {
    await this.auth.verifyEmail(dto, getRequestContext(request));
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send a password reset link (always accepted)' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto, getRequestContext(request));
    return { message: 'If the account exists, a reset link has been sent.' };
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request): Promise<void> {
    await this.auth.resetPassword(dto, getRequestContext(request));
  }

  @AllowPendingPasswordChange()
  @Get('me')
  @ApiOperation({ summary: 'Get the current account' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{ user: AuthUserView }> {
    return { user: await this.auth.me(user.id) };
  }

  @AllowPendingPasswordChange()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(user.sessionId, user.id, getRequestContext(request));
    this.cookies.clearSession(response);
  }

  @AllowPendingPasswordChange()
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change password and clear the forced-change flag' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.auth.changePassword(
      user.id,
      user.sessionId,
      dto,
      getRequestContext(request),
    );
  }
}
