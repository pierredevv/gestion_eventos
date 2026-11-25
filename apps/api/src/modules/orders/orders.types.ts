import type { OrderStatus, PaymentStatus } from '@prisma/client';

export interface OrderItemView {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  attendees: Array<{
    id: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    documentNumber: string | null;
  }>;
}

export interface OrderView {
  id: string;
  orderCode: string;
  eventId: string;
  status: OrderStatus;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  currency: string;
  paymentAttempts: number;
  expiresAt: string | null;
  confirmedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  items: OrderItemView[];
  payment: { id: string; status: PaymentStatus; amount: string } | null;
}

/** Returned only once at creation; the database stores just its hash. */
export interface CreatedOrderResult {
  order: OrderView;
  accessToken: string;
  accessTokenExpiresAt: string;
}
