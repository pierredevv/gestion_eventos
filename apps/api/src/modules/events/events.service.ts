import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventStatus, Prisma, type Event, type TicketType } from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import type { AppEnv } from '../../common/config/env';
import type { RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { slugify } from '../../common/utils/slug';
import type { CreateEventDto } from './dto/create-event.dto';
import type { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import type { ListEventsDto } from './dto/list-events.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import type { EventView, PaginatedEvents, TicketTypeView } from './events.types';

type EventWithTicketTypes = Event & { ticketTypes: TicketType[] };

const EVENT_INCLUDE = { ticketTypes: true } satisfies Prisma.EventInclude;
const MAX_SLUG_SUFFIX = 100;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async listPublic(query: ListEventsDto): Promise<PaginatedEvents> {
    return this.list({ ...query, status: EventStatus.PUBLISHED });
  }

  async listAdmin(query: ListEventsDto): Promise<PaginatedEvents> {
    return this.list(query);
  }

  private async list(query: ListEventsDto): Promise<PaginatedEvents> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.EventWhereInput = {
      ...(query.status ? { status: query.status } : {}),
    };

    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        include: EVENT_INCLUDE,
        orderBy: { startDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      items: events.map((event) => this.toView(event)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPublicBySlug(slug: string): Promise<EventView> {
    const event = await this.prisma.event.findUnique({
      where: { slug },
      include: EVENT_INCLUDE,
    });
    if (!event || event.status !== EventStatus.PUBLISHED) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found' });
    }
    return this.toView(event);
  }

  async findAdminById(id: string): Promise<EventView> {
    const event = await this.prisma.event.findUnique({ where: { id }, include: EVENT_INCLUDE });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found' });
    }
    return this.toView(event);
  }

  async create(dto: CreateEventDto, userId: string, context: RequestContext): Promise<EventView> {
    this.assertEventDates(dto);

    const slug = await this.uniqueSlug(dto.slug ?? slugify(dto.title));
    const publishNow = dto.publishNow === true;

    const event = await this.prisma.event.create({
      data: {
        createdById: userId,
        slug,
        title: dto.title,
        description: dto.description,
        location: dto.location ?? null,
        address: dto.address ?? null,
        timezone: dto.timezone ?? this.config.get('EVENT_TIMEZONE', { infer: true }),
        currency: dto.currency ?? this.config.get('DEFAULT_CURRENCY', { infer: true }),
        capacity: dto.capacity ?? null,
        requireAttendeeDetails: dto.requireAttendeeDetails ?? true,
        personalPurchase: dto.personalPurchase ?? false,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        registrationStart: new Date(dto.registrationStart),
        registrationEnd: new Date(dto.registrationEnd),
        status: publishNow ? EventStatus.PUBLISHED : EventStatus.DRAFT,
        publishedAt: publishNow ? new Date() : null,
      },
      include: EVENT_INCLUDE,
    });

    await this.audit.record({
      action: publishNow ? 'EVENT_CREATED_PUBLISHED' : 'EVENT_CREATED',
      entityType: 'event',
      entityId: event.id,
      userId,
      ...context,
      metadata: { slug, title: event.title },
    });

    return this.toView(event);
  }

  async update(
    id: string,
    dto: UpdateEventDto,
    userId: string,
    context: RequestContext,
  ): Promise<EventView> {
    const existing = await this.findEventOrThrow(id);

    const dates = {
      startDate: dto.startDate ?? existing.startDate.toISOString(),
      endDate: dto.endDate ?? existing.endDate.toISOString(),
      registrationStart: dto.registrationStart ?? existing.registrationStart.toISOString(),
      registrationEnd: dto.registrationEnd ?? existing.registrationEnd.toISOString(),
    };
    this.assertEventDates(dates);

    let slug = existing.slug;
    if (dto.slug && dto.slug !== slug) {
      slug = await this.uniqueSlug(dto.slug);
    }

    const capacity = dto.capacity === undefined ? existing.capacity : dto.capacity;
    if (capacity !== null) {
      const used = await this.prisma.ticketType.aggregate({
        where: { eventId: id },
        _sum: { capacity: true },
      });
      if ((used._sum.capacity ?? 0) > capacity) {
        throw new BadRequestException({
          code: 'EVENT_CAPACITY_BELOW_TICKET_TYPES',
          message: 'Event capacity cannot be lower than the sum of ticket type capacities',
        });
      }
    }

    const event = await this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.slug !== undefined ? { slug } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.capacity !== undefined ? { capacity } : {}),
        ...(dto.requireAttendeeDetails !== undefined
          ? { requireAttendeeDetails: dto.requireAttendeeDetails }
          : {}),
        ...(dto.personalPurchase !== undefined ? { personalPurchase: dto.personalPurchase } : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.registrationStart !== undefined
          ? { registrationStart: new Date(dto.registrationStart) }
          : {}),
        ...(dto.registrationEnd !== undefined
          ? { registrationEnd: new Date(dto.registrationEnd) }
          : {}),
      },
      include: EVENT_INCLUDE,
    });

    await this.audit.record({
      action: 'EVENT_UPDATED',
      entityType: 'event',
      entityId: id,
      userId,
      ...context,
      metadata: { fields: Object.keys(dto) },
    });

    return this.toView(event);
  }

  async publish(id: string, userId: string, context: RequestContext): Promise<EventView> {
    const event = await this.findEventOrThrow(id);
    if (event.status !== EventStatus.DRAFT && event.status !== EventStatus.CANCELLED) {
      throw this.invalidState(event.status, 'publish');
    }

    const activeTypes = await this.prisma.ticketType.count({
      where: { eventId: id, isActive: true, capacity: { gt: 0 } },
    });
    if (activeTypes === 0) {
      throw new BadRequestException({
        code: 'EVENT_NO_TICKET_TYPES',
        message: 'Create at least one active ticket type before publishing',
      });
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.PUBLISHED,
        publishedAt: event.publishedAt ?? new Date(),
      },
      include: EVENT_INCLUDE,
    });

    await this.audit.record({
      action: 'EVENT_PUBLISHED',
      entityType: 'event',
      entityId: id,
      userId,
      ...context,
    });

    return this.toView(updated);
  }

  async cancel(id: string, userId: string, context: RequestContext): Promise<EventView> {
    const event = await this.findEventOrThrow(id);
    if (event.status === EventStatus.CANCELLED || event.status === EventStatus.COMPLETED) {
      throw this.invalidState(event.status, 'cancel');
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED },
      include: EVENT_INCLUDE,
    });

    await this.audit.record({
      action: 'EVENT_CANCELLED',
      entityType: 'event',
      entityId: id,
      userId,
      ...context,
    });

    return this.toView(updated);
  }

  async complete(id: string, userId: string, context: RequestContext): Promise<EventView> {
    const event = await this.findEventOrThrow(id);
    if (event.status !== EventStatus.PUBLISHED) {
      throw this.invalidState(event.status, 'complete');
    }

    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.COMPLETED },
      include: EVENT_INCLUDE,
    });

    await this.audit.record({
      action: 'EVENT_COMPLETED',
      entityType: 'event',
      entityId: id,
      userId,
      ...context,
    });

    return this.toView(updated);
  }

  async createTicketType(
    eventId: string,
    dto: CreateTicketTypeDto,
    userId: string,
    context: RequestContext,
  ): Promise<TicketTypeView> {
    const event = await this.findEventOrThrow(eventId);
    const minPerOrder = dto.minPerOrder ?? 1;
    const maxPerOrder = dto.maxPerOrder ?? 10;
    if (maxPerOrder < minPerOrder) {
      throw new BadRequestException({
        code: 'TICKET_TYPE_INVALID_ORDER_LIMITS',
        message: 'maxPerOrder must be greater than or equal to minPerOrder',
      });
    }

    this.assertSalesWindow(event, dto.salesStart, dto.salesEnd);
    await this.assertCapacityAvailable(eventId, event.capacity, dto.capacity);

    const ticketType = await this.prisma.ticketType.create({
      data: {
        eventId,
        name: dto.name,
        description: dto.description ?? null,
        price: new Prisma.Decimal(dto.price),
        currency: dto.currency ?? event.currency,
        capacity: dto.capacity,
        minPerOrder,
        maxPerOrder,
        salesStart: dto.salesStart,
        salesEnd: dto.salesEnd,
        isActive: dto.isActive ?? true,
      },
    });

    await this.audit.record({
      action: 'TICKET_TYPE_CREATED',
      entityType: 'ticket_type',
      entityId: ticketType.id,
      userId,
      ...context,
      metadata: { eventId, name: ticketType.name, capacity: ticketType.capacity },
    });

    return this.toTicketTypeView(ticketType);
  }

  async updateTicketType(
    eventId: string,
    ticketTypeId: string,
    dto: UpdateTicketTypeDto,
    userId: string,
    context: RequestContext,
  ): Promise<TicketTypeView> {
    const event = await this.findEventOrThrow(eventId);
    const existing = await this.findTicketTypeOrThrow(eventId, ticketTypeId);

    const minPerOrder = dto.minPerOrder ?? existing.minPerOrder;
    const maxPerOrder = dto.maxPerOrder ?? existing.maxPerOrder;
    if (maxPerOrder < minPerOrder) {
      throw new BadRequestException({
        code: 'TICKET_TYPE_INVALID_ORDER_LIMITS',
        message: 'maxPerOrder must be greater than or equal to minPerOrder',
      });
    }

    if (dto.capacity !== undefined) {
      const soldOrReserved = existing.soldQuantity + existing.reservedQuantity;
      if (dto.capacity < soldOrReserved) {
        throw new BadRequestException({
          code: 'TICKET_TYPE_CAPACITY_BELOW_SOLD',
          message: 'Capacity cannot be lower than the number of sold and reserved tickets',
        });
      }
      await this.assertCapacityAvailable(eventId, event.capacity, dto.capacity, ticketTypeId);
    }

    const salesStart = dto.salesStart ?? existing.salesStart;
    const salesEnd = dto.salesEnd ?? existing.salesEnd;
    this.assertSalesWindow(event, salesStart, salesEnd);

    const ticketType = await this.prisma.ticketType.update({
      where: { id: ticketTypeId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.minPerOrder !== undefined ? { minPerOrder } : {}),
        ...(dto.maxPerOrder !== undefined ? { maxPerOrder } : {}),
        ...(dto.salesStart !== undefined ? { salesStart } : {}),
        ...(dto.salesEnd !== undefined ? { salesEnd } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.audit.record({
      action: 'TICKET_TYPE_UPDATED',
      entityType: 'ticket_type',
      entityId: ticketTypeId,
      userId,
      ...context,
      metadata: { eventId, fields: Object.keys(dto) },
    });

    return this.toTicketTypeView(ticketType);
  }

  async deactivateTicketType(
    eventId: string,
    ticketTypeId: string,
    userId: string,
    context: RequestContext,
  ): Promise<TicketTypeView> {
    await this.findEventOrThrow(eventId);
    const existing = await this.findTicketTypeOrThrow(eventId, ticketTypeId);

    const ticketType = await this.prisma.ticketType.update({
      where: { id: ticketTypeId },
      data: { isActive: false },
    });

    await this.audit.record({
      action: 'TICKET_TYPE_DEACTIVATED',
      entityType: 'ticket_type',
      entityId: ticketTypeId,
      userId,
      ...context,
      metadata: { eventId, previousName: existing.name },
    });

    return this.toTicketTypeView(ticketType);
  }

  private async findEventOrThrow(id: string): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found' });
    }
    return event;
  }

  private async findTicketTypeOrThrow(eventId: string, ticketTypeId: string): Promise<TicketType> {
    const ticketType = await this.prisma.ticketType.findFirst({
      where: { id: ticketTypeId, eventId },
    });
    if (!ticketType) {
      throw new NotFoundException({
        code: 'TICKET_TYPE_NOT_FOUND',
        message: 'Ticket type not found in this event',
      });
    }
    return ticketType;
  }

  private assertEventDates(dates: {
    startDate: string | Date;
    endDate: string | Date;
    registrationStart: string | Date;
    registrationEnd: string | Date;
  }): void {
    const start = new Date(dates.startDate).getTime();
    const end = new Date(dates.endDate).getTime();
    const regStart = new Date(dates.registrationStart).getTime();
    const regEnd = new Date(dates.registrationEnd).getTime();

    if (![start, end, regStart, regEnd].every(Number.isFinite)) {
      throw new BadRequestException({ code: 'EVENT_INVALID_DATES', message: 'Invalid date value' });
    }
    if (start >= end) {
      throw new BadRequestException({
        code: 'EVENT_INVALID_DATES',
        message: 'endDate must be after startDate',
      });
    }
    if (regStart >= regEnd) {
      throw new BadRequestException({
        code: 'EVENT_INVALID_DATES',
        message: 'registrationEnd must be after registrationStart',
      });
    }
    if (regEnd > start) {
      throw new BadRequestException({
        code: 'EVENT_INVALID_DATES',
        message: 'registration must end before the event starts',
      });
    }
  }

  private assertSalesWindow(event: Event, salesStart: Date, salesEnd: Date): void {
    if (!(salesStart < salesEnd)) {
      throw new BadRequestException({
        code: 'TICKET_TYPE_INVALID_SALES_WINDOW',
        message: 'salesEnd must be after salesStart',
      });
    }
    if (salesStart < event.registrationStart || salesEnd > event.registrationEnd) {
      throw new BadRequestException({
        code: 'TICKET_TYPE_SALES_WINDOW_OUTSIDE_REGISTRATION',
        message: 'Ticket sales must happen within the event registration window',
      });
    }
  }

  private async assertCapacityAvailable(
    eventId: string,
    eventCapacity: number | null,
    newCapacity: number,
    excludeTicketTypeId?: string,
  ): Promise<void> {
    if (eventCapacity === null) {
      return;
    }
    const used = await this.prisma.ticketType.aggregate({
      where: {
        eventId,
        ...(excludeTicketTypeId ? { id: { not: excludeTicketTypeId } } : {}),
      },
      _sum: { capacity: true },
    });
    if ((used._sum.capacity ?? 0) + newCapacity > eventCapacity) {
      throw new BadRequestException({
        code: 'TICKET_TYPE_CAPACITY_EXCEEDED',
        message: 'Ticket type capacities exceed the event capacity',
      });
    }
  }

  private async uniqueSlug(base: string): Promise<string> {
    const root = base || 'evento';
    let candidate = root;
    for (let suffix = 2; suffix <= MAX_SLUG_SUFFIX; suffix += 1) {
      const existing = await this.prisma.event.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
      candidate = `${root}-${suffix}`.slice(0, 120);
    }
    throw new ConflictException({ code: 'EVENT_SLUG_EXHAUSTED', message: 'No slug available' });
  }

  private invalidState(status: EventStatus, action: string): BadRequestException {
    return new BadRequestException({
      code: 'EVENT_INVALID_STATE',
      message: `Cannot ${action} an event in ${status} state`,
    });
  }

  private toView(event: EventWithTicketTypes): EventView {
    const ticketTypes = event.ticketTypes.map((type) => this.toTicketTypeView(type));
    // SOLD_OUT reflects exhausted inventory, not whether tickets happen to be
    // on sale right now. A future event with stock must never look sold out.
    const totalAvailable = ticketTypes
      .filter((type) => type.isActive)
      .reduce((sum, type) => sum + type.availableQuantity, 0);
    const status: EventView['status'] =
      event.status === EventStatus.PUBLISHED && totalAvailable === 0 ? 'SOLD_OUT' : event.status;

    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      location: event.location,
      address: event.address,
      timezone: event.timezone,
      currency: event.currency,
      capacity: event.capacity,
      requireAttendeeDetails: event.requireAttendeeDetails,
      personalPurchase: event.personalPurchase,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      registrationStart: event.registrationStart.toISOString(),
      registrationEnd: event.registrationEnd.toISOString(),
      status,
      publishedAt: event.publishedAt?.toISOString() ?? null,
      createdAt: event.createdAt.toISOString(),
      ticketTypes,
      totalAvailable,
    };
  }

  private toTicketTypeView(type: TicketType): TicketTypeView {
    const now = Date.now();
    const availableQuantity = Math.max(
      0,
      type.capacity - type.reservedQuantity - type.soldQuantity,
    );
    return {
      id: type.id,
      name: type.name,
      description: type.description,
      price: type.price.toFixed(2),
      currency: type.currency,
      capacity: type.capacity,
      reservedQuantity: type.reservedQuantity,
      soldQuantity: type.soldQuantity,
      availableQuantity,
      minPerOrder: type.minPerOrder,
      maxPerOrder: type.maxPerOrder,
      salesStart: type.salesStart.toISOString(),
      salesEnd: type.salesEnd.toISOString(),
      isActive: type.isActive,
      onSale:
        type.isActive &&
        availableQuantity > 0 &&
        type.salesStart.getTime() <= now &&
        type.salesEnd.getTime() > now,
      soldOut: availableQuantity === 0,
    };
  }
}
