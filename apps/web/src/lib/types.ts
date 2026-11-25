/** Client-side mirrors of the API view models (ADR 0004: contracts are generated for endpoints). */

export type EventStatusView = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED' | 'SOLD_OUT';

export interface TicketTypeView {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  capacity: number;
  reservedQuantity: number;
  soldQuantity: number;
  availableQuantity: number;
  minPerOrder: number;
  maxPerOrder: number;
  salesStart: string;
  salesEnd: string;
  isActive: boolean;
  onSale: boolean;
  soldOut: boolean;
}

export interface EventView {
  id: string;
  slug: string;
  title: string;
  description: string;
  location: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  capacity: number | null;
  requireAttendeeDetails: boolean;
  startDate: string;
  endDate: string;
  registrationStart: string;
  registrationEnd: string;
  status: EventStatusView;
  publishedAt: string | null;
  createdAt: string;
  ticketTypes: TicketTypeView[];
  totalAvailable: number;
}

export interface PaginatedEvents {
  items: EventView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AttendeeView {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  documentNumber: string | null;
}

export interface OrderItemView {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  attendees: AttendeeView[];
}

export interface OrderView {
  id: string;
  orderCode: string;
  eventId: string;
  status: 'PENDING_PAYMENT' | 'PENDING_REVIEW' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
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
  payment: { id: string; status: string; amount: string } | null;
}

export interface CreatedOrderResult {
  order: OrderView;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface TicketView {
  id: string;
  ticketCode: string;
  status: 'VALID' | 'USED' | 'CANCELLED';
  attendeeName: string;
  attendeeEmail: string;
  ticketTypeName: string;
  eventId: string;
  eventTitle: string;
  eventStartDate: string;
  eventLocation: string;
  issuedAt: string;
  usedAt: string | null;
  qrPayload: string;
}

export interface TicketPortal {
  orderCode: string;
  eventTitle: string;
  eventStartDate: string;
  eventLocation: string;
  tickets: TicketView[];
}

export interface AuthUserView {
  id: string;
  fullName: string;
  email: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  roles: string[];
}

export interface ManagedUserView extends AuthUserView {
  isActive: boolean;
  createdAt: string;
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
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  paymentStatus: string;
  orderStatus: string;
  paymentAttempts: number;
  reviewNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface PaginatedSubmissions {
  items: PaymentSubmissionView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SalesReport {
  generatedAt: string;
  currency: string;
  period: { from: string | null; to: string | null };
  totals: {
    orders: number;
    ticketsSold: number;
    grossRevenue: string;
    discounts: string;
    netRevenue: string;
    averageOrderValue: string;
  };
  byStatus: Array<{ status: string; orders: number }>;
  byEvent: Array<{
    eventId: string;
    eventTitle: string;
    eventStartDate: string;
    orders: number;
    ticketsSold: number;
    grossRevenue: string;
    discounts: string;
    netRevenue: string;
  }>;
  byTicketType: Array<{
    eventId: string;
    eventTitle: string;
    ticketTypeId: string;
    ticketTypeName: string;
    ticketsSold: number;
    grossRevenue: string;
  }>;
}

export interface AttendanceReport {
  eventId: string;
  eventTitle: string;
  eventStartDate: string;
  capacity: number | null;
  ticketsIssued: number;
  ticketsSold: number;
  checkedIn: number;
  noShows: number;
  attendanceRate: string;
  byTicketType: Array<{
    ticketTypeId: string;
    ticketTypeName: string;
    sold: number;
    checkedIn: number;
    noShows: number;
  }>;
}

export interface CheckInPreview {
  ticketId: string;
  ticketCode: string;
  status: 'VALID' | 'USED' | 'CANCELLED';
  attendeeName: string;
  ticketTypeName: string;
  eventId: string;
  eventTitle: string;
  eventStartDate: string;
  eventEndDate: string;
  orderCode: string;
  alreadyUsedAt: string | null;
  withinWindow: boolean;
}

export interface CheckInResult {
  checkInId: string;
  ticketId: string;
  ticketCode: string;
  attendeeName: string;
  ticketTypeName: string;
  eventTitle: string;
  checkedAt: string;
  overridden: boolean;
}

export interface CheckInRecord {
  id: string;
  ticketCode: string;
  attendeeName: string;
  ticketTypeName: string;
  checkedById: string;
  checkedAt: string;
}
