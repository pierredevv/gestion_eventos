import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Request } from 'express';
import { getRequestContext } from '../../common/http/request-context';
import { Roles } from '../auth/decorators/auth.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CheckInService } from './check-in.service';
import type { CheckInPreview, CheckInRecord, CheckInResult } from './check-in.types';
import { CheckInDto } from './dto/check-in.dto';

@ApiTags('check-in')
@Controller('admin/check-in')
@Roles(RoleName.CHECK_IN_STAFF, RoleName.EVENT_MANAGER)
export class CheckInController {
  constructor(private readonly checkIns: CheckInService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Preview a scanned ticket before confirming entry' })
  async preview(@Body() dto: CheckInDto): Promise<CheckInPreview> {
    return this.checkIns.preview(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Register a check-in; rejects double use atomically' })
  async checkIn(
    @Body() dto: CheckInDto,
    @CurrentUser('id') staffId: string,
    @Req() request: Request,
  ): Promise<CheckInResult> {
    return this.checkIns.checkIn(dto, staffId, getRequestContext(request));
  }
}

@ApiTags('check-in')
@Controller('admin/events')
@Roles(RoleName.CHECK_IN_STAFF, RoleName.EVENT_MANAGER)
export class EventCheckInsController {
  constructor(private readonly checkIns: CheckInService) {}

  @Get(':eventId/check-ins')
  @ApiOperation({ summary: 'List check-in records for an event' })
  async list(@Param('eventId', new ParseUUIDPipe()) eventId: string): Promise<CheckInRecord[]> {
    return this.checkIns.listByEvent(eventId);
  }
}
