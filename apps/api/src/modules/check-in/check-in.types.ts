import type { TicketStatus } from '@prisma/client';

export interface CheckInPreview {
  ticketId: string;
  ticketCode: string;
  status: TicketStatus;
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
