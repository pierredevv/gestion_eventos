import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/auth.decorators';
import { OptionalCurrentUser } from '../auth/decorators/current-user.decorator';
import { getRequestContext } from '../../common/http/request-context';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { CreateOrderDto } from './dto/create-order.dto';
import type { CreatedOrderResult, OrderView } from './orders.types';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Create an order and reserve inventory atomically' })
  async create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
  ): Promise<CreatedOrderResult> {
    return this.orders.create(
      { ...dto, idempotencyKey: dto.idempotencyKey ?? idempotencyKey },
      user?.id ?? null,
      getRequestContext(request),
    );
  }

  @Public()
  @Get(':orderCode')
  @ApiOperation({ summary: 'Get an order by code (buyer session or access token required)' })
  @ApiQuery({ name: 'token', required: false, description: 'Order access link token' })
  async findOne(
    @Param('orderCode') orderCode: string,
    @Query('token') token: string | undefined,
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<{ order: OrderView }> {
    return { order: await this.orders.findByCode(orderCode, { userId: user?.id, accessToken: token }) };
  }

  @Public()
  @Post(':orderCode/cancel')
  @ApiOperation({ summary: 'Cancel an order and release its inventory' })
  async cancel(
    @Param('orderCode') orderCode: string,
    @Query('token') token: string | undefined,
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
  ): Promise<{ order: OrderView }> {
    return {
      order: await this.orders.cancel(
        orderCode,
        user?.id ?? null,
        token,
        getRequestContext(request),
      ),
    };
  }
}
