import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatus, ReservationStatus } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { releaseStock } from '../../common/inventory/inventory-sql';
import { PrismaService } from '../../common/prisma/prisma.service';

const BATCH_SIZE = 100;

/**
 * Releases inventory held by orders whose payment window expired.
 *
 * Runs in the same process as the API. For multi-instance deployments this
 * should be moved to a single scheduled worker; the SQL is idempotent, so a
 * duplicate run cannot double-release stock.
 */
@Injectable()
export class OrderExpirationService {
  private readonly logger = new Logger(OrderExpirationService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireAbandonedOrders(): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    let expired = 0;

    try {
      const orders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.PENDING_PAYMENT,
          expiresAt: { lte: new Date() },
        },
        take: BATCH_SIZE,
        select: { id: true, orderCode: true },
      });

      for (const order of orders) {
        try {
          await this.expireOne(order.id);
          expired += 1;
        } catch (error) {
          this.logger.error(
            `Could not expire order ${order.orderCode}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } finally {
      this.running = false;
    }

    if (expired > 0) {
      this.logger.log(`Expired ${expired} abandoned order(s)`);
    }
    return expired;
  }

  private async expireOne(orderId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Re-check the state inside the transaction so two runs cannot race.
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, expiresAt: true },
      });
      if (!order || order.status !== OrderStatus.PENDING_PAYMENT) {
        return;
      }
      if (!order.expiresAt || order.expiresAt.getTime() > Date.now()) {
        return;
      }

      const reservations = await tx.inventoryReservation.findMany({
        where: {
          orderId,
          status: { in: [ReservationStatus.ACTIVE, ReservationStatus.HELD_FOR_REVIEW] },
        },
      });

      for (const reservation of reservations) {
        const released = await releaseStock(tx, reservation.ticketTypeId, reservation.quantity);
        if (released !== 1) {
          throw new Error(`Inventory counter inconsistent for reservation ${reservation.id}`);
        }
      }

      if (reservations.length > 0) {
        await tx.inventoryReservation.updateMany({
          where: { id: { in: reservations.map((reservation) => reservation.id) } },
          data: { status: ReservationStatus.RELEASED, releasedAt: new Date() },
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.EXPIRED, expiredAt: new Date() },
      });
    });

    await this.audit.record({
      action: 'ORDER_EXPIRED',
      entityType: 'order',
      entityId: orderId,
    });
  }
}
