import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SalesReportQueryDto } from './dto/report-query.dto';
import type {
  AttendanceByTicketType,
  AttendanceReport,
  SalesByEvent,
  SalesByTicketType,
  SalesReport,
} from './reports.types';

interface Bucket {
  orders: number;
  ticketsSold: number;
  gross: Prisma.Decimal;
  discounts: Prisma.Decimal;
  net: Prisma.Decimal;
}

const zero = () => new Prisma.Decimal(0);

function newBucket(): Bucket {
  return { orders: 0, ticketsSold: 0, gross: zero(), discounts: zero(), net: zero() };
}

/**
 * Read-only aggregations for organisers.
 *
 * Every monetary value is summed with Prisma.Decimal — floats would silently
 * corrupt reconciliations (ADR 0008). Only confirmed orders count as revenue;
 * other statuses appear in the status breakdown so pending money stays visible.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(query: SalesReportQueryDto): Promise<SalesReport> {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && to && from >= to) {
      throw new BadRequestException({
        code: 'REPORT_INVALID_PERIOD',
        message: 'from must be earlier than to',
      });
    }

    const range: Prisma.DateTimeFilter | undefined =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
          }
        : undefined;

    // An order is "in" the period when it was confirmed, or when it was created
    // if it never got confirmed. This counts each order exactly once.
    const where: Prisma.OrderWhereInput = {
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(range
        ? {
            OR: [
              { confirmedAt: range },
              { confirmedAt: null, createdAt: range },
            ],
          }
        : {}),
    };

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        items: true,
        event: { select: { id: true, title: true, startDate: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totals = newBucket();
    const statusCounts = new Map<OrderStatus, number>(Object.values(OrderStatus).map((s) => [s, 0]));
    const events = new Map<string, { title: string; startDate: string; bucket: Bucket }>();
    const ticketTypes = new Map<string, SalesByTicketType & { gross: Prisma.Decimal }>();

    for (const order of orders) {
      statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
      if (order.status !== OrderStatus.CONFIRMED) {
        continue;
      }

      this.addOrder(totals, order.subtotal, order.discountAmount, order.totalAmount);

      let eventEntry = events.get(order.eventId);
      if (!eventEntry) {
        eventEntry = {
          title: order.event.title,
          startDate: order.event.startDate.toISOString(),
          bucket: newBucket(),
        };
        events.set(order.eventId, eventEntry);
      }
      this.addOrder(eventEntry.bucket, order.subtotal, order.discountAmount, order.totalAmount);

      for (const item of order.items) {
        totals.ticketsSold += item.quantity;
        eventEntry.bucket.ticketsSold += item.quantity;
        const key = `${order.eventId}:${item.ticketTypeId}`;
        let typeEntry = ticketTypes.get(key);
        if (!typeEntry) {
          typeEntry = {
            eventId: order.eventId,
            eventTitle: order.event.title,
            ticketTypeId: item.ticketTypeId,
            ticketTypeName: item.ticketTypeName,
            ticketsSold: 0,
            grossRevenue: '0.00',
            gross: zero(),
          };
          ticketTypes.set(key, typeEntry);
        }
        typeEntry.ticketsSold += item.quantity;
        typeEntry.gross = typeEntry.gross.plus(item.subtotal);
      }
    }

    const byEvent: SalesByEvent[] = [...events].map(([eventId, entry]) => ({
      eventId,
      eventTitle: entry.title,
      eventStartDate: entry.startDate,
      orders: entry.bucket.orders,
      ticketsSold: entry.bucket.ticketsSold,
      grossRevenue: entry.bucket.gross.toFixed(2),
      discounts: entry.bucket.discounts.toFixed(2),
      netRevenue: entry.bucket.net.toFixed(2),
    }));

    return {
      generatedAt: new Date().toISOString(),
      currency: orders[0]?.currency ?? 'BOB',
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      totals: {
        orders: totals.orders,
        ticketsSold: totals.ticketsSold,
        grossRevenue: totals.gross.toFixed(2),
        discounts: totals.discounts.toFixed(2),
        netRevenue: totals.net.toFixed(2),
        averageOrderValue: totals.orders
          ? totals.net.div(totals.orders).toFixed(2)
          : '0.00',
      },
      byStatus: [...statusCounts].map(([status, count]) => ({ status, orders: count })),
      byEvent,
      byTicketType: [...ticketTypes.values()]
        .map(({ gross, ...entry }) => ({ ...entry, grossRevenue: gross.toFixed(2) }))
        .sort((a, b) => a.eventTitle.localeCompare(b.eventTitle)),
    };
  }

  /** CSV with a UTF-8 BOM so spreadsheet software opens accented names correctly. */
  async salesCsv(query: SalesReportQueryDto): Promise<string> {
    const report = await this.sales(query);
    const rows = [
      ['evento', 'tipo_entrada', 'entradas_vendidas', 'ingreso_bruto'],
      ...report.byTicketType.map((entry) => [
        entry.eventTitle,
        entry.ticketTypeName,
        String(entry.ticketsSold),
        entry.grossRevenue,
      ]),
      ['TOTAL', '', String(report.totals.ticketsSold), report.totals.grossRevenue],
    ];
    return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  }

  async attendance(eventId: string): Promise<AttendanceReport> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, startDate: true, capacity: true },
    });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found' });
    }

    const tickets = await this.prisma.ticket.findMany({
      where: { order: { eventId } },
      include: {
        ticketType: { select: { id: true, name: true } },
        checkIn: { select: { checkedAt: true } },
      },
    });

    const sold = tickets.filter((ticket) => ticket.status !== TicketStatus.CANCELLED);
    const checkedIn = sold.filter(
      (ticket) => ticket.checkIn !== null || ticket.status === TicketStatus.USED,
    );
    const byType = new Map<string, AttendanceByTicketType>();
    for (const ticket of sold) {
      const key = ticket.ticketTypeId;
      let entry = byType.get(key);
      if (!entry) {
        entry = {
          ticketTypeId: key,
          ticketTypeName: ticket.ticketType.name,
          sold: 0,
          checkedIn: 0,
          noShows: 0,
        };
        byType.set(key, entry);
      }
      entry.sold += 1;
      if (ticket.checkIn !== null || ticket.status === TicketStatus.USED) {
        entry.checkedIn += 1;
      }
    }
    for (const entry of byType.values()) {
      entry.noShows = entry.sold - entry.checkedIn;
    }

    return {
      eventId: event.id,
      eventTitle: event.title,
      eventStartDate: event.startDate.toISOString(),
      capacity: event.capacity,
      ticketsIssued: tickets.length,
      ticketsSold: sold.length,
      checkedIn: checkedIn.length,
      noShows: sold.length - checkedIn.length,
      attendanceRate: sold.length
        ? ((checkedIn.length / sold.length) * 100).toFixed(1)
        : '0.0',
      byTicketType: [...byType.values()].sort((a, b) =>
        a.ticketTypeName.localeCompare(b.ticketTypeName),
      ),
    };
  }

  private addOrder(
    bucket: Bucket,
    subtotal: Prisma.Decimal,
    discount: Prisma.Decimal,
    total: Prisma.Decimal,
  ): void {
    bucket.orders += 1;
    bucket.gross = bucket.gross.plus(subtotal);
    bucket.discounts = bucket.discounts.plus(discount);
    bucket.net = bucket.net.plus(total);
  }
}

/** Quotes a CSV cell and neutralises spreadsheet formula injection. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
