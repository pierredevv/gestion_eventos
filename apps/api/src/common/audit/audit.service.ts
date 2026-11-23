import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string | null;
  actorLabel?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Writes to the append-only `audit_logs` table (enforced by a trigger).
 *
 * Auditing must never break the business operation, so failures are logged and
 * swallowed. The log line still carries the request id for correlation.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          userId: entry.userId ?? null,
          actorLabel: entry.actorLabel ?? null,
          requestId: entry.requestId ?? null,
          ipAddress: entry.ipAddress ?? null,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not write audit entry ${entry.action} for ${entry.entityType}:${entry.entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
