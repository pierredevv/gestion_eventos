import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Request } from 'express';
import { getRequestContext } from '../../common/http/request-context';
import { Roles } from '../auth/decorators/auth.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import type { EventView, PaginatedEvents, TicketTypeView } from './events.types';
import { EventsService } from './events.service';

@ApiTags('admin-events')
@Controller('admin/events')
@Roles(RoleName.EVENT_MANAGER)
export class AdminEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List all events (including drafts)' })
  async list(@Query() query: ListEventsDto): Promise<PaginatedEvents> {
    return this.events.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get any event by id' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<EventView> {
    return this.events.findAdminById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an event' })
  async create(
    @Body() dto: CreateEventDto,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ): Promise<{ event: EventView }> {
    return { event: await this.events.create(dto, userId, getRequestContext(request)) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ): Promise<{ event: EventView }> {
    return { event: await this.events.update(id, dto, userId, getRequestContext(request)) };
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a draft event' })
  async publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ): Promise<{ event: EventView }> {
    return { event: await this.events.publish(id, userId, getRequestContext(request)) };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an event' })
  async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ): Promise<{ event: EventView }> {
    return { event: await this.events.cancel(id, userId, getRequestContext(request)) };
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark an event as completed' })
  async complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ): Promise<{ event: EventView }> {
    return { event: await this.events.complete(id, userId, getRequestContext(request)) };
  }

  @Post(':id/ticket-types')
  @ApiOperation({ summary: 'Add a ticket type to an event' })
  async createTicketType(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateTicketTypeDto,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ): Promise<{ ticketType: TicketTypeView }> {
    return {
      ticketType: await this.events.createTicketType(id, dto, userId, getRequestContext(request)),
    };
  }

  @Patch(':id/ticket-types/:ticketTypeId')
  @ApiOperation({ summary: 'Update a ticket type' })
  async updateTicketType(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ticketTypeId', new ParseUUIDPipe()) ticketTypeId: string,
    @Body() dto: UpdateTicketTypeDto,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ): Promise<{ ticketType: TicketTypeView }> {
    return {
      ticketType: await this.events.updateTicketType(
        id,
        ticketTypeId,
        dto,
        userId,
        getRequestContext(request),
      ),
    };
  }

  @Delete(':id/ticket-types/:ticketTypeId')
  @ApiOperation({ summary: 'Deactivate a ticket type (soft delete)' })
  async deactivateTicketType(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ticketTypeId', new ParseUUIDPipe()) ticketTypeId: string,
    @CurrentUser('id') userId: string,
    @Req() request: Request,
  ): Promise<{ ticketType: TicketTypeView }> {
    return {
      ticketType: await this.events.deactivateTicketType(
        id,
        ticketTypeId,
        userId,
        getRequestContext(request),
      ),
    };
  }
}
