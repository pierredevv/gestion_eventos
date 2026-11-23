'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PageBody } from '@/components/site-shell';
import { Badge, buttonClass, Field, inputClass, Loading, Notice } from '@/components/ui';
import { apiFetch, apiSend, ApiRequestError } from '@/lib/api';
import { formatDate, formatMoney, formatDateTime } from '@/lib/format';
import type { CreatedOrderResult, EventView } from '@/lib/types';

interface AttendeeInput {
  fullName: string;
  email: string;
}

export default function EventDetailPage(): ReactNode {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;
  const [event, setEvent] = useState<EventView | null>(null);
  const [error, setError] = useState('');
  const [ticketTypeId, setTicketTypeId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [buyer, setBuyer] = useState({ buyerName: '', buyerEmail: '', buyerPhone: '' });
  const [attendees, setAttendees] = useState<AttendeeInput[]>([{ fullName: '', email: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    apiFetch<EventView>(`/events/${encodeURIComponent(slug)}`)
      .then((result) => {
        if (!active) return;
        setEvent(result);
        const first = result.ticketTypes.find((type) => type.onSale && !type.soldOut);
        setTicketTypeId(first?.id ?? result.ticketTypes[0]?.id ?? '');
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el evento');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const selected = useMemo(
    () => event?.ticketTypes.find((type) => type.id === ticketTypeId) ?? null,
    [event, ticketTypeId],
  );

  const maxQuantity = selected
    ? Math.max(1, Math.min(selected.maxPerOrder, selected.availableQuantity))
    : 1;

  function resizeAttendees(next: number): void {
    setAttendees((current) =>
      Array.from({ length: next }, (_, index) => current[index] ?? { fullName: '', email: '' }),
    );
  }

  async function submit(): Promise<void> {
    if (!event || !selected) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await apiSend<CreatedOrderResult>('/orders', 'POST', {
        eventId: event.id,
        idempotencyKey: idempotencyKey.current,
        ...buyer,
        items: [
          {
            ticketTypeId: selected.id,
            quantity,
            attendees: attendees.slice(0, quantity),
          },
        ],
      });
      sessionStorage.setItem(`order:${result.order.orderCode}`, result.accessToken);
      router.push(`/orders/${result.order.orderCode}?token=${encodeURIComponent(result.accessToken)}`);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? `${cause.message}${cause.code ? ` (${cause.code})` : ''}`
          : 'No se pudo crear la orden',
      );
      setSubmitting(false);
    }
  }

  if (error && !event) {
    return (
      <PageBody>
        <Notice>{error}</Notice>
        <Link className="text-accent mt-4 inline-block text-sm font-semibold" href="/events">
          ← Volver al catálogo
        </Link>
      </PageBody>
    );
  }
  if (!event) {
    return (
      <PageBody>
        <Loading />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <Link className="text-ink-muted text-sm hover:text-ink" href="/events">
        ← Todos los eventos
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-start">
        <section>
          <Badge status={event.status} />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{event.title}</h1>
          <p className="text-ink-muted mt-4 whitespace-pre-line text-sm leading-relaxed">
            {event.description}
          </p>
          <dl className="border-line mt-8 grid gap-5 border-t pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted text-xs uppercase">Fecha</dt>
              <dd className="mt-1 text-sm font-medium">{formatDate(event.startDate)}</dd>
              <dd className="text-ink-muted mt-1 text-xs">{formatDateTime(event.startDate)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted text-xs uppercase">Lugar</dt>
              <dd className="mt-1 text-sm font-medium">{event.location}</dd>
              <dd className="text-ink-muted mt-1 text-xs">{event.address}</dd>
            </div>
          </dl>
          <h2 className="mt-10 text-lg font-semibold">Tipos de entrada</h2>
          <div className="mt-4 space-y-3">
            {event.ticketTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  setTicketTypeId(type.id);
                  setQuantity(1);
                  resizeAttendees(1);
                }}
                className={`border-line bg-surface w-full rounded-xl border p-4 text-left transition-colors ${
                  type.id === ticketTypeId ? 'border-accent ring-2 ring-accent/15' : 'hover:border-ink'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold">{type.name}</span>
                  <span className="font-semibold">{formatMoney(type.price, type.currency)}</span>
                </div>
                {type.description ? (
                  <p className="text-ink-muted mt-1 text-xs">{type.description}</p>
                ) : null}
                <p className="text-ink-muted mt-2 text-xs">
                  {type.availableQuantity} disponibles · mín. {type.minPerOrder} · máx.{' '}
                  {type.maxPerOrder} por orden
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="border-line bg-surface rounded-xl border p-6">
          <h2 className="text-xl font-semibold tracking-tight">Reservar entradas</h2>
          <p className="text-ink-muted mt-2 text-xs">
            La reserva dura {process.env.NEXT_PUBLIC_RESERVATION_MINUTES ?? 25} minutos. El pago se
            revisa manualmente.
          </p>

          <div className="mt-6 space-y-4">
            <Field label="Nombre del comprador">
              <input
                className={inputClass}
                value={buyer.buyerName}
                onChange={(change) => setBuyer({ ...buyer, buyerName: change.target.value })}
                autoComplete="name"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Correo del comprador">
                <input
                  className={inputClass}
                  type="email"
                  value={buyer.buyerEmail}
                  onChange={(change) => setBuyer({ ...buyer, buyerEmail: change.target.value })}
                  autoComplete="email"
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className={inputClass}
                  value={buyer.buyerPhone}
                  onChange={(change) => setBuyer({ ...buyer, buyerPhone: change.target.value })}
                  autoComplete="tel"
                />
              </Field>
            </div>

            <Field label="Cantidad">
              <select
                className={inputClass}
                value={quantity}
                onChange={(change) => {
                  const next = Number(change.target.value);
                  setQuantity(next);
                  resizeAttendees(next);
                }}
              >
                {Array.from({ length: maxQuantity }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>

            <div className="border-line space-y-4 border-t pt-5">
              <h3 className="text-sm font-semibold">Asistentes</h3>
              {attendees.slice(0, quantity).map((attendee, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-2">
                  <Field label={`Nombre del asistente ${index + 1}`}>
                    <input
                      className={inputClass}
                      value={attendee.fullName}
                      onChange={(change) =>
                        setAttendees((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, fullName: change.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label={`Correo del asistente ${index + 1}`}>
                    <input
                      className={inputClass}
                      type="email"
                      value={attendee.email}
                      onChange={(change) =>
                        setAttendees((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, email: change.target.value } : item,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>

            {selected ? (
              <div className="border-line flex items-center justify-between border-t pt-5 text-sm">
                <span className="text-ink-muted">Total estimado</span>
                <span className="text-lg font-semibold">
                  {formatMoney((Number(selected.price) * quantity).toFixed(2), selected.currency)}
                </span>
              </div>
            ) : null}

            {error ? <Notice>{error}</Notice> : null}
            <button
              className={`${buttonClass} w-full`}
              type="button"
              disabled={submitting || !selected || quantity > maxQuantity}
              onClick={() => void submit()}
            >
              {submitting ? 'Reservando…' : 'Continuar al pago'}
            </button>
          </div>
        </section>
      </div>
    </PageBody>
  );
}
