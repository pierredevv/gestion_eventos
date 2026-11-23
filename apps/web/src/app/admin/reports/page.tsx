'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { EmptyState, Loading, Notice, secondaryButtonClass } from '@/components/ui';
import { apiFetch, apiText } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { AttendanceReport, EventView, PaginatedEvents, SalesReport } from '@/lib/types';

export default function AdminReportsPage(): ReactNode {
  const [events, setEvents] = useState<EventView[]>([]);
  const [eventId, setEventId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [attendance, setAttendance] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<PaginatedEvents>('/admin/events?limit=100')
      .then((result) => {
        if (active) setEvents(result.items);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los eventos');
      });
    return () => {
      active = false;
    };
  }, []);

  function query(): string {
    const params = new URLSearchParams();
    if (eventId) params.set('eventId', eventId);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    return params.toString();
  }

  async function load(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const suffix = query();
      const [salesResult, attendanceResult] = await Promise.all([
        apiFetch<SalesReport>(`/admin/reports/sales${suffix ? `?${suffix}` : ''}`),
        eventId
          ? apiFetch<AttendanceReport>(`/admin/reports/attendance?eventId=${eventId}`)
          : Promise.resolve(null),
      ]);
      setSales(salesResult);
      setAttendance(attendanceResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo generar el reporte');
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv(): Promise<void> {
    setError('');
    try {
      const suffix = query();
      const csv = await apiText(`/admin/reports/sales.csv${suffix ? `?${suffix}` : ''}`);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ventas.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar el CSV');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Reportes</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Solo las órdenes confirmadas aportan ingresos. El rango usa la fecha de confirmación.
      </p>

      <div className="border-line bg-surface mt-6 grid gap-4 rounded-xl border p-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Evento</span>
          <select className="border-line w-full rounded-lg border bg-white px-3 py-2 text-sm" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Todos los eventos</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Desde</span>
          <input className="border-line w-full rounded-lg border bg-white px-3 py-2 text-sm" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Hasta</span>
          <input className="border-line w-full rounded-lg border bg-white px-3 py-2 text-sm" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="flex items-end gap-2">
          <button className={secondaryButtonClass} onClick={() => void load()}>Generar</button>
          <button className={secondaryButtonClass} onClick={() => void exportCsv()}>CSV</button>
        </div>
      </div>

      {error ? <div className="mt-5"><Notice>{error}</Notice></div> : null}
      {loading ? <Loading /> : null}

      {sales ? (
        <div className="mt-8 space-y-8">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Pedidos', value: String(sales.totals.orders) },
              { label: 'Entradas vendidas', value: String(sales.totals.ticketsSold) },
              { label: 'Ingreso bruto', value: formatMoney(sales.totals.grossRevenue, sales.currency) },
              { label: 'Ingreso neto', value: formatMoney(sales.totals.netRevenue, sales.currency) },
            ].map((card) => (
              <div key={card.label} className="border-line bg-surface rounded-xl border p-5">
                <p className="text-ink-muted text-xs">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
              </div>
            ))}
          </section>

          <section className="border-line bg-surface rounded-xl border p-6">
            <h2 className="text-lg font-semibold">Ventas por tipo de entrada</h2>
            {sales.byTicketType.length === 0 ? (
              <div className="mt-4"><EmptyState>No hay ventas en el periodo seleccionado.</EmptyState></div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-ink-muted border-line border-b text-xs uppercase">
                    <tr>
                      <th className="pb-3 font-medium">Evento</th>
                      <th className="pb-3 font-medium">Tipo</th>
                      <th className="pb-3 font-medium">Entradas</th>
                      <th className="pb-3 text-right font-medium">Ingreso bruto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-line divide-y">
                    {sales.byTicketType.map((row) => (
                      <tr key={`${row.eventId}:${row.ticketTypeId}`}>
                        <td className="py-3">{row.eventTitle}</td>
                        <td className="py-3">{row.ticketTypeName}</td>
                        <td className="py-3">{row.ticketsSold}</td>
                        <td className="py-3 text-right font-semibold">{formatMoney(row.grossRevenue, sales.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {attendance ? (
            <section className="border-line bg-surface rounded-xl border p-6">
              <h2 className="text-lg font-semibold">Asistencia · {attendance.eventTitle}</h2>
              <p className="text-ink-muted mt-1 text-xs">{formatDate(attendance.eventStartDate)}</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Entradas emitidas', value: String(attendance.ticketsIssued) },
                  { label: 'Entradas vendidas', value: String(attendance.ticketsSold) },
                  { label: 'Ingresos', value: String(attendance.checkedIn) },
                  { label: 'Inasistencias', value: String(attendance.noShows) },
                ].map((card) => (
                  <div key={card.label} className="bg-paper rounded-lg p-4">
                    <p className="text-ink-muted text-xs">{card.label}</p>
                    <p className="mt-1 text-xl font-semibold">{card.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm">Tasa de asistencia: <span className="font-semibold">{attendance.attendanceRate}%</span></p>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
