import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AppEnv } from '../../common/config/env';
import { PrismaService } from '../../common/prisma/prisma.service';

interface ReadinessResponse {
  status: 'ok' | 'degraded';
  checks: {
    database: { ok: boolean; latencyMs: number; error?: string };
  };
  timestamp: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  live(): { status: 'ok'; uptimeSeconds: number; timestamp: string } {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (checks database connectivity)' })
  @ApiResponse({ status: 200, description: 'All dependencies are ready' })
  @ApiResponse({ status: 503, description: 'A dependency is unavailable' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const database = await this.prisma.checkConnection();
    const isProduction = this.config.get('NODE_ENV', { infer: true }) === 'production';

    if (!database.ok) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    // Connection strings and driver internals must never reach an unauthenticated probe.
    const databaseCheck = database.ok
      ? database
      : {
          ...database,
          error: isProduction ? 'Database unavailable' : database.error,
        };

    return {
      status: database.ok ? 'ok' : 'degraded',
      checks: { database: databaseCheck },
      timestamp: new Date().toISOString(),
    };
  }
}
