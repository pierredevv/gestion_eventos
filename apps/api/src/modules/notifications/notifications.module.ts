import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationWorkerService } from './notification-worker.service';

@Module({
  imports: [TicketsModule, EventsModule],
  providers: [NotificationWorkerService],
  exports: [NotificationWorkerService],
})
export class NotificationsModule {}
