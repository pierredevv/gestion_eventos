import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessTokenScope,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import type { AppEnv } from '../../common/config/env';
import { EmailService } from '../../common/email/email.service';
import type { RequestContext } from '../../common/http/request-context';
import { releaseStock, reserveStock } from '../../common/inventory/inventory-sql';
import { PrismaService } from '../../common/prisma/prisma.service';
import { generateOpaqueToken, hashToken } from '../../common/security/tokens';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { CreatedOrderResult, OrderView } from './orders.types';

const ORDER_INCLUDE = {
  items: {
    include: { attendees: true },
    orderBy: { id: 'asc' },
  },
  payment: true,
} satisfies Prisma.OrderInclude;

type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** Money is always serialized with exactly two decimals for clients. */
function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function orderCode(): string {
  const date = new Date();
  const stamp = [
    String(date.getUTCFullYear()).slice(2),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');
  const random = generateOpaqueToken(5).replace(/[^A-Za-z0-9]/g, 'A').slice(0, 6).toUpperCase();
  return `ORD-${stamp}-${random}`.slice(0, 20);
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /**
   * Creates an order and reserves inventory atomically. Prices always come from
   * the database; the client cannot influence the total.
   */
  async create(
    dto: CreateOrderDto,
    buyerId: string | null,
    context: RequestContext,
  ): Promise<CreatedOrderResult> {
    const idempotencyKey = dto.idempotencyKey;
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey },
        include: ORDER_INCLUDE,
      });
      if (existing) {
        return {
          order: this.toView(existing),
          // A replay must not reveal a previously issued access token.
          accessToken: '',
          accessTokenExpiresAt: '',
        };
      }
    }

    const event = await this.prisma.event.findUnique({ where: { id: dto.eventId } });
    if (!event || event.status !== 'PUBLISHED') {
      throw new NotFoundException({ code: 'EVENT_NOT_AVAILABLE', message: 'Event is not available' });
    }

    const ticketTypeIds = [...new Set(dto.items.map((item) => item.ticketTypeId))];
    const ticketTypes = await this.prisma.ticketType.findMany({
      where: { id: { in: ticketTypeIds }, eventId: dto.eventId },
    });

    for (const item of dto.items) {
      const ticketType = ticketTypes.find((type) => type.id === item.ticketTypeId);
      if (!ticketType) {
        throw new NotFoundException({
          code: 'TICKET_TYPE_NOT_FOUND',
          message: 'Ticket type not found in this event',
        });
      }
      if (!ticketType.isActive || item.quantity < ticketType.minPerOrder || item.quantity > ticketType.maxPerOrder) {
        throw new BadRequestException({
          code: 'INVALID_QUANTITY',
          message: `Quantity must be between ${ticketType.minPerOrder} and ${ticketType.maxPerOrder} for ${ticketType.name}`,
        });
      }
      if (item.attendees.length !== item.quantity) {
        throw new BadRequestException({
          code: 'ATTENDEE_COUNT_MISMATCH',
          message: 'Each ticket needs exactly one attendee',
        });
      }
    }

    const ttlMinutes = this.config.get('RESERVATION_TTL_MINUTES', { infer: true });
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const accessToken = generateOpaqueToken();
    const accessTtlHours = this.config.get('ORDER_ACCESS_LINK_TTL_HOURS', { infer: true });
    const accessTokenExpiresAt = new Date(Date.now() + accessTtlHours * 3_600_000);

    let created: OrderWithDetails;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // Reserve every item first. If any UPDATE fails, throwing rolls back
        // all earlier reservations in this transaction.
        for (const item of dto.items) {
          const reserved = await reserveStock(tx, item.ticketTypeId, item.quantity);
          if (reserved !== 1) {
            throw new ConflictException({
              code: 'INSUFFICIENT_STOCK',
              message: 'One or more ticket types no longer have enough stock',
            });
          }
        }

        let subtotal = new Prisma.Decimal(0);
        for (const item of dto.items) {
          const ticketType = ticketTypes.find((type) => type.id === item.ticketTypeId);
          if (!ticketType) throw new Error('Ticket type vanished during reservation');
          subtotal = subtotal.plus(ticketType.price.mul(item.quantity));
        }

        const order = await tx.order.create({
          data: {
            buyerId,
            eventId: dto.eventId,
            orderCode: orderCode(),
            buyerName: dto.buyerName,
            buyerEmail: dto.buyerEmail,
            buyerPhone: dto.buyerPhone,
            subtotal,
            discountAmount: new Prisma.Decimal(0),
            totalAmount: subtotal,
            currency: event.currency,
            status: OrderStatus.PENDING_PAYMENT,
            idempotencyKey,
            expiresAt,
            items: {
              create: dto.items.map((item) => {
                const ticketType = ticketTypes.find((type) => type.id === item.ticketTypeId);
                if (!ticketType) throw new Error('Ticket type vanished during reservation');
                return {
                  ticketTypeId: item.ticketTypeId,
                  ticketTypeName: ticketType.name,
                  quantity: item.quantity,
                  unitPrice: ticketType.price,
                  subtotal: ticketType.price.mul(item.quantity),
                  attendees: {
                    create: item.attendees.map((attendee, index) => ({
                      unitIndex: index + 1,
                      fullName: attendee.fullName,
                      email: attendee.email,
                      phone: attendee.phone ?? null,
                      documentNumber: attendee.documentNumber ?? null,
                    })),
                  },
                };
              }),
            },
            reservations: {
              create: dto.items.map((item) => ({
                ticketTypeId: item.ticketTypeId,
                quantity: item.quantity,
                status: ReservationStatus.ACTIVE,
                expiresAt,
              })),
            },
            payment: {
              create: {
                amount: subtotal,
                currency: event.currency,
                status: PaymentStatus.PENDING,
              },
            },
            accessTokens: {
              create: {
                scope: AccessTokenScope.ORDER,
                tokenHash: hashToken(accessToken),
                expiresAt: accessTokenExpiresAt,
                createdByIp: context.ipAddress,
              },
            },
          },
          include: ORDER_INCLUDE,
        });

        return order;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'ORDER_ALREADY_EXISTS',
          message: 'An order with this idempotency key already exists',
        });
      }
      throw error;
    }

    await this.audit.record({
      action: 'ORDER_CREATED',
      entityType: 'order',
      entityId: created.id,
      userId: buyerId ?? undefined,
      actorLabel: created.buyerEmail,
      ...context,
      metadata: { orderCode: created.orderCode, total: money(created.totalAmount) },
    });

    // The notification worker (F7) delivers the link; enqueue it here so the
    // order is never lost if the worker is down.
    await this.prisma.notificationJob.create({
      data: {
        type: 'ORDER_CREATED',
        recipient: created.buyerEmail,
        dedupeKey: `order-created-${created.id}`,
        payload: {
          orderCode: created.orderCode,
          eventTitle: event.title,
          expiresAt: expiresAt.toISOString(),
          accessToken,
        } as Prisma.InputJsonValue,
      },
    });

    // Best effort: never fail an order because of the email provider.
    try {
      await this.email.send({
        to: created.buyerEmail,
        subject: 'Tu pedido ha sido creado',
        text: `Pedido ${created.orderCode}. Completa el pago antes de ${expiresAt.toISOString()}.`,
      });
    } catch {
      // The notification job above is the durable delivery path.
    }

    return {
      order: this.toView(created),
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    };
  }

  /** Access is granted to the authenticated buyer or to a valid order token. */
  async findByCode(
    orderCode: string,
    options: { userId?: string | null; accessToken?: string },
  ): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { orderCode },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    const isBuyer = Boolean(options.userId && order.buyerId === options.userId);
    const isTokenValid = options.accessToken
      ? await this.prisma.orderAccessToken.findFirst({
          where: {
            orderId: order.id,
            scope: AccessTokenScope.ORDER,
            tokenHash: hashToken(options.accessToken),
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        }).then((token) => Boolean(token))
      : false;

    // Every order needs either a matching buyer session or the secret link.
    // Returning 404 (not 403) avoids confirming that an order code exists.
    if (!isBuyer && !isTokenValid) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    return this.toView(order);
  }

  /** Lists orders for an event (staff use). */
  async listByEvent(eventId: string, status?: OrderStatus): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      where: { eventId, ...(status ? { status } : {}) },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => this.toView(order));
  }

  async cancel(
    orderCode: string,
    userId: string | null,
    accessToken: string | undefined,
    context: RequestContext,
  ): Promise<OrderView> {
    const current = await this.findByCode(orderCode, { userId, accessToken });
    if (current.status !== OrderStatus.PENDING_PAYMENT && current.status !== OrderStatus.PENDING_REVIEW) {
      throw new BadRequestException({
        code: 'ORDER_INVALID_STATE',
        message: 'This order can no longer be cancelled',
      });
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const reservations = await tx.inventoryReservation.findMany({
        where: { orderId: current.id, status: { in: [ReservationStatus.ACTIVE, ReservationStatus.HELD_FOR_REVIEW] } },
      });
      for (const reservation of reservations) {
        const released = await releaseStock(tx, reservation.ticketTypeId, reservation.quantity);
        if (released !== 1) {
          throw new Error(`Inventory counter inconsistent for reservation ${reservation.id}`);
        }
      }
      await tx.inventoryReservation.updateMany({
        where: { id: { in: reservations.map((reservation) => reservation.id) } },
        data: { status: ReservationStatus.RELEASED, releasedAt: new Date() },
      });
      return tx.order.update({
        where: { id: current.id },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
        include: ORDER_INCLUDE,
      });
    });

    await this.audit.record({
      action: 'ORDER_CANCELLED',
      entityType: 'order',
      entityId: order.id,
      userId: userId ?? undefined,
      ...context,
    });

    return this.toView(order);
  }

  private toView(order: OrderWithDetails): OrderView {
    return {
      id: order.id,
      orderCode: order.orderCode,
      eventId: order.eventId,
      status: order.status,
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      buyerPhone: order.buyerPhone,
      subtotal: money(order.subtotal),
      discountAmount: money(order.discountAmount),
      totalAmount: money(order.totalAmount),
      currency: order.currency,
      paymentAttempts: order.paymentAttempts,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      rejectionReason: order.rejectionReason,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        ticketTypeId: item.ticketTypeId,
        ticketTypeName: item.ticketTypeName,
        quantity: item.quantity,
        unitPrice: money(item.unitPrice),
        subtotal: money(item.subtotal),
        attendees: item.attendees.map((attendee) => ({
          id: attendee.id,
          fullName: attendee.fullName,
          email: attendee.email,
          phone: attendee.phone,
          documentNumber: attendee.documentNumber,
        })),
      })),
      payment: order.payment
        ? { id: order.payment.id, status: order.payment.status, amount: money(order.payment.amount) }
        : null,
    };
  }
}
