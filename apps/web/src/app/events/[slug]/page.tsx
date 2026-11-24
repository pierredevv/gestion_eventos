'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PageBody } from '@/components/site-shell';
import {
  Badge,
  buttonClass,
  EmptyState,
  Field,
  inputClass,
  Loading,
  Notice,
} from '@/components/ui';
import { apiFetch, apiSend, ApiRequestError } from '@/lib/api';
import { formatDate, formatMoney, formatDateTime } from '@/lib/format';
import type { CreatedOrderResult, EventView, TicketTypeView } from '@/lib/types';

interface AttendeeInput {
  fullName: string;
  email: string;
}

interface CartItem {
  ticketTypeId: string;
  quantity: number;
  attendees: AttendeeInput[];
}

interface CartRow extends CartItem {
  ticketType: TicketTypeView;
}

const emptyAttendee = (): AttendeeInput => ({ fullName: '', email: '' });

/** Money arrives as a decimal string; integer cents avoid float drift in the summary. */
function toCents(amount: string): number {
  const [whole = '0', fraction = ''] = amount.trim().split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function maxQuantityFor(ticketType: TicketTypeView): number {
  return Math.max(0, Math.min(ticketType.maxPerOrder, ticketType.availableQuantity));
}

export default function EventDetailPage(): ReactNode {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;
  const [event, setEvent] = useState<EventView | null>(null);
  const [error, setError] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [buyer, setBuyer] = useState({ buyerName: '', buyerEmail: '', buyerPhone: '' });
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    apiFetch<EventView>(`/events/${encodeURIComponent(slug)}`)
      .then((result) => {
        if (!active) return;
        setEvent(result);
        const first = result.ticketTypes.find((type) => type.onSale && !type.soldOut);
        setCart(
          first ? [{ ticketTypeId: first.id, quantity: 1, attendees: [emptyAttendee()] }] : [],
        );
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'No se pudo cargar el evento');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const cartRows = useMemo<CartRow[]>(() => {
    if (!event) return [];
    const order = new Map(event.ticketTypes.map((type, index) => [type.id, index]));
    return cart
      .flatMap((item) => {
        const ticketType = event.ticketTypes.find((type) => type.id === item.ticketTypeId);
        return ticketType ? [{ ...item, ticketType }] : [];
      })
      .sort(
        (left, right) => (order.get(left.ticketTypeId) ?? 0) - (order.get(right.ticketTypeId) ?? 0),
      );
  }, [cart, event]);

  const totalTickets = cartRows.reduce((sum, row) => sum + row.quantity, 0);
  const totalCents = cartRows.reduce(
    (sum, row) => sum + toCents(row.ticketType.price) * row.quantity,
    0,
  );
  const currency = event?.currency ?? cartRows[0]?.ticketType.currency ?? 'BOB';

  function quantityFor(ticketTypeId: string): number {
    return cart.find((item) => item.ticketTypeId === ticketTypeId)?.quantity ?? 0;
  }

  function setQuantity(ticketType: TicketTypeView, next: number): void {
    const capped = Math.max(0, Math.min(next, maxQuantityFor(ticketType)));
    setError('');
    setCart((current) => {
      const existing = current.find((item) => item.ticketTypeId === ticketType.id);
      const remaining = current.filter((item) => item.ticketTypeId !== ticketType.id);
      if (capped === 0) return remaining;
      const attendees = Array.from(
        { length: capped },
        (_, index) => existing?.attendees[index] ?? emptyAttendee(),
      );
      return [...remaining, { ticketTypeId: ticketType.id, quantity: capped, attendees }];
    });
  }

  function updateAttendee(
    ticketTypeId: string,
    index: number,
    field: keyof AttendeeInput,
    value: string,
  ): void {
    setError('');
    setCart((current) =>
      current.map((item) =>
        item.ticketTypeId === ticketTypeId
          ? {
              ...item,
              attendees: item.attendees.map((attendee, attendeeIndex) =>
                attendeeIndex === index ? { ...attendee, [field]: value } : attendee,
              ),
            }
          : item,
      ),
    );
  }

  async function submit(): Promise<void> {
    if (!event || cartRows.length === 0) return;
    const hasEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    if (
      buyer.buyerName.trim().length < 2 ||
      buyer.buyerPhone.trim().length < 5 ||
      !hasEmail(buyer.buyerEmail)
    ) {
      setError('Completa el nombre, el correo y el teléfono del comprador.');
      return;
    }
    const invalidAttendee = cartRows.some((row) =>
      row.attendees.some(
        (attendee) =>
          attendee.fullName.trim().length < 2 ||
          !hasEmail(attendee.email) ||
          attendee.email.trim().length > 254,
      ),
    );
    if (invalidAttendee) {
      setError('Completa el nombre y un correo válido para cada asistente.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await apiSend<CreatedOrderResult>('/orders', 'POST', {
        eventId: event.id,
        idempotencyKey: idempotencyKey.current,
        ...buyer,
        items: cartRows.map((row) => ({
          ticketTypeId: row.ticketTypeId,
          quantity: row.quantity,
          attendees: row.attendees.map((attendee) => ({
            fullName: attendee.fullName.trim(),
            email: attendee.email.trim().toLowerCase(),
          })),
        })),
      });
      sessionStorage.setItem(`order:${result.order.orderCode}`, result.accessToken);
      router.push(
        `/orders/${result.order.orderCode}?token=${encodeURIComponent(result.accessToken)}`,
      );
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
              <dd className="mt-1 text-sm font-medium">{event.location ?? 'Por definir'}</dd>
              {event.address ? (
                <dd className="text-ink-muted mt-1 text-xs">{event.address}</dd>
              ) : null}
            </div>
          </dl>
          <h2 className="mt-10 text-lg font-semibold">Tipos de entrada</h2>
          <p className="text-ink-muted mt-1 text-xs">
            Puedes combinar varios tipos de entrada en una sola compra.
          </p>
          <div className="mt-4 space-y-3">
            {event.ticketTypes.map((type) => {
              const quantity = quantityFor(type.id);
              const max = maxQuantityFor(type);
              const purchasable = type.onSale && !type.soldOut && max > 0;
              return (
                <article
                  key={type.id}
                  data-testid="ticket-type-card"
                  data-ticket-type-id={type.id}
                  data-ticket-type-name={type.name}
                  className={`border-line bg-surface rounded-xl border p-4 transition-colors ${
                    quantity > 0 ? 'border-accent ring-2 ring-accent/15' : 'hover:border-ink'
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
                  <div className="mt-4 sm:max-w-48">
                    <Field label={`Cantidad de ${type.name}`}>
                      <select
                        className={inputClass}
                        data-testid="ticket-quantity"
                        aria-label={`Cantidad de ${type.name}`}
                        disabled={!purchasable}
                        value={quantity}
                        onChange={(change) => setQuantity(type, Number(change.target.value))}
                      >
                        {Array.from({ length: max + 1 }, (_, index) => index).map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </article>
              );
            })}
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
                data-testid="buyer-name"
                value={buyer.buyerName}
                onChange={(change) => setBuyer({ ...buyer, buyerName: change.target.value })}
                autoComplete="name"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Correo del comprador">
                <input
                  className={inputClass}
                  data-testid="buyer-email"
                  type="email"
                  value={buyer.buyerEmail}
                  onChange={(change) => setBuyer({ ...buyer, buyerEmail: change.target.value })}
                  autoComplete="email"
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className={inputClass}
                  data-testid="buyer-phone"
                  value={buyer.buyerPhone}
                  onChange={(change) => setBuyer({ ...buyer, buyerPhone: change.target.value })}
                  autoComplete="tel"
                />
              </Field>
            </div>

            <div className="border-line space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">Carrito</h3>
              {cartRows.length === 0 ? (
                <EmptyState>Selecciona al menos una entrada.</EmptyState>
              ) : (
                <ul data-testid="cart-summary" className="divide-line divide-y">
                  {cartRows.map((row) => (
                    <li
                      key={row.ticketTypeId}
                      data-testid="cart-line"
                      data-ticket-type-name={row.ticketType.name}
                      className="flex items-center justify-between gap-4 py-2 text-sm"
                    >
                      <span>
                        {row.quantity} × {row.ticketType.name}
                      </span>
                      <span data-testid="cart-line-subtotal" className="font-medium">
                        {formatMoney(
                          fromCents(toCents(row.ticketType.price) * row.quantity),
                          row.ticketType.currency,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total estimado ({totalTickets} entradas)</span>
                <span data-testid="cart-total">{formatMoney(fromCents(totalCents), currency)}</span>
              </div>
            </div>

            <div className="border-line space-y-5 border-t pt-5">
              <h3 className="text-sm font-semibold">Asistentes</h3>
              {cartRows.length === 0 ? (
                <p className="text-ink-muted text-xs">
                  Los campos aparecerán al seleccionar cantidades.
                </p>
              ) : null}
              {cartRows.map((row) => (
                <div
                  key={row.ticketTypeId}
                  data-testid="attendee-group"
                  data-ticket-type-name={row.ticketType.name}
                  className="space-y-3"
                >
                  <p className="text-ink-muted text-xs font-semibold uppercase">
                    {row.ticketType.name}
                  </p>
                  {row.attendees.map((attendee, index) => (
                    <div key={index} className="grid gap-3 sm:grid-cols-2">
                      <Field label={`Nombre del asistente ${index + 1} de ${row.ticketType.name}`}>
                        <input
                          className={inputClass}
                          data-testid={`attendee-name-${row.ticketTypeId}-${index}`}
                          value={attendee.fullName}
                          onChange={(change) =>
                            updateAttendee(row.ticketTypeId, index, 'fullName', change.target.value)
                          }
                        />
                      </Field>
                      <Field label={`Correo del asistente ${index + 1} de ${row.ticketType.name}`}>
                        <input
                          className={inputClass}
                          data-testid={`attendee-email-${row.ticketTypeId}-${index}`}
                          type="email"
                          value={attendee.email}
                          onChange={(change) =>
                            updateAttendee(row.ticketTypeId, index, 'email', change.target.value)
                          }
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {error ? <Notice>{error}</Notice> : null}
            <button
              className={`${buttonClass} w-full`}
              type="button"
              data-testid="submit-order"
              disabled={
                submitting ||
                cartRows.length === 0 ||
                cartRows.some((row) => row.quantity > maxQuantityFor(row.ticketType))
              }
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
