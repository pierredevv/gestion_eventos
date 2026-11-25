import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationStatus, NotificationType, Prisma, type NotificationJob } from '@prisma/client';
import type { AppEnv } from '../../common/config/env';
import { EmailService } from '../../common/email/email.service';
import {
  renderOrderCreated,
  renderPaymentApproved,
  renderPaymentRejected,
  renderReceiptReceived,
  renderTicketDelivery,
} from '../../common/email/templates';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INTERACTIVE_TRANSACTION_OPTIONS } from '../../common/prisma/transaction-options';
import { EventEmailBrandingService } from '../events/event-email-branding.service';
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
    private readonly branding: EventEmailBrandingService,
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
          await this.markSettled(job.id, {
            status: NotificationStatus.SENT,
            sentAt: new Date(),
            lockedAt: null,
          });
          processed += 1;
        } catch (error) {
          await this.markFailed(job, error);
        }
      }
    } catch (error) {
      // A failed claim must not produce an unhandled scheduler rejection:
      // jobs stay PENDING and are retried on the next tick.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Notification worker batch failed: ${message}`);
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
    // Old jobs have no eventId: they simply use the platform brand.
    const context = await this.branding.getRenderContext(text(payload.eventId));
    const eventTitle = text(payload.eventTitle) ?? context.eventTitle;

    switch (job.type) {
      case NotificationType.ORDER_CREATED: {
        const token = text(payload.accessToken);
        const link = token
          ? `${webOrigin}/orders/${encodeURIComponent(orderCode)}?token=${encodeURIComponent(token)}`
          : webOrigin;
        const rendered = renderOrderCreated({
          brand: context.brand,
          overrides: context.templates.ORDER_CREATED,
          currency: context.currency,
          details: context.eventDetails,
          orderCode,
          eventTitle,
          expiresAt: text(payload.expiresAt),
          link,
        });
        await this.email.send({ to: job.recipient, ...rendered });
        return;
      }

      case NotificationType.RECEIPT_RECEIVED: {
        const rendered = renderReceiptReceived({
          brand: context.brand,
          overrides: context.templates.RECEIPT_RECEIVED,
          currency: context.currency,
          details: context.eventDetails,
          orderCode,
          declaredAmount: text(payload.declaredAmount),
          paymentReference: text(payload.paymentReference),
        });
        await this.email.send({ to: job.recipient, ...rendered });
        return;
      }

      case NotificationType.PAYMENT_APPROVED: {
        const rendered = renderPaymentApproved({
          brand: context.brand,
          overrides: context.templates.PAYMENT_APPROVED,
          currency: context.currency,
          details: context.eventDetails,
          orderCode,
          amount: text(payload.amount),
        });
        await this.email.send({ to: job.recipient, ...rendered });
        return;
      }

      case NotificationType.PAYMENT_REJECTED: {
        const definitive = payload.definitive === true;
        const attempts = typeof payload.attempts === 'number' ? payload.attempts : 0;
        const maxAttempts = typeof payload.maxAttempts === 'number' ? payload.maxAttempts : 0;
        const rendered = renderPaymentRejected({
          brand: context.brand,
          overrides: context.templates.PAYMENT_REJECTED,
          currency: context.currency,
          details: context.eventDetails,
          orderCode,
          reason: text(payload.reason),
          attempts,
          maxAttempts,
          definitive,
        });
        await this.email.send({ to: job.recipient, ...rendered });
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
        const rendered = renderTicketDelivery({
          brand: context.brand,
          overrides: context.templates.TICKET_DELIVERY,
          currency: context.currency,
          details: context.eventDetails,
          orderCode,
          eventTitle,
          link,
        });
        await this.email.send({ to: job.recipient, ...rendered });
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
    await this.markSettled(job.id, {
      status: dead ? NotificationStatus.DEAD : NotificationStatus.PENDING,
      attempts,
      lastError: message.slice(0, 2000),
      lockedAt: null,
      nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000),
    });
  }

  /**
   * A job can disappear between delivery and settlement (manual purge, test
   * teardown, another worker). Losing the final update is harmless: the work
   * was already delivered or permanently failed.
   */
  private async markSettled(id: string, data: Prisma.NotificationJobUpdateInput): Promise<void> {
    try {
      await this.prisma.notificationJob.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        this.logger.debug(`Notification ${id} disappeared before it could be settled`);
        return;
      }
      throw error;
    }
  }
}
