import type { EventStatus } from '@prisma/client';
import type { EventEmailTemplates } from '../../common/email/templates';

/** Money is serialized as a string so clients never lose precision. */
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
  /** When false, attendee name and email are optional at checkout. */
  requireAttendeeDetails: boolean;
  /** When true, every attendee is derived from the buyer at checkout. */
  personalPurchase: boolean;
  startDate: string;
  endDate: string;
  registrationStart: string;
  registrationEnd: string;
  /** `SOLD_OUT` is derived from inventory and never persisted. */
  status: EventStatus | 'SOLD_OUT';
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

export interface EventEmailConfigView {
  brandName: string;
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  /** Short-lived signed URL, regenerated for each read. */
  logoUrl: string | null;
  templates: EventEmailTemplates;
  eventTitle: string;
  currency: string;
}

export interface EventEmailPreviewView {
  subject: string;
  text: string;
  html: string;
}
