import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import type { Request } from 'express';
import { getRequestContext } from '../../common/http/request-context';
import { Roles } from '../auth/decorators/auth.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ListSubmissionsDto } from './dto/list-submissions.dto';
import { ReviewPaymentDto } from './dto/review-payment.dto';
import type {
  PaginatedSubmissions,
  PaymentReviewResult,
  PaymentSubmissionView,
} from './payments.types';
import { PaymentsService } from './payments.service';

@ApiTags('admin-payments')
@Controller('admin/payments')
@Roles(RoleName.PAYMENT_REVIEWER)
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('submissions')
  @ApiOperation({ summary: 'List payment receipts awaiting or having completed review' })
  async list(@Query() query: ListSubmissionsDto): Promise<PaginatedSubmissions> {
    return this.payments.listSubmissions(query);
  }

  @Get('submissions/:id')
  @ApiOperation({ summary: 'Get one payment receipt with a signed URL' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ submission: PaymentSubmissionView }> {
    return { submission: await this.payments.findSubmission(id) };
  }

  @Patch('submissions/:id/approve')
  @ApiOperation({ summary: 'Approve a receipt, consume stock and confirm the order' })
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser('id') reviewerId: string,
    @Req() request: Request,
  ): Promise<PaymentReviewResult> {
    return this.payments.approve(id, reviewerId, getRequestContext(request));
  }

  @Patch('submissions/:id/reject')
  @ApiOperation({ summary: 'Reject a receipt and return the order for retry' })
  async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewPaymentDto,
    @CurrentUser('id') reviewerId: string,
    @Req() request: Request,
  ): Promise<PaymentReviewResult> {
    return this.payments.reject(id, dto.notes ?? '', reviewerId, getRequestContext(request));
  }
}
