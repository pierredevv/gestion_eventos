import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './common/audit/audit.module';
import { validateEnv } from './common/config/env';
import { EmailModule } from './common/email/email.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './common/prisma/prisma.module';
import { SecurityModule } from './common/security/security.module';
import { AuthModule } from './modules/auth/auth.module';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { SessionAuthGuard } from './modules/auth/guards/session-auth.guard';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['../../.env', '.env'],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SecurityModule,
    AuditModule,
    EmailModule,
    HealthModule,
    AuthModule,
    UsersModule,
    EventsModule,
    OrdersModule,
    PaymentsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Throttling runs first, then authentication, then role checks.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
