import type { EventStatus } from '@prisma/client';

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
