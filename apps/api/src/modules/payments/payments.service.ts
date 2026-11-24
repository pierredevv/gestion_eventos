import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  PaymentStatus,
  PaymentSubmissionStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service';
import type { AppEnv } from '../../common/config/env';
import type { RequestContext } from '../../common/http/request-context';
import { consumeStock, releaseStock } from '../../common/inventory/inventory-sql';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INTERACTIVE_TRANSACTION_OPTIONS } from '../../common/prisma/transaction-options';
import { createHash } from 'node:crypto';
import { StorageService } from '../../common/storage/storage.service';
import { OrdersService } from '../orders/orders.service';
import type { ListSubmissionsDto } from './dto/list-submissions.dto';
import type { SubmitPaymentDto } from './dto/submit-payment.dto';
import type {
  PaginatedSubmissions,
  PaymentReviewResult,
  PaymentSubmissionView,
  UploadedReceipt,
} from './payments.types';

const SUBMISSION_INCLUDE = {
  payment: {
    include: {
      order: { include: { event: true } },
    },
  },
} satisfies Prisma.PaymentSubmissionInclude;

type SubmissionWithContext = Prisma.PaymentSubmissionGetPayload<{
  include: typeof SUBMISSION_INCLUDE;
}>;

const SIGNED_URL_TTL_SECONDS = 15 * 60;
const ALLOWED_RECEIPT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /**
   * Accepts a bank receipt for an order. The file is uploaded first; the DB
   * transaction is the source of truth. If it fails, the orphan file is removed.
   */
  async submit(
    orderCode: string,
    dto: SubmitPaymentDto,
    file: UploadedReceipt | undefined,
    userId: string | null,
    accessToken: string | undefined,
    context: RequestContext,
  ): Promise<PaymentSubmissionView> {
    const order = await this.orders.findByCode(orderCode, { userId, accessToken });
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ConflictException({
        code: 'ORDER_INVALID_STATE',
        message: 'This order is not waiting for a payment receipt',
      });
    }
    if (order.expiresAt && new Date(order.expiresAt).getTime() <= Date.now()) {
      throw new ConflictException({
        code: 'ORDER_EXPIRED',
        message: 'The payment window has expired',
      });
    }

    const extension = this.assertReceipt(file);
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    if (payment.status === PaymentStatus.APPROVED) {
      throw new ConflictException({
        code: 'PAYMENT_ALREADY_APPROVED',
        message: 'Payment already approved',
      });
    }

    const pending = await this.prisma.paymentSubmission.count({
      where: { paymentId: payment.id, reviewStatus: PaymentSubmissionStatus.PENDING },
    });
    if (pending > 0) {
      throw new ConflictException({
        code: 'RECEIPT_ALREADY_PENDING',
        message: 'A receipt is already waiting for review',
      });
    }

    const receiptSha256 = createHash('sha256').update(file!.buffer).digest('hex');
    const key = `${order.id}/${randomUUID()}.${extension}`;

    await this.storage.upload({
      bucket: 'receipts',
      key,
      data: file!.buffer,
      contentType: file!.mimetype,
    });

    let created: SubmissionWithContext;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const submission = await tx.paymentSubmission.create({
          data: {
            paymentId: payment.id,
            receiptFileKey: key,
            receiptMimeType: file!.mimetype,
            receiptSize: file!.size,
            receiptSha256,
            declaredAmount: new Prisma.Decimal(dto.declaredAmount),
            submittedById: userId,
            reviewStatus: PaymentSubmissionStatus.PENDING,
          },
          include: SUBMISSION_INCLUDE,
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.UNDER_REVIEW,
            reviewedById: null,
            reviewedAt: null,
            reviewNotes: null,
            ...(dto.paymentReference ? { paymentReference: dto.paymentReference } : {}),
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.PENDING_REVIEW, expiresAt: null },
        });

        await tx.inventoryReservation.updateMany({
          where: {
            orderId: order.id,
            status: { in: [ReservationStatus.ACTIVE, ReservationStatus.HELD_FOR_REVIEW] },
          },
          data: { status: ReservationStatus.HELD_FOR_REVIEW },
        });

        await tx.notificationJob.create({
          data: {
            type: 'RECEIPT_RECEIVED',
            recipient: order.buyerEmail,
            dedupeKey: `receipt-received-${submission.id}`,
            payload: {
              orderCode: order.orderCode,
              declaredAmount: money(submission.declaredAmount),
              paymentReference: dto.paymentReference ?? null,
            } as Prisma.InputJsonValue,
          },
        });

        return submission;
      }, INTERACTIVE_TRANSACTION_OPTIONS);
    } catch (error) {
      await this.storage.remove('receipts', key).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'RECEIPT_ALREADY_PENDING',
          message: 'A receipt is already waiting for review',
        });
      }
      throw error;
    }

    await this.audit.record({
      action: 'PAYMENT_RECEIPT_SUBMITTED',
      entityType: 'payment_submission',
      entityId: created.id,
      userId: userId ?? undefined,
      actorLabel: order.buyerEmail,
      ...context,
      metadata: {
        orderCode: order.orderCode,
        sha256: receiptSha256,
        declaredAmount: money(created.declaredAmount),
      },
    });

    // Re-read after commit: the object returned by the transaction was built
    // before the order and payment statuses were updated inside it.
    return this.toView(await this.findSubmissionRecord(created.id));
  }

  async listSubmissions(query: ListSubmissionsDto): Promise<PaginatedSubmissions> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.PaymentSubmissionWhereInput = {
      ...(query.status ? { reviewStatus: query.status } : {}),
      ...(query.eventId ? { payment: { order: { eventId: query.eventId } } } : {}),
    };

    const [submissions, total] = await this.prisma.$transaction([
      this.prisma.paymentSubmission.findMany({
        where,
        include: SUBMISSION_INCLUDE,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.paymentSubmission.count({ where }),
    ]);

    return {
      items: await Promise.all(submissions.map((submission) => this.toView(submission))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findSubmission(id: string): Promise<PaymentSubmissionView> {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id },
      include: SUBMISSION_INCLUDE,
    });
    if (!submission) {
      throw new NotFoundException({
        code: 'PAYMENT_SUBMISSION_NOT_FOUND',
        message: 'Payment submission not found',
      });
    }
    return this.toView(submission);
  }

  /** Approves a receipt, consumes reserved stock and confirms the order atomically. */
  async approve(
    submissionId: string,
    reviewerId: string,
    context: RequestContext,
  ): Promise<PaymentReviewResult> {
    const initial = await this.findSubmissionRecord(submissionId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.lockPayment(tx, initial.paymentId);
      const submission = await tx.paymentSubmission.findUniqueOrThrow({
        where: { id: submissionId },
      });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: initial.paymentId } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });

      this.assertReviewable(submission.reviewStatus, payment.status, order.status);

      const reservations = await tx.inventoryReservation.findMany({
        where: {
          orderId: order.id,
          status: { in: [ReservationStatus.ACTIVE, ReservationStatus.HELD_FOR_REVIEW] },
        },
      });
      for (const reservation of reservations) {
        const consumed = await consumeStock(tx, reservation.ticketTypeId, reservation.quantity);
        if (consumed !== 1) {
          throw new Error(`Inventory counter inconsistent for reservation ${reservation.id}`);
        }
      }
      if (reservations.length > 0) {
        await tx.inventoryReservation.updateMany({
          where: { id: { in: reservations.map((reservation) => reservation.id) } },
          data: { status: ReservationStatus.CONSUMED, consumedAt: now },
        });
      }

      await tx.paymentSubmission.update({
        where: { id: submissionId },
        data: {
          reviewStatus: PaymentSubmissionStatus.ACCEPTED,
          reviewedById: reviewerId,
          reviewedAt: now,
        },
      });
      await tx.paymentSubmission.updateMany({
        where: {
          paymentId: payment.id,
          id: { not: submissionId },
          reviewStatus: PaymentSubmissionStatus.PENDING,
        },
        data: {
          reviewStatus: PaymentSubmissionStatus.SUPERSEDED,
          reviewedById: reviewerId,
          reviewedAt: now,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.APPROVED,
          approvedSubmissionId: submissionId,
          reviewedById: reviewerId,
          reviewedAt: now,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CONFIRMED, confirmedAt: now, expiresAt: null },
      });

      await tx.notificationJob.create({
        data: {
          type: 'PAYMENT_APPROVED',
          recipient: order.buyerEmail,
          dedupeKey: `payment-approved-${order.id}`,
          payload: {
            orderCode: order.orderCode,
            amount: money(payment.amount),
          } as Prisma.InputJsonValue,
        },
      });

      // Ticket issuance is performed by the F7 worker using this durable job.
      // Creating it in the same transaction guarantees a confirmed order is
      // always followed by exactly one ticket-delivery attempt.
      await tx.notificationJob.create({
        data: {
          type: 'TICKET_DELIVERY',
          recipient: order.buyerEmail,
          dedupeKey: `ticket-delivery-${order.id}`,
          payload: { orderId: order.id, orderCode: order.orderCode } as Prisma.InputJsonValue,
        },
      });
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    await this.audit.record({
      action: 'PAYMENT_APPROVED',
      entityType: 'payment_submission',
      entityId: submissionId,
      userId: reviewerId,
      ...context,
      metadata: { orderId: initial.payment.orderId },
    });

    return this.reviewResult(
      submissionId,
      PaymentStatus.APPROVED,
      PaymentSubmissionStatus.ACCEPTED,
    );
  }

  /**
   * Rejects a receipt. Unless the retry budget is exhausted, the order returns
   * to PENDING_PAYMENT with a fresh deadline and its stock stays reserved
   * (ADR 0009).
   */
  async reject(
    submissionId: string,
    notes: string,
    reviewerId: string,
    context: RequestContext,
  ): Promise<PaymentReviewResult> {
    if (notes.trim().length < 3) {
      throw new BadRequestException({
        code: 'REVIEW_NOTES_REQUIRED',
        message: 'A reason of at least 3 characters is required to reject a receipt',
      });
    }
    const initial = await this.findSubmissionRecord(submissionId);
    const now = new Date();
    let definitive = false;

    await this.prisma.$transaction(async (tx) => {
      await this.lockPayment(tx, initial.paymentId);
      const submission = await tx.paymentSubmission.findUniqueOrThrow({
        where: { id: submissionId },
      });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: initial.paymentId } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });

      this.assertReviewable(submission.reviewStatus, payment.status, order.status);

      const attempts = order.paymentAttempts + 1;
      const maxAttempts = this.config.get('PAYMENT_RETRY_MAX_ATTEMPTS', { infer: true });
      definitive = attempts >= maxAttempts;
      const retryHours = this.config.get('PAYMENT_RETRY_WINDOW_HOURS', { infer: true });
      const nextExpiresAt = new Date(now.getTime() + retryHours * 3_600_000);

      await tx.paymentSubmission.update({
        where: { id: submissionId },
        data: {
          reviewStatus: PaymentSubmissionStatus.REJECTED,
          reviewedById: reviewerId,
          reviewedAt: now,
          reviewNotes: notes,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REJECTED,
          reviewedById: reviewerId,
          reviewedAt: now,
          reviewNotes: notes,
          paymentReference: null,
        },
      });

      const reservations = await tx.inventoryReservation.findMany({
        where: {
          orderId: order.id,
          status: { in: [ReservationStatus.ACTIVE, ReservationStatus.HELD_FOR_REVIEW] },
        },
      });

      if (definitive) {
        for (const reservation of reservations) {
          const released = await releaseStock(tx, reservation.ticketTypeId, reservation.quantity);
          if (released !== 1) {
            throw new Error(`Inventory counter inconsistent for reservation ${reservation.id}`);
          }
        }
        if (reservations.length > 0) {
          await tx.inventoryReservation.updateMany({
            where: { id: { in: reservations.map((reservation) => reservation.id) } },
            data: { status: ReservationStatus.RELEASED, releasedAt: now },
          });
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: definitive ? OrderStatus.REJECTED : OrderStatus.PENDING_PAYMENT,
          paymentAttempts: attempts,
          rejectionReason: definitive ? notes : null,
          expiresAt: definitive ? null : nextExpiresAt,
        },
      });

      await tx.notificationJob.create({
        data: {
          type: 'PAYMENT_REJECTED',
          recipient: order.buyerEmail,
          dedupeKey: `payment-rejected-${submissionId}`,
          payload: {
            orderCode: order.orderCode,
            reason: notes,
            attempts,
            maxAttempts,
            definitive,
          } as Prisma.InputJsonValue,
        },
      });
    }, INTERACTIVE_TRANSACTION_OPTIONS);

    await this.audit.record({
      action: definitive ? 'PAYMENT_REJECTED_FINAL' : 'PAYMENT_REJECTED_RETRY',
      entityType: 'payment_submission',
      entityId: submissionId,
      userId: reviewerId,
      ...context,
      metadata: { reason: notes },
    });

    return this.reviewResult(
      submissionId,
      PaymentStatus.REJECTED,
      PaymentSubmissionStatus.REJECTED,
    );
  }

  private assertReceipt(file: UploadedReceipt | undefined): string {
    if (!file) {
      throw new BadRequestException({
        code: 'RECEIPT_REQUIRED',
        message: 'A receipt file is required',
      });
    }
    const extension = ALLOWED_RECEIPT_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException({
        code: 'RECEIPT_INVALID_TYPE',
        message: 'Only PDF, PNG and JPEG receipts are accepted',
      });
    }
    const maxBytes = this.config.get('MAX_RECEIPT_SIZE_MB', { infer: true }) * 1024 * 1024;
    if (file.size <= 0 || file.size > maxBytes || file.buffer.length > maxBytes) {
      throw new BadRequestException({
        code: 'RECEIPT_TOO_LARGE',
        message: `The receipt must not exceed ${this.config.get('MAX_RECEIPT_SIZE_MB', { infer: true })} MB`,
      });
    }
    if (!this.hasValidSignature(file.buffer, extension)) {
      throw new BadRequestException({
        code: 'RECEIPT_INVALID_CONTENT',
        message: 'The receipt content does not match its declared type',
      });
    }
    return extension;
  }

  private hasValidSignature(buffer: Buffer, extension: string): boolean {
    if (extension === 'pdf') {
      return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
    }
    if (extension === 'png') {
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  private async findSubmissionRecord(id: string): Promise<SubmissionWithContext> {
    const submission = await this.prisma.paymentSubmission.findUnique({
      where: { id },
      include: SUBMISSION_INCLUDE,
    });
    if (!submission) {
      throw new NotFoundException({
        code: 'PAYMENT_SUBMISSION_NOT_FOUND',
        message: 'Payment submission not found',
      });
    }
    return submission;
  }

  private async lockPayment(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment not found' });
    }
  }

  private assertReviewable(
    submissionStatus: PaymentSubmissionStatus,
    paymentStatus: PaymentStatus,
    orderStatus: OrderStatus,
  ): void {
    if (submissionStatus !== PaymentSubmissionStatus.PENDING) {
      throw new ConflictException({
        code: 'SUBMISSION_ALREADY_REVIEWED',
        message: 'This receipt has already been reviewed',
      });
    }
    if (
      paymentStatus !== PaymentStatus.UNDER_REVIEW ||
      orderStatus !== OrderStatus.PENDING_REVIEW
    ) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_UNDER_REVIEW',
        message: 'This payment is not waiting for review',
      });
    }
  }

  private async reviewResult(
    submissionId: string,
    paymentStatus: PaymentStatus,
    submissionStatus: PaymentSubmissionStatus,
  ): Promise<PaymentReviewResult> {
    const submission = await this.prisma.paymentSubmission.findUniqueOrThrow({
      where: { id: submissionId },
      include: { payment: { include: { order: true } } },
    });
    return {
      orderId: submission.payment.order.id,
      orderCode: submission.payment.order.orderCode,
      orderStatus: submission.payment.order.status,
      paymentStatus,
      submissionStatus,
      paymentAttempts: submission.payment.order.paymentAttempts,
    };
  }

  private async toView(submission: SubmissionWithContext): Promise<PaymentSubmissionView> {
    const { payment } = submission;
    const { order } = payment;
    return {
      id: submission.id,
      paymentId: submission.paymentId,
      orderId: order.id,
      orderCode: order.orderCode,
      eventId: order.eventId,
      eventTitle: order.event.title,
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      declaredAmount: money(submission.declaredAmount),
      expectedAmount: money(payment.amount),
      currency: payment.currency,
      paymentReference: payment.paymentReference,
      receiptMimeType: submission.receiptMimeType,
      receiptSize: submission.receiptSize,
      receiptUrl: await this.storage.createSignedUrl(
        'receipts',
        submission.receiptFileKey,
        SIGNED_URL_TTL_SECONDS,
      ),
      reviewStatus: submission.reviewStatus,
      paymentStatus: payment.status,
      orderStatus: order.status,
      paymentAttempts: order.paymentAttempts,
      reviewNotes: submission.reviewNotes,
      submittedAt: submission.submittedAt.toISOString(),
      reviewedAt: submission.reviewedAt?.toISOString() ?? null,
    };
  }
}
