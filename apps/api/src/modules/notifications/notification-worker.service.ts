import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  NotificationStatus,
  NotificationType,
  Prisma,
  type NotificationJob,
} from '@prisma/client';
import type { AppEnv } from '../../common/config/env';
import { EmailService } from '../../common/email/email.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INTERACTIVE_TRANSACTION_OPTIONS } from '../../common/prisma/transaction-options';
import { TicketsService } from '../tickets/tickets.service';

const BATCH_SIZE = 20;
const STALE_LOCK_MINUTES = 10;

type Job = NotificationJob;

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Durable notification dispatcher.
 *
 * Jobs are claimed with `FOR UPDATE SKIP LOCKED`, so several API instances can
 * run this cron without delivering the same message twice. A job is marked
 * SENT only after the provider accepts it; failures retry with backoff.
 */
@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly tickets: TicketsService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    let processed = 0;
    try {
      const ids = await this.claimBatch();
      for (const id of ids) {
        const job = await this.prisma.notificationJob.findUnique({ where: { id } });
        if (!job || job.status !== NotificationStatus.PROCESSING) {
          continue;
        }
        try {
          await this.deliver(job);
          await this.prisma.notificationJob.update({
            where: { id },
            data: { status: NotificationStatus.SENT, sentAt: new Date(), lockedAt: null },
          });
          processed += 1;
        } catch (error) {
          await this.markFailed(job, error);
        }
      }
    } finally {
      this.running = false;
    }
    return processed;
  }

  private async claimBatch(): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      // Recover jobs abandoned by a worker that crashed mid-delivery.
      await tx.notificationJob.updateMany({
        where: {
          status: NotificationStatus.PROCESSING,
          lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MINUTES * 60_000) },
        },
        data: { status: NotificationStatus.PENDING, lockedAt: null },
      });

      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM notification_jobs
        WHERE status = 'PENDING'::"NotificationStatus"
          AND next_attempt_at <= now()
        ORDER BY next_attempt_at ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) {
        return [];
      }
      const ids = rows.map((row) => row.id);
      await tx.notificationJob.updateMany({
        where: { id: { in: ids } },
        data: { status: NotificationStatus.PROCESSING, lockedAt: new Date() },
      });
      return ids;
    }, INTERACTIVE_TRANSACTION_OPTIONS);
  }

  private async deliver(job: Job): Promise<void> {
    const payload = asRecord(job.payload);
    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
    const orderCode = text(payload.orderCode) ?? 'tu pedido';

    switch (job.type) {
      case NotificationType.ORDER_CREATED: {
        const token = text(payload.accessToken);
        const link = token
          ? `${webOrigin}/orders/${encodeURIComponent(orderCode)}?token=${encodeURIComponent(token)}`
          : webOrigin;
        await this.email.send({
          to: job.recipient,
          subject: `Pedido ${orderCode} creado`,
          text: `Tu pedido ${orderCode} fue creado. Completa el pago antes de ${text(payload.expiresAt) ?? 'el plazo indicado'}.\nRevisa tu pedido aquí: ${link}`,
        });
        return;
      }

      case NotificationType.RECEIPT_RECEIVED:
        await this.email.send({
          to: job.recipient,
          subject: `Comprobante recibido para ${orderCode}`,
          text: `Recibimos tu comprobante por ${text(payload.declaredAmount) ?? 'el monto declarado'}. Te avisaremos cuando termine la revisión.`,
        });
        return;

      case NotificationType.PAYMENT_APPROVED:
        await this.email.send({
          to: job.recipient,
          subject: `Pago aprobado para ${orderCode}`,
          text: `Tu pago de ${text(payload.amount) ?? ''} fue aprobado. Tus entradas estarán disponibles en tu portal.`,
        });
        return;

      case NotificationType.PAYMENT_REJECTED: {
        const definitive = payload.definitive === true;
        const attempts = typeof payload.attempts === 'number' ? payload.attempts : 0;
        const maxAttempts = typeof payload.maxAttempts === 'number' ? payload.maxAttempts : 0;
        await this.email.send({
          to: job.recipient,
          subject: `Comprobante rechazado para ${orderCode}`,
          text: definitive
            ? `Tu comprobante fue rechazado de forma definitiva. Motivo: ${text(payload.reason) ?? 'no especificado'}.`
            : `Tu comprobante fue rechazado. Motivo: ${text(payload.reason) ?? 'no especificado'}. Te quedan ${Math.max(0, maxAttempts - attempts)} intentos.`,
        });
        return;
      }

      case NotificationType.TICKET_DELIVERY: {
        const orderId = text(payload.orderId);
        if (!orderId) {
          throw new Error('TICKET_DELIVERY job has no orderId');
        }
        await this.tickets.issueForOrder(orderId);

        let token = text(payload.accessToken);
        if (!token) {
          const access = await this.tickets.createDeliveryAccessToken(orderId);
          token = access.token;
          // Keep the plaintext token only in this internal job payload so a
          // retry can resend the same link instead of revoking and replacing it.
          await this.prisma.notificationJob.update({
            where: { id: job.id },
            data: { payload: { ...payload, accessToken: token } as Prisma.InputJsonValue },
          });
        }
        const link = `${webOrigin}/tickets?token=${encodeURIComponent(token)}`;
        await this.email.send({
          to: job.recipient,
          subject: `Tus entradas para ${text(payload.orderCode) ?? orderCode}`,
          text: `Tus entradas están listas. Consúltalas y muestra el QR en la entrada: ${link}`,
        });
        return;
      }
    }
  }

  private async markFailed(job: Job, error: unknown): Promise<void> {
    const attempts = job.attempts + 1;
    const dead = attempts >= job.maxAttempts;
    const backoffMinutes = Math.min(60, 2 ** attempts);
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Notification ${job.id} (${job.type}) failed on attempt ${attempts}: ${message}`,
    );
    await this.prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        status: dead ? NotificationStatus.DEAD : NotificationStatus.PENDING,
        attempts,
        lastError: message.slice(0, 2000),
        lockedAt: null,
        nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000),
      },
    });
  }
}
