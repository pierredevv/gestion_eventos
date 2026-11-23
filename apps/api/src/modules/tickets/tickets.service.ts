import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessTokenScope, OrderStatus, Prisma, TicketStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service';
import type { AppEnv } from '../../common/config/env';
import { decryptToken, encryptToken } from '../../common/crypto/token-cipher';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INTERACTIVE_TRANSACTION_OPTIONS } from '../../common/prisma/transaction-options';
import { generateOpaqueToken, hashToken } from '../../common/security/tokens';
import type { TicketPortalView, TicketView } from './tickets.types';

const TICKET_INCLUDE = {
  attendee: true,
  ticketType: true,
  order: { include: { event: true } },
} satisfies Prisma.TicketInclude;

type TicketWithContext = Prisma.TicketGetPayload<{ include: typeof TICKET_INCLUDE }>;

const TOKEN_PREFIX = 'EVT1:';
const TICKET_CODE_ATTEMPTS = 5;

function ticketCode(): string {
  const random = randomBytes(5).toString('base64url').replace(/[^A-Za-z0-9]/g, 'A');
  return `TKT-${random.slice(0, 6).toUpperCase()}`.slice(0, 24);
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Issues one ticket per attendee of a confirmed order. Idempotent: the
   * partial unique index on active attendee tickets prevents duplicates even
   * if two notification workers process the same delivery job concurrently.
   */
  async issueForOrder(orderId: string): Promise<TicketView[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { attendees: true } } },
    });
    if (!order || order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException({
        code: 'ORDER_NOT_CONFIRMED',
        message: 'Tickets can only be issued for confirmed orders',
      });
    }

    const expected = order.items.reduce((sum, item) => sum + item.attendees.length, 0);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.ticket.findMany({
        where: { orderId },
        select: { attendeeId: true },
      });
      const alreadyIssued = new Set(existing.map((ticket) => ticket.attendeeId));

      for (const item of order.items) {
        for (const attendee of item.attendees) {
          if (alreadyIssued.has(attendee.id)) {
            continue;
          }
          const token = `${TOKEN_PREFIX}${generateOpaqueToken()}`;
          await this.createTicketRow(tx, {
            orderId,
            attendeeId: attendee.id,
            ticketTypeId: item.ticketTypeId,
            token,
          });
        }
      }
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    const tickets = await this.prisma.ticket.findMany({
      where: { orderId },
      include: TICKET_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    if (tickets.length !== expected) {
      throw new Error(`Ticket issuance incomplete for order ${orderId}`);
    }
    return tickets.map((ticket) => this.toView(ticket));
  }

  private async createTicketRow(
    tx: Prisma.TransactionClient,
    input: { orderId: string; attendeeId: string; ticketTypeId: string; token: string },
  ): Promise<void> {
    for (let attempt = 1; attempt <= TICKET_CODE_ATTEMPTS; attempt += 1) {
      try {
        await tx.ticket.create({
          data: {
            orderId: input.orderId,
            attendeeId: input.attendeeId,
            ticketTypeId: input.ticketTypeId,
            ticketCode: ticketCode(),
            tokenHash: hashToken(input.token),
            tokenCiphertext: encryptToken(input.token, this.encryptionKey()),
            status: TicketStatus.VALID,
          },
        });
        return;
      } catch (error) {
        const isCodeCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          JSON.stringify(error.meta ?? {}).includes('ticket_code');
        if (!isCodeCollision || attempt === TICKET_CODE_ATTEMPTS) {
          // An attendee collision means the ticket was already issued; that is
          // an expected outcome of a retried job, not an error.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return;
          }
          throw error;
        }
      }
    }
  }

  /** Creates a fresh TICKETS-scoped link token and revokes older ones. */
  async createDeliveryAccessToken(orderId: string): Promise<{ token: string; expiresAt: Date }> {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { event: true },
    });
    const ttlDays = this.config.get('TICKET_ACCESS_TTL_DAYS_AFTER_EVENT', { infer: true });
    const expiresAt = new Date(
      Math.max(order.event.endDate.getTime(), Date.now()) + ttlDays * 86_400_000,
    );
    const token = generateOpaqueToken();

    await this.prisma.$transaction(async (tx) => {
      await tx.orderAccessToken.updateMany({
        where: { orderId, scope: AccessTokenScope.TICKETS, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.orderAccessToken.create({
        data: {
          orderId,
          scope: AccessTokenScope.TICKETS,
          tokenHash: hashToken(token),
          expiresAt,
        },
      });
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    return { token, expiresAt };
  }

  async portal(token: string): Promise<TicketPortalView> {
    const access = await this.prisma.orderAccessToken.findFirst({
      where: {
        scope: AccessTokenScope.TICKETS,
        tokenHash: hashToken(token),
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { orderId: true },
    });
    if (!access) {
      throw new NotFoundException({ code: 'TICKET_LINK_INVALID', message: 'Ticket link is invalid or expired' });
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { orderId: access.orderId },
      include: TICKET_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    if (tickets.length === 0) {
      throw new NotFoundException({ code: 'TICKETS_NOT_READY', message: 'Tickets are not ready yet' });
    }

    const first = tickets[0];
    if (!first) {
      throw new NotFoundException({ code: 'TICKETS_NOT_READY', message: 'Tickets are not ready yet' });
    }
    const { order } = first;
    return {
      orderCode: order.orderCode,
      eventTitle: order.event.title,
      eventStartDate: order.event.startDate.toISOString(),
      eventLocation: order.event.location,
      tickets: tickets.map((ticket) => this.toView(ticket)),
    };
  }

  async findByCode(ticketCode: string): Promise<TicketView> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketCode },
      include: TICKET_INCLUDE,
    });
    if (!ticket) {
      throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
    }
    return this.toView(ticket);
  }

  async resendDelivery(orderCode: string, orderToken: string): Promise<{ queued: true }> {
    const order = await this.prisma.order.findUnique({
      where: { orderCode },
      include: { accessTokens: true },
    });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    const valid = order.accessTokens.some(
      (access) =>
        access.scope === AccessTokenScope.ORDER &&
        access.tokenHash === hashToken(orderToken) &&
        access.usedAt === null &&
        access.revokedAt === null &&
        access.expiresAt.getTime() > Date.now(),
    );
    if (!valid) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    await this.issueForOrder(order.id);
    await this.prisma.notificationJob.create({
      data: {
        type: 'TICKET_DELIVERY',
        recipient: order.buyerEmail,
        dedupeKey: `ticket-delivery-resend-${order.id}-${randomBytes(6).toString('hex')}`,
        payload: { orderId: order.id, orderCode: order.orderCode } as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      action: 'TICKET_DELIVERY_REQUESTED',
      entityType: 'order',
      entityId: order.id,
      actorLabel: order.buyerEmail,
    });
    return { queued: true };
  }

  private encryptionKey(): Buffer {
    const encoded = this.config.get('TOKEN_ENCRYPTION_KEY', { infer: true });
    if (!encoded) {
      throw new ServiceUnavailableException('TOKEN_ENCRYPTION_KEY is not configured');
    }
    return Buffer.from(encoded, 'base64');
  }

  private toView(ticket: TicketWithContext): TicketView {
    return {
      id: ticket.id,
      ticketCode: ticket.ticketCode,
      status: ticket.status,
      attendeeName: ticket.attendee.fullName,
      attendeeEmail: ticket.attendee.email,
      ticketTypeName: ticket.ticketType.name,
      eventId: ticket.order.eventId,
      eventTitle: ticket.order.event.title,
      eventStartDate: ticket.order.event.startDate.toISOString(),
      eventLocation: ticket.order.event.location,
      issuedAt: ticket.issuedAt.toISOString(),
      usedAt: ticket.usedAt?.toISOString() ?? null,
      qrPayload: decryptToken(ticket.tokenCiphertext, this.encryptionKey()),
    };
  }
}
