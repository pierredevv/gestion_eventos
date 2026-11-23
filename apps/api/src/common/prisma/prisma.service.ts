import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { AppEnv } from '../config/env';

export interface DatabaseHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly configured: boolean;

  constructor(config: ConfigService<AppEnv, true>) {
    const url = config.get('DATABASE_URL', { infer: true });
    const nodeEnv = config.get('NODE_ENV', { infer: true });

    const logLevels: Prisma.LogLevel[] = nodeEnv === 'development' ? ['warn', 'error'] : ['error'];

    super(url ? { datasourceUrl: url, log: logLevels } : { log: logLevels });

    this.configured = Boolean(url);
    if (!this.configured) {
      this.logger.warn('DATABASE_URL is not configured: database features are unavailable');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkConnection(): Promise<DatabaseHealth> {
    if (!this.configured) {
      return { ok: false, latencyMs: 0, error: 'DATABASE_URL is not configured' };
    }

    const startedAt = Date.now();
    try {
      await this.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown database error';
      this.logger.error(`Database health check failed: ${message}`);
      return { ok: false, latencyMs: Date.now() - startedAt, error: message };
    }
  }
}
