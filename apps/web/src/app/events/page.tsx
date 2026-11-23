'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { PageBody } from '@/components/site-shell';
import { Badge, EmptyState, Loading, Notice } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { EventView, PaginatedEvents } from '@/lib/types';

export default function EventsPage(): ReactNode {
  const [events, setEvents] = useState<EventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch<PaginatedEvents>('/events?limit=100')
      .then((result) => {
        if (active) setEvents(result.items);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageBody>
      <p className="text-accent text-xs font-semibold tracking-[0.18em] uppercase">Catálogo</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Próximos eventos</h1>
      <p className="text-ink-muted mt-3 max-w-2xl text-sm">
        Selecciona un evento para revisar disponibilidad, tipos de entrada y condiciones de compra.
      </p>

      <div className="mt-10">
        {error ? <Notice>{error}</Notice> : null}
        {loading ? <Loading /> : null}
        {!loading && !error && events.length === 0 ? (
          <EmptyState>No hay eventos publicados en este momento.</EmptyState>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const prices = event.ticketTypes.map((type) => Number(type.price));
            const from = prices.length ? Math.min(...prices) : 0;
            return (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="border-line bg-surface hover:border-accent flex flex-col rounded-xl border p-6 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-ink-muted text-xs">{formatDate(event.startDate)}</span>
                  <Badge status={event.status} />
                </div>
                <h2 className="mt-4 text-lg font-semibold tracking-tight">{event.title}</h2>
                <p className="text-ink-muted mt-2 line-clamp-2 text-sm">{event.description}</p>
                <p className="text-ink-muted mt-4 text-xs">{event.location}</p>
                <div className="border-line mt-auto flex items-center justify-between border-t pt-4 text-sm">
                  <span className="text-ink-muted">Desde</span>
                  <span className="font-semibold">
                    {event.currency ? formatMoney(String(from), event.currency) : `${from}`}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </PageBody>
  );
}
