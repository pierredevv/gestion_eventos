'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { EmptyState, Loading, Notice } from '@/components/ui';
import { apiFetch, apiText } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { SalesReport } from '@/lib/types';

export default function AdminDashboard(): ReactNode {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<SalesReport>('/admin/reports/sales')
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'No se pudo cargar el resumen');
      });
    return () => {
      active = false;
    };
  }, []);

  async function exportCsv(): Promise<void> {
    try {
      const csv = await apiText('/admin/reports/sales.csv');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ventas.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Resumen</h1>
          <p className="text-ink-muted mt-2 text-sm">
            Ventas confirmadas y estado general de la operación.
          </p>
        </div>
        <button
          className="border-line bg-surface rounded-lg border px-4 py-2 text-sm font-semibold"
          onClick={() => void exportCsv()}
        >
          Exportar CSV
        </button>
      </div>

      {error ? (
        <div className="mt-6">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {!report && !error ? <Loading /> : null}

      {report ? (
        <div className="mt-8 space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Pedidos confirmados', value: String(report.totals.orders) },
              { label: 'Entradas vendidas', value: String(report.totals.ticketsSold) },
              {
                label: 'Ingreso neto',
                value: formatMoney(report.totals.netRevenue, report.currency),
              },
              {
                label: 'Ticket promedio',
                value: formatMoney(report.totals.averageOrderValue, report.currency),
              },
            ].map((card) => (
              <div key={card.label} className="border-line bg-surface rounded-xl border p-5">
                <p className="text-ink-muted text-xs">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
              </div>
            ))}
          </div>

          <section className="border-line bg-surface rounded-xl border p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Ventas por evento</h2>
              <Link className="text-accent text-xs font-semibold" href="/admin/events">
                Gestionar eventos →
              </Link>
            </div>
            {report.byEvent.length === 0 ? (
              <div className="mt-4">
                <EmptyState>Todavía no hay ventas confirmadas.</EmptyState>
              </div>
            ) : (
              <table className="mt-5 w-full text-left text-sm">
                <thead className="text-ink-muted border-line border-b text-xs uppercase">
                  <tr>
                    <th className="pb-3 font-medium">Evento</th>
                    <th className="pb-3 font-medium">Pedidos</th>
                    <th className="pb-3 font-medium">Entradas</th>
                    <th className="pb-3 text-right font-medium">Ingreso neto</th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {report.byEvent.map((event) => (
                    <tr key={event.eventId}>
                      <td className="py-3">
                        <p className="font-medium">{event.eventTitle}</p>
                        <p className="text-ink-muted text-xs">{formatDate(event.eventStartDate)}</p>
                      </td>
                      <td className="py-3">{event.orders}</td>
                      <td className="py-3">{event.ticketsSold}</td>
                      <td className="py-3 text-right font-semibold">
                        {formatMoney(event.netRevenue, report.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
