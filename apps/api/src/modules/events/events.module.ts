import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module';
import { AdminEventEmailController } from './admin-event-email.controller';
import { AdminEventsController } from './admin-events.controller';
import { EventEmailBrandingService } from './event-email-branding.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [StorageModule],
  controllers: [EventsController, AdminEventsController, AdminEventEmailController],
  providers: [EventsService, EventEmailBrandingService],
  exports: [EventsService, EventEmailBrandingService],
})
export class EventsModule {}
