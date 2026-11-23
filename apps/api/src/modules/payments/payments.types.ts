import type { OrderStatus, PaymentStatus, PaymentSubmissionStatus } from '@prisma/client';

export interface UploadedReceipt {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface PaymentSubmissionView {
  id: string;
  paymentId: string;
  orderId: string;
  orderCode: string;
  eventId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  declaredAmount: string;
  expectedAmount: string;
  currency: string;
  paymentReference: string | null;
  receiptMimeType: string;
  receiptSize: number;
  receiptUrl: string;
  reviewStatus: PaymentSubmissionStatus;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  paymentAttempts: number;
  reviewNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface PaymentReviewResult {
  orderId: string;
  orderCode: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  submissionStatus: PaymentSubmissionStatus;
  paymentAttempts: number;
}

export interface PaginatedSubmissions {
  items: PaymentSubmissionView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
