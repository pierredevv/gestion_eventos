'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { PageBody } from '@/components/site-shell';
import { Badge, buttonClass, Field, inputClass, Loading, Notice } from '@/components/ui';
import { apiFetch, apiSend, apiUpload, ApiRequestError } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { OrderView } from '@/lib/types';

const paymentQrUrl = process.env.NEXT_PUBLIC_PAYMENT_QR_URL;

export default function OrderPage(): ReactNode {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = params.code;
  const queryToken = search.get('token');
  const [token, setToken] = useState(queryToken ?? '');
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ declaredAmount: '', paymentReference: '' });
  const [receipt, setReceipt] = useState<File | null>(null);

  useEffect(() => {
    const effective = queryToken ?? sessionStorage.getItem(`order:${code}`) ?? '';
    setToken(effective);
    if (!effective) {
      setError('Falta el enlace de acceso al pedido. Revisa el correo de confirmación.');
      return;
    }
    let active = true;
    apiFetch<{ order: OrderView }>(
      `/orders/${encodeURIComponent(code)}?token=${encodeURIComponent(effective)}`,
    )
      .then((result) => {
        if (!active) return;
        setOrder(result.order);
        setForm((current) => ({ ...current, declaredAmount: result.order.totalAmount }));
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'No se pudo cargar el pedido');
      });
    return () => {
      active = false;
    };
  }, [code, queryToken]);

  async function submitPayment(): Promise<void> {
    if (!receipt || !order) {
      setError('Selecciona el comprobante y completa el monto.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    const body = new FormData();
    body.append('declaredAmount', form.declaredAmount);
    if (form.paymentReference.trim()) {
      body.append('paymentReference', form.paymentReference.trim());
    }
    body.append('receipt', receipt);
    try {
      await apiUpload(
        `/orders/${encodeURIComponent(code)}/payment-submissions?token=${encodeURIComponent(token)}`,
        body,
      );
      setSuccess('Comprobante enviado. Te avisaremos cuando termine la revisión.');
      const result = await apiFetch<{ order: OrderView }>(
        `/orders/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`,
      );
      setOrder(result.order);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? `${cause.message}${cause.code ? ` (${cause.code})` : ''}`
          : 'No se pudo enviar el comprobante',
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const result = await apiSend<{ order: OrderView }>(
        `/orders/${encodeURIComponent(code)}/cancel?token=${encodeURIComponent(token)}`,
        'POST',
      );
      setOrder(result.order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cancelar el pedido');
    } finally {
      setBusy(false);
    }
  }

  async function resendTickets(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await apiSend(
        `/orders/${encodeURIComponent(code)}/tickets/resend?token=${encodeURIComponent(token)}`,
        'POST',
      );
      setSuccess('Solicitamos el reenvío de tus entradas.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo solicitar el reenvío');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageBody>
      <Link className="text-ink-muted text-sm hover:text-ink" href="/events">
        ← Eventos
      </Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-ink-muted text-xs uppercase">Pedido</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{code}</h1>
        </div>
        {order ? <Badge status={order.status} /> : null}
      </div>

      {error ? (
        <div className="mt-6">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {success ? (
        <div className="mt-6">
          <Notice kind="success">{success}</Notice>
        </div>
      ) : null}
      {!order && !error ? <Loading /> : null}

      {order ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-start">
          <section className="border-line bg-surface rounded-xl border p-6">
            <h2 className="text-lg font-semibold">Resumen</h2>
            <div className="text-ink-muted mt-4 space-y-1 text-sm">
              <p>
                Comprador: {order.buyerName} · {order.buyerEmail}
              </p>
              <p>Creado: {formatDateTime(order.createdAt)}</p>
              {order.expiresAt ? <p>Reserva hasta: {formatDateTime(order.expiresAt)}</p> : null}
              {order.rejectionReason ? (
                <p className="text-accent">Último rechazo: {order.rejectionReason}</p>
              ) : null}
            </div>
            <ul className="border-line divide-line mt-6 divide-y border-y">
              {order.items.map((item) => (
                <li key={item.id} className="py-4">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium">
                      {item.quantity} × {item.ticketTypeName}
                    </span>
                    <span>{formatMoney(item.subtotal, order.currency)}</span>
                  </div>
                  <ul className="text-ink-muted mt-2 space-y-1 text-xs">
                    {item.attendees.map((attendee) => (
                      <li key={attendee.id}>
                        {attendee.fullName} · {attendee.email}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatMoney(order.totalAmount, order.currency)}</span>
            </div>

            {order.status === 'PENDING_PAYMENT' ? (
              <button
                className={`${buttonClass} mt-6`}
                disabled={busy}
                onClick={() => void cancel()}
              >
                Cancelar pedido
              </button>
            ) : null}
            {order.status === 'CONFIRMED' ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className={buttonClass} href="/tickets">
                  Ver mis entradas
                </Link>
                <button
                  className="border-line rounded-lg border px-4 py-2.5 text-sm font-semibold"
                  disabled={busy}
                  onClick={() => void resendTickets()}
                >
                  Reenviar entradas
                </button>
              </div>
            ) : null}
          </section>

          {order.status === 'PENDING_PAYMENT' ? (
            <section className="border-line bg-surface rounded-xl border p-6">
              <h2 className="text-lg font-semibold">Enviar comprobante</h2>
              <p className="text-ink-muted mt-2 text-xs leading-relaxed">
                Realiza la transferencia al QR bancario proporcionado por la organización y sube el
                comprobante. El QR de pago es una imagen estática administrada fuera del sistema;
                esta plataforma no lo genera.
              </p>
              {paymentQrUrl ? (
                <img
                  className="border-line mt-4 max-h-64 rounded-lg border object-contain"
                  src={paymentQrUrl}
                  alt="QR bancario estático proporcionado por la organización"
                />
              ) : (
                <Notice kind="info">
                  Configura `NEXT_PUBLIC_PAYMENT_QR_URL` con la imagen del QR bancario facilitada
                  por la organización.
                </Notice>
              )}
              <div className="mt-6 space-y-4">
                <Field label="Monto declarado">
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={form.declaredAmount}
                    onChange={(change) => setForm({ ...form, declaredAmount: change.target.value })}
                  />
                </Field>
                <Field label="Referencia de pago (opcional)">
                  <input
                    className={inputClass}
                    value={form.paymentReference}
                    onChange={(change) =>
                      setForm({ ...form, paymentReference: change.target.value })
                    }
                  />
                </Field>
                <Field label="Comprobante (PDF, PNG o JPG, máx. 5 MB)">
                  <input
                    className={inputClass}
                    type="file"
                    accept=".pdf,image/png,image/jpeg"
                    onChange={(change) => setReceipt(change.target.files?.[0] ?? null)}
                  />
                </Field>
                <button
                  className={`${buttonClass} w-full`}
                  disabled={busy}
                  onClick={() => void submitPayment()}
                >
                  {busy ? 'Enviando…' : 'Enviar comprobante'}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </PageBody>
  );
}
