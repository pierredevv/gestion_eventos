import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { ListEventsDto } from './dto/list-events.dto';
import type { PaginatedEvents, EventView } from './events.types';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
@Public()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse published events' })
  async list(@Query() query: ListEventsDto): Promise<PaginatedEvents> {
    return this.events.listPublic(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a published event and its ticket types' })
  async findBySlug(@Param('slug') slug: string): Promise<EventView> {
    return this.events.findPublicBySlug(slug);
  }
}
