import {
  Body,
  Controller,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../common/config/env';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { getRequestContext } from '../../common/http/request-context';
import { Public } from '../auth/decorators/auth.decorators';
import { OptionalCurrentUser } from '../auth/decorators/current-user.decorator';
import { SubmitPaymentDto } from './dto/submit-payment.dto';
import type { UploadedReceipt, PaymentSubmissionView } from './payments.types';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('orders/:orderCode/payment-submissions')
export class PaymentSubmissionsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Public()
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a bank receipt for review' })
  @ApiQuery({ name: 'token', required: false, description: 'Order access link token' })
  @UseInterceptors(
    FileInterceptor('receipt', {
      // Multer keeps files in memory by default. The hard cap is a second line
      // of defence; the DTO enforces the configured 5 MB business rule.
      limits: { files: 1, fileSize: 6 * 1024 * 1024 },
    }),
  )
  async submit(
    @Param('orderCode') orderCode: string,
    @Body() dto: SubmitPaymentDto,
    @UploadedFile() file: UploadedReceipt | undefined,
    @Query('token') token: string | undefined,
    @OptionalCurrentUser() user: AuthenticatedUser | undefined,
    @Req() request: Request,
  ): Promise<{ submission: PaymentSubmissionView }> {
    // Touch the config so production startup fails early when misconfigured.
    this.config.get('MAX_RECEIPT_SIZE_MB', { infer: true });
    return {
      submission: await this.payments.submit(
        orderCode,
        dto,
        file,
        user?.id ?? null,
        token,
        getRequestContext(request),
      ),
    };
  }
}
