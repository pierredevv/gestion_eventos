import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { OrderExpirationService } from './order-expiration.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, OrderExpirationService],
  exports: [OrdersService, OrderExpirationService],
})
export class OrdersModule {}
