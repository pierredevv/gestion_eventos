import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderStatus, RoleName } from '@prisma/client';
import { Roles } from '../auth/decorators/auth.decorators';
import type { OrderView } from './orders.types';
import { OrdersService } from './orders.service';

@ApiTags('admin-orders')
@Controller('admin/orders')
@Roles(RoleName.PAYMENT_REVIEWER)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders for an event (payment reviewers)' })
  @ApiQuery({ name: 'eventId', required: true, format: 'uuid' })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  async list(
    @Query('eventId', new ParseUUIDPipe()) eventId: string,
    @Query('status') status: OrderStatus | undefined,
  ): Promise<{ orders: OrderView[] }> {
    return { orders: await this.orders.listByEvent(eventId, status) };
  }
}
