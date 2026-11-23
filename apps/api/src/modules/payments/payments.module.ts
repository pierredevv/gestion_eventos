import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentSubmissionsController } from './payment-submissions.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [OrdersModule, StorageModule, AuditModule],
  controllers: [PaymentSubmissionsController, AdminPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
