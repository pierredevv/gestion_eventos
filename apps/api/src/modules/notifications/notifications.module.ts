import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationWorkerService } from './notification-worker.service';

@Module({
  imports: [TicketsModule],
  providers: [NotificationWorkerService],
  exports: [NotificationWorkerService],
})
export class NotificationsModule {}
