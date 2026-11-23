'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Badge, buttonClass, EmptyState, Field, inputClass, Notice } from '@/components/ui';
import { apiFetch, apiSend, ApiRequestError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type {
  CheckInPreview,
  CheckInRecord,
  CheckInResult,
  EventView,
  PaginatedEvents,
} from '@/lib/types';

export default function AdminCheckInPage(): ReactNode {
  const [events, setEvents] = useState<EventView[]>([]);
  const [eventId, setEventId] = useState('');
  const [records, setRecords] = useState<CheckInRecord[]>([]);
  const [scanned, setScanned] = useState('');
  const [preview, setPreview] = useState<CheckInPreview | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<PaginatedEvents>('/admin/events?limit=100')
      .then((data) => {
        if (!active) return;
        setEvents(data.items);
        setEventId(
          data.items.find((event) => event.status === 'PUBLISHED')?.id ?? data.items[0]?.id ?? '',
        );
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los eventos');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    apiFetch<CheckInRecord[]>(`/admin/events/${eventId}/check-ins`)
      .then((data) => {
        if (active) setRecords(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [eventId, result]);

  function identifier(): { token?: string; ticketCode?: string } {
    const value = scanned.trim();
    if (value.startsWith('EVT1:')) return { token: value };
    return { ticketCode: value };
  }

  async function loadPreview(): Promise<void> {
    if (!scanned.trim()) return;
    setBusy(true);
    setError('');
    setResult(null);
    setPreview(null);
    try {
      setPreview(await apiSend<CheckInPreview>('/admin/check-in/preview', 'POST', identifier()));
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? `${cause.message}${cause.code ? ` (${cause.code})` : ''}`
          : 'No se pudo leer el QR',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      setResult(
        await apiSend<CheckInResult>('/admin/check-in', 'POST', {
          ...identifier(),
          ...(override ? { override: true, overrideReason } : {}),
        }),
      );
      setPreview(null);
      setScanned('');
      setOverride(false);
      setOverrideReason('');
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? `${cause.message}${cause.code ? ` (${cause.code})` : ''}`
          : 'No se pudo registrar el ingreso',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Control de acceso</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Escanea el QR o escribe el código de la entrada. Cada ticket permite un solo ingreso.
      </p>

      {error ? (
        <div className="mt-5">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {result ? (
        <div className="mt-5">
          <Notice kind="success">
            Ingreso registrado: {result.attendeeName} · {result.ticketCode} · {result.eventTitle}
            {result.overridden ? ' (fuera de horario, con autorización)' : ''}
          </Notice>
        </div>
      ) : null}

      <section className="border-line bg-surface mt-6 rounded-xl border p-6">
        <Field
          label="Contenido del QR o código de entrada"
          hint="Los lectores de código de barras escriben directamente en este campo."
        >
          <div className="flex gap-2">
            <input
              className={`${inputClass} font-mono`}
              value={scanned}
              autoFocus
              onChange={(change) => setScanned(change.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loadPreview();
              }}
              placeholder="EVT1:…"
            />
            <button
              className={buttonClass}
              disabled={busy || !scanned.trim()}
              onClick={() => void loadPreview()}
            >
              Leer
            </button>
          </div>
        </Field>

        {preview ? (
          <div className="border-line mt-5 border-t pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{preview.attendeeName}</h2>
              <Badge status={preview.status} />
              {!preview.withinWindow ? <Badge status="OUTSIDE_WINDOW" /> : null}
            </div>
            <dl className="text-ink-muted mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt>Evento</dt>
                <dd className="text-ink">{preview.eventTitle}</dd>
              </div>
              <div>
                <dt>Tipo de entrada</dt>
                <dd className="text-ink">{preview.ticketTypeName}</dd>
              </div>
              <div>
                <dt>Código</dt>
                <dd className="text-ink font-mono">{preview.ticketCode}</dd>
              </div>
              <div>
                <dt>Orden</dt>
                <dd className="text-ink font-mono">{preview.orderCode}</dd>
              </div>
              <div>
                <dt>Horario del evento</dt>
                <dd className="text-ink">{formatDateTime(preview.eventStartDate)}</dd>
              </div>
              <div>
                <dt>Usado anteriormente</dt>
                <dd className="text-ink">
                  {preview.alreadyUsedAt ? formatDateTime(preview.alreadyUsedAt) : 'No'}
                </dd>
              </div>
            </dl>

            {preview.status === 'VALID' && !preview.alreadyUsedAt ? (
              <div className="mt-5 space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(change) => setOverride(change.target.checked)}
                  />
                  Autorizar ingreso fuera del horario permitido
                </label>
                {override ? (
                  <Field
                    label="Motivo de la autorización"
                    hint="Queda registrado en la bitácora de auditoría."
                  >
                    <input
                      className={inputClass}
                      value={overrideReason}
                      onChange={(change) => setOverrideReason(change.target.value)}
                    />
                  </Field>
                ) : null}
                <button className={buttonClass} disabled={busy} onClick={() => void confirm()}>
                  {busy ? 'Registrando…' : 'Confirmar ingreso'}
                </button>
              </div>
            ) : (
              <div className="mt-5">
                <Notice kind="info">Esta entrada no está vigente para ingreso.</Notice>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="border-line bg-surface mt-8 rounded-xl border p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Ingresos registrados</h2>
          <select
            className={`${inputClass} w-auto`}
            value={eventId}
            onChange={(change) => setEventId(change.target.value)}
          >
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </div>
        {records.length === 0 ? (
          <div className="mt-4">
            <EmptyState>No se han registrado ingresos para este evento.</EmptyState>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-ink-muted border-line border-b text-xs uppercase">
                <tr>
                  <th className="pb-3 font-medium">Asistente</th>
                  <th className="pb-3 font-medium">Entrada</th>
                  <th className="pb-3 font-medium">Tipo</th>
                  <th className="pb-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="py-3 font-medium">{record.attendeeName}</td>
                    <td className="py-3 font-mono text-xs">{record.ticketCode}</td>
                    <td className="py-3">{record.ticketTypeName}</td>
                    <td className="text-ink-muted py-3 text-xs">
                      {formatDateTime(record.checkedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
