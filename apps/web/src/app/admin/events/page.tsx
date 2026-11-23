'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Badge,
  buttonClass,
  EmptyState,
  Field,
  inputClass,
  Loading,
  Notice,
  secondaryButtonClass,
} from '@/components/ui';
import { apiFetch, apiSend, ApiRequestError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { EventView, PaginatedEvents, TicketTypeView } from '@/lib/types';

const emptyEvent = {
  title: '',
  description: '',
  location: '',
  address: '',
  capacity: '',
  startDate: '',
  endDate: '',
  registrationStart: '',
  registrationEnd: '',
  publishNow: false,
};

const emptyType = {
  name: '',
  price: '',
  capacity: '',
  minPerOrder: '1',
  maxPerOrder: '10',
  salesStart: '',
  salesEnd: '',
};

function iso(value: string): string {
  return value ? new Date(value).toISOString() : '';
}

function EventForm({ onCreated }: { onCreated: () => void }): ReactNode {
  const [form, setForm] = useState(emptyEvent);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof emptyEvent, value: string | boolean): void =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(): Promise<void> {
    setError('');
    if (
      form.title.trim().length < 2 ||
      !form.description.trim() ||
      form.location.trim().length < 2 ||
      form.address.trim().length < 2 ||
      !form.startDate ||
      !form.endDate ||
      !form.registrationStart ||
      !form.registrationEnd
    ) {
      setError('Completa todos los campos obligatorios del evento.');
      return;
    }
    setBusy(true);
    try {
      await apiSend('/admin/events', 'POST', {
        title: form.title,
        description: form.description,
        location: form.location,
        address: form.address,
        ...(form.capacity ? { capacity: Number(form.capacity) } : {}),
        startDate: iso(form.startDate),
        endDate: iso(form.endDate),
        registrationStart: iso(form.registrationStart),
        registrationEnd: iso(form.registrationEnd),
        publishNow: form.publishNow,
      });
      setForm(emptyEvent);
      onCreated();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'No se pudo crear el evento');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-line bg-surface mt-6 rounded-xl border p-6">
      <h2 className="text-lg font-semibold">Nuevo evento</h2>
      <p className="text-ink-muted mt-1 text-xs">
        Las fechas se capturan en la zona horaria del navegador y se guardan en UTC.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Título">
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>
        <Field label="Lugar">
          <input
            className={inputClass}
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
          />
        </Field>
        <Field label="Dirección">
          <input
            className={inputClass}
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>
        <Field label="Capacidad total (opcional)">
          <input
            className={inputClass}
            inputMode="numeric"
            value={form.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </Field>
        <Field label="Inicio de ventas / registro">
          <input
            className={inputClass}
            type="datetime-local"
            value={form.registrationStart}
            onChange={(e) => set('registrationStart', e.target.value)}
          />
        </Field>
        <Field label="Fin de registro">
          <input
            className={inputClass}
            type="datetime-local"
            value={form.registrationEnd}
            onChange={(e) => set('registrationEnd', e.target.value)}
          />
        </Field>
        <Field label="Inicio del evento">
          <input
            className={inputClass}
            type="datetime-local"
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </Field>
        <Field label="Fin del evento">
          <input
            className={inputClass}
            type="datetime-local"
            value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </Field>
        <label className="text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.publishNow}
            onChange={(e) => set('publishNow', e.target.checked)}
          />{' '}
          Publicar de inmediato
        </label>
        <div className="sm:col-span-2">
          <Field label="Descripción">
            <textarea
              className={inputClass}
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
        </div>
      </div>
      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      <button className={`${buttonClass} mt-5`} disabled={busy} onClick={() => void submit()}>
        {busy ? 'Creando…' : 'Crear evento'}
      </button>
    </div>
  );
}

function TicketTypeForm({ eventId, onDone }: { eventId: string; onDone: () => void }): ReactNode {
  const [form, setForm] = useState(emptyType);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof emptyType, value: string): void =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(): Promise<void> {
    setError('');
    if (
      form.name.trim().length < 2 ||
      form.price === '' ||
      form.capacity === '' ||
      !form.salesStart ||
      !form.salesEnd
    ) {
      setError('Completa el nombre, precio, cupos y fechas de venta.');
      return;
    }
    setBusy(true);
    try {
      await apiSend(`/admin/events/${eventId}/ticket-types`, 'POST', {
        name: form.name,
        price: Number(form.price),
        capacity: Number(form.capacity),
        minPerOrder: Number(form.minPerOrder),
        maxPerOrder: Number(form.maxPerOrder),
        salesStart: iso(form.salesStart),
        salesEnd: iso(form.salesEnd),
      });
      setForm(emptyType);
      onDone();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'No se pudo crear el tipo de entrada',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-line mt-4 rounded-lg border p-4">
      <h4 className="text-sm font-semibold">Nuevo tipo de entrada</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Precio">
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
          />
        </Field>
        <Field label="Cupos">
          <input
            className={inputClass}
            inputMode="numeric"
            value={form.capacity}
            onChange={(e) => set('capacity', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mínimo">
            <input
              className={inputClass}
              inputMode="numeric"
              value={form.minPerOrder}
              onChange={(e) => set('minPerOrder', e.target.value)}
            />
          </Field>
          <Field label="Máximo">
            <input
              className={inputClass}
              inputMode="numeric"
              value={form.maxPerOrder}
              onChange={(e) => set('maxPerOrder', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Inicio de venta">
          <input
            className={inputClass}
            type="datetime-local"
            value={form.salesStart}
            onChange={(e) => set('salesStart', e.target.value)}
          />
        </Field>
        <Field label="Fin de venta">
          <input
            className={inputClass}
            type="datetime-local"
            value={form.salesEnd}
            onChange={(e) => set('salesEnd', e.target.value)}
          />
        </Field>
      </div>
      {error ? (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      <button
        className={`${secondaryButtonClass} mt-4`}
        disabled={busy}
        onClick={() => void submit()}
      >
        Agregar tipo de entrada
      </button>
    </div>
  );
}

function EventCard({ event, onChange }: { event: EventView; onChange: () => void }): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  async function action(name: 'publish' | 'cancel' | 'complete'): Promise<void> {
    setError('');
    try {
      await apiSend(`/admin/events/${event.id}/${name}`, 'POST');
      onChange();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'No se pudo cambiar el estado');
    }
  }

  async function deactivate(type: TicketTypeView): Promise<void> {
    setError('');
    try {
      await apiFetch(`/admin/events/${event.id}/ticket-types/${type.id}`, { method: 'DELETE' });
      onChange();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'No se pudo desactivar');
    }
  }

  return (
    <article className="border-line bg-surface rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold">{event.title}</h3>
            <Badge status={event.status} />
          </div>
          <p className="text-ink-muted mt-1 text-xs">
            {event.location} · {event.ticketTypes.length} tipos de entrada · {event.totalAvailable}{' '}
            disponibles
          </p>
        </div>
        <button className={secondaryButtonClass} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Ocultar' : 'Detalles'}
        </button>
      </div>
      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {expanded ? (
        <div className="border-line mt-5 border-t pt-5">
          <h4 className="text-sm font-semibold">Tipos de entrada</h4>
          {event.ticketTypes.length === 0 ? (
            <p className="text-ink-muted mt-2 text-sm">Aún no hay tipos de entrada.</p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {event.ticketTypes.map((type) => (
              <li
                key={type.id}
                className="border-line flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{type.name}</p>
                  <p className="text-ink-muted text-xs">
                    {formatMoney(type.price, type.currency)} · {type.availableQuantity} disponibles
                    · {type.isActive ? 'activo' : 'inactivo'}
                  </p>
                </div>
                {type.isActive ? (
                  <button
                    className="text-accent text-xs font-semibold"
                    onClick={() => void deactivate(type)}
                  >
                    Desactivar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <TicketTypeForm eventId={event.id} onDone={onChange} />
          <div className="mt-5 flex flex-wrap gap-2">
            {event.status === 'DRAFT' ? (
              <button className={buttonClass} onClick={() => void action('publish')}>
                Publicar
              </button>
            ) : null}
            {event.status === 'PUBLISHED' || event.status === 'SOLD_OUT' ? (
              <>
                <button className={secondaryButtonClass} onClick={() => void action('complete')}>
                  Finalizar
                </button>
                <button className={secondaryButtonClass} onClick={() => void action('cancel')}>
                  Cancelar
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function AdminEventsPage(): ReactNode {
  const [events, setEvents] = useState<EventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  function load(): void {
    setLoading(true);
    apiFetch<PaginatedEvents>('/admin/events?limit=100')
      .then((result) => setEvents(result.items))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los eventos'),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Eventos</h1>
          <p className="text-ink-muted mt-2 text-sm">
            Administra eventos, cupos y estados de venta.
          </p>
        </div>
        <button className={buttonClass} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Ocultar formulario' : 'Nuevo evento'}
        </button>
      </div>
      {showForm ? <EventForm onCreated={load} /> : null}
      {error ? (
        <div className="mt-6">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      <div className="mt-8 space-y-4">
        {loading ? <Loading /> : null}
        {!loading && events.length === 0 ? (
          <EmptyState>No hay eventos registrados.</EmptyState>
        ) : null}
        {events.map((event) => (
          <EventCard key={event.id} event={event} onChange={load} />
        ))}
      </div>
    </div>
  );
}
