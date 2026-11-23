import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { CheckInController, EventCheckInsController } from './check-in.controller';
import { CheckInService } from './check-in.service';

@Module({
  imports: [AuditModule],
  controllers: [CheckInController, EventCheckInsController],
  providers: [CheckInService],
  exports: [CheckInService],
})
export class CheckInModule {}
