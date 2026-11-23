import type { TicketStatus } from '@prisma/client';

export interface TicketView {
  id: string;
  ticketCode: string;
  status: TicketStatus;
  attendeeName: string;
  attendeeEmail: string;
  ticketTypeName: string;
  eventId: string;
  eventTitle: string;
  eventStartDate: string;
  eventLocation: string;
  issuedAt: string;
  usedAt: string | null;
  /** QR payload contains only a versioned opaque token, never personal data. */
  qrPayload: string;
}

export interface TicketPortalView {
  orderCode: string;
  eventTitle: string;
  eventStartDate: string;
  eventLocation: string;
  tickets: TicketView[];
}

export interface IssuanceResult {
  tickets: TicketView[];
  accessToken: string;
}
