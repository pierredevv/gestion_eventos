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
import { formatDateTime, formatMoney } from '@/lib/format';
import type { PaginatedSubmissions, PaymentSubmissionView } from '@/lib/types';

export default function AdminPaymentsPage(): ReactNode {
  const [submissions, setSubmissions] = useState<PaymentSubmissionView[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<PaymentSubmissionView | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  function load(): void {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ status, page: String(page), limit: '20' });
    apiFetch<PaginatedSubmissions>(`/admin/payments/submissions?${query}`)
      .then((result) => {
        setSubmissions(result.items);
        setTotalPages(result.totalPages);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los comprobantes');
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [status, page]);

  async function review(
    action: 'approve' | 'reject',
    target: PaymentSubmissionView | null = selected,
  ): Promise<void> {
    if (!target) return;
    if (action === 'reject' && rejectNotes.trim().length < 3) {
      setError('Indica el motivo del rechazo (al menos 3 caracteres).');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiSend(
        `/admin/payments/submissions/${target.id}/${action}`,
        'PATCH',
        action === 'reject' ? { notes: rejectNotes } : undefined,
      );
      setNotice(
        action === 'approve'
          ? 'Pago aprobado; entradas en camino.'
          : 'Pago rechazado; el comprador puede reintentar.',
      );
      setSelected(null);
      setRejectNotes('');
      load();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'No se pudo revisar el pago');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Revisión de pagos</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Cada aprobación consume el cupo reservado y confirma la orden de forma atómica.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="text-ink-muted mr-2">Estado</span>
          <select
            className={`${inputClass} w-auto`}
            value={status}
            onChange={(change) => {
              setStatus(change.target.value);
              setPage(1);
            }}
          >
            <option value="PENDING">Pendientes</option>
            <option value="APPROVED">Aprobados</option>
            <option value="REJECTED">Rechazados</option>
          </select>
        </label>
        <button className={secondaryButtonClass} onClick={load}>
          Actualizar
        </button>
      </div>

      {error ? (
        <div className="mt-5">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-5">
          <Notice kind="success">{notice}</Notice>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {loading ? <Loading /> : null}
        {!loading && submissions.length === 0 ? (
          <EmptyState>No hay comprobantes con este estado.</EmptyState>
        ) : null}
        {submissions.map((item) => (
          <article key={item.id} className="border-line bg-surface rounded-xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-semibold">{item.orderCode}</h2>
                  <Badge status={item.reviewStatus} />
                </div>
                <p className="text-ink-muted mt-1 text-xs">
                  {item.eventTitle} · {item.buyerName} · {item.buyerEmail}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatMoney(item.declaredAmount, item.currency)}</p>
                <p className="text-ink-muted text-xs">
                  Esperado: {formatMoney(item.expectedAmount, item.currency)}
                </p>
              </div>
            </div>
            <dl className="text-ink-muted mt-4 grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <dt>Enviado</dt>
                <dd className="text-ink">{formatDateTime(item.submittedAt)}</dd>
              </div>
              <div>
                <dt>Referencia</dt>
                <dd className="text-ink">{item.paymentReference ?? '—'}</dd>
              </div>
              <div>
                <dt>Intento</dt>
                <dd className="text-ink">{item.paymentAttempts}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                className={secondaryButtonClass}
                href={item.receiptUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ver comprobante
              </a>
              {item.reviewStatus === 'PENDING' ? (
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void review('approve', item)}
                >
                  Aprobar
                </button>
              ) : null}
              {item.reviewStatus === 'PENDING' ? (
                <button className={secondaryButtonClass} onClick={() => setSelected(item)}>
                  Rechazar…
                </button>
              ) : null}
            </div>
            {selected?.id === item.id && item.reviewStatus === 'PENDING' ? (
              <div className="border-line mt-4 space-y-3 border-t pt-4">
                <Field
                  label="Motivo del rechazo"
                  hint="Se mostrará al comprador para que pueda corregir el envío."
                >
                  <textarea
                    className={inputClass}
                    rows={2}
                    value={rejectNotes}
                    onChange={(change) => setRejectNotes(change.target.value)}
                  />
                </Field>
                <div className="flex gap-2">
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void review('reject')}
                  >
                    Confirmar rechazo
                  </button>
                  <button className={secondaryButtonClass} onClick={() => setSelected(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
            {item.reviewNotes ? (
              <p className="text-ink-muted mt-3 text-xs">Nota: {item.reviewNotes}</p>
            ) : null}
          </article>
        ))}
      </div>

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <button
            className={secondaryButtonClass}
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span className="text-ink-muted">
            Página {page} de {totalPages}
          </span>
          <button
            className={secondaryButtonClass}
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  );
}
