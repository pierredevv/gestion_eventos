import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventStatus, Prisma, TicketStatus } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import type { AppEnv } from '../../common/config/env';
import type { RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INTERACTIVE_TRANSACTION_OPTIONS } from '../../common/prisma/transaction-options';
import { hashToken } from '../../common/security/tokens';
import type { CheckInDto } from './dto/check-in.dto';
import type { CheckInPreview, CheckInRecord, CheckInResult } from './check-in.types';

const TICKET_INCLUDE = {
  attendee: true,
  ticketType: true,
  order: { include: { event: true } },
  checkIn: true,
} satisfies Prisma.TicketInclude;

type TicketWithContext = Prisma.TicketGetPayload<{ include: typeof TICKET_INCLUDE }>;

@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async preview(dto: CheckInDto): Promise<CheckInPreview> {
    const ticket = await this.findTicket(dto);
    return this.toPreview(ticket);
  }

  async checkIn(
    dto: CheckInDto,
    staffId: string,
    context: RequestContext,
  ): Promise<CheckInResult> {
    const ticket = await this.findTicket(dto);
    const event = ticket.order.event;

    if (event.status === EventStatus.CANCELLED) {
      throw new ConflictException({ code: 'EVENT_CANCELLED', message: 'The event was cancelled' });
    }
    if (event.status !== EventStatus.PUBLISHED) {
      throw new ConflictException({ code: 'EVENT_NOT_ACTIVE', message: 'The event is not open for check-in' });
    }

    const withinWindow = this.isWithinWindow(event.startDate, event.endDate);
    const overridden = dto.override === true;
    if (!withinWindow && !overridden) {
      throw new ConflictException({
        code: 'OUTSIDE_CHECKIN_WINDOW',
        message: 'Check-in is only allowed around the event time',
      });
    }
    if (overridden && !dto.overrideReason) {
      throw new BadRequestException({
        code: 'OVERRIDE_REASON_REQUIRED',
        message: 'An override reason is required outside the check-in window',
      });
    }

    const now = new Date();
    const checkInId = await this.prisma.$transaction(async (tx) => {
      // Lock the ticket row so two scanners cannot both pass the VALID check.
      const locked = await tx.$queryRaw<Array<{ id: string; status: TicketStatus }>>`
        SELECT id, status FROM tickets WHERE id = ${ticket.id}::uuid FOR UPDATE
      `;
      const current = locked[0];
      if (!current) {
        throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
      }
      if (current.status === TicketStatus.USED) {
        throw new ConflictException({ code: 'TICKET_ALREADY_USED', message: 'This ticket was already used' });
      }
      if (current.status === TicketStatus.CANCELLED) {
        throw new ConflictException({ code: 'TICKET_CANCELLED', message: 'This ticket was cancelled' });
      }

      const existing = await tx.checkIn.findUnique({ where: { ticketId: ticket.id } });
      if (existing) {
        throw new ConflictException({ code: 'TICKET_ALREADY_USED', message: 'This ticket was already used' });
      }

      const record = await tx.checkIn.create({
        data: {
          ticketId: ticket.id,
          checkedById: staffId,
          checkedAt: now,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent?.slice(0, 255) ?? null,
        },
      });
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.USED, usedAt: now },
      });
      return record.id;
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    await this.audit.record({
      action: overridden ? 'CHECK_IN_OVERRIDE' : 'CHECK_IN',
      entityType: 'ticket',
      entityId: ticket.id,
      userId: staffId,
      ...context,
      metadata: {
        ticketCode: ticket.ticketCode,
        eventId: event.id,
        ...(overridden ? { reason: dto.overrideReason } : {}),
      },
    });

    return {
      checkInId,
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      attendeeName: ticket.attendee.fullName,
      ticketTypeName: ticket.ticketType.name,
      eventTitle: event.title,
      checkedAt: now.toISOString(),
      overridden,
    };
  }

  async listByEvent(eventId: string): Promise<CheckInRecord[]> {
    const records = await this.prisma.checkIn.findMany({
      where: { ticket: { order: { eventId } } },
      include: { ticket: { include: { attendee: true, ticketType: true } } },
      orderBy: { checkedAt: 'desc' },
    });
    return records.map((record) => ({
      id: record.id,
      ticketCode: record.ticket.ticketCode,
      attendeeName: record.ticket.attendee.fullName,
      ticketTypeName: record.ticket.ticketType.name,
      checkedById: record.checkedById,
      checkedAt: record.checkedAt.toISOString(),
    }));
  }

  private async findTicket(dto: CheckInDto): Promise<TicketWithContext> {
    if (dto.token) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { tokenHash: hashToken(dto.token) },
        include: TICKET_INCLUDE,
      });
      if (!ticket) {
        throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
      }
      return ticket;
    }
    if (dto.ticketCode) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { ticketCode: dto.ticketCode },
        include: TICKET_INCLUDE,
      });
      if (!ticket) {
        throw new NotFoundException({ code: 'TICKET_NOT_FOUND', message: 'Ticket not found' });
      }
      return ticket;
    }
    throw new BadRequestException({ code: 'TICKET_IDENTIFIER_REQUIRED', message: 'Provide a token or ticket code' });
  }

  private isWithinWindow(startDate: Date, endDate: Date): boolean {
    const before = this.config.get('CHECKIN_WINDOW_BEFORE_HOURS', { infer: true });
    const after = this.config.get('CHECKIN_WINDOW_AFTER_HOURS', { infer: true });
    const now = Date.now();
    return (
      now >= startDate.getTime() - before * 3_600_000 &&
      now <= endDate.getTime() + after * 3_600_000
    );
  }

  private toPreview(ticket: TicketWithContext): CheckInPreview {
    const event = ticket.order.event;
    return {
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      status: ticket.status,
      attendeeName: ticket.attendee.fullName,
      ticketTypeName: ticket.ticketType.name,
      eventId: event.id,
      eventTitle: event.title,
      eventStartDate: event.startDate.toISOString(),
      eventEndDate: event.endDate.toISOString(),
      orderCode: ticket.order.orderCode,
      alreadyUsedAt: ticket.usedAt?.toISOString() ?? null,
      withinWindow: this.isWithinWindow(event.startDate, event.endDate),
    };
  }
}
