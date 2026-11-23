import type { OrderStatus } from '@prisma/client';

export interface ReportTotals {
  orders: number;
  ticketsSold: number;
  grossRevenue: string;
  discounts: string;
  netRevenue: string;
  averageOrderValue: string;
}

export interface SalesByEvent {
  eventId: string;
  eventTitle: string;
  eventStartDate: string;
  orders: number;
  ticketsSold: number;
  grossRevenue: string;
  discounts: string;
  netRevenue: string;
}

export interface SalesByTicketType {
  eventId: string;
  eventTitle: string;
  ticketTypeId: string;
  ticketTypeName: string;
  ticketsSold: number;
  grossRevenue: string;
}

export interface SalesReport {
  generatedAt: string;
  currency: string;
  period: { from: string | null; to: string | null };
  totals: ReportTotals;
  byStatus: Array<{ status: OrderStatus; orders: number }>;
  byEvent: SalesByEvent[];
  byTicketType: SalesByTicketType[];
}

export interface AttendanceByTicketType {
  ticketTypeId: string;
  ticketTypeName: string;
  sold: number;
  checkedIn: number;
  noShows: number;
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
  byTicketType: AttendanceByTicketType[];
}
