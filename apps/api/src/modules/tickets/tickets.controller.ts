import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { TicketLinkDto } from './dto/ticket-link.dto';
import type { TicketPortalView } from './tickets.types';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@Controller()
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Public()
  @Get('tickets')
  @ApiOperation({ summary: 'Get the ticket portal for an order access link' })
  async portal(@Query() query: TicketLinkDto): Promise<TicketPortalView> {
    return this.tickets.portal(query.token);
  }

  @Public()
  @Post('orders/:orderCode/tickets/resend')
  @ApiOperation({ summary: 'Queue another ticket delivery email' })
  async resend(
    @Param('orderCode') orderCode: string,
    @Query() query: TicketLinkDto,
  ): Promise<{ queued: true }> {
    return this.tickets.resendDelivery(orderCode, query.token);
  }
}
