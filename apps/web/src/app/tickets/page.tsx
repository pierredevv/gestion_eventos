'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { PageBody } from '@/components/site-shell';
import { Badge, buttonClass, EmptyState, Loading, Notice } from '@/components/ui';
import { apiFetch, apiSend } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { TicketPortal, TicketView } from '@/lib/types';

function QrImage({ payload }: { payload: string }): ReactNode {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true;
    // Rendered locally: the opaque token must never reach a third-party service.
    QRCode.toDataURL(payload, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#12141a', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [payload]);
  return src ? (
    <img
      className="size-48 rounded-lg border border-line bg-white p-2"
      src={src}
      alt="QR de entrada"
    />
  ) : (
    <div className="size-48 animate-pulse rounded-lg bg-slate-100" />
  );
}

function TicketCard({ ticket }: { ticket: TicketView }): ReactNode {
  return (
    <article className="border-line bg-surface flex flex-col gap-6 rounded-xl border p-6 sm:flex-row sm:items-center">
      <QrImage payload={ticket.qrPayload} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold">{ticket.attendeeName}</h3>
          <Badge status={ticket.status} />
        </div>
        <p className="text-ink-muted mt-2 text-sm">{ticket.ticketTypeName}</p>
        <dl className="text-ink-muted mt-4 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt>Código</dt>
            <dd className="text-ink font-mono">{ticket.ticketCode}</dd>
          </div>
          <div>
            <dt>Emitido</dt>
            <dd className="text-ink">{formatDateTime(ticket.issuedAt)}</dd>
          </div>
          {ticket.usedAt ? (
            <div>
              <dt>Usado</dt>
              <dd className="text-ink">{formatDateTime(ticket.usedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </article>
  );
}

function TicketsContent(): ReactNode {
  const search = useSearchParams();
  const token = search.get('token');
  const [portal, setPortal] = useState<TicketPortal | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!token) {
      setError('Abre el portal desde el enlace enviado a tu correo.');
      return;
    }
    let active = true;
    apiFetch<TicketPortal>(`/tickets?token=${encodeURIComponent(token)}`)
      .then((result) => {
        if (active) setPortal(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Enlace no válido');
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function resend(): Promise<void> {
    if (!portal) return;
    setNotice('');
    try {
      await apiSend(
        `/orders/${encodeURIComponent(portal.orderCode)}/tickets/resend?token=${encodeURIComponent(token ?? '')}`,
        'POST',
        undefined,
      );
      setNotice('Enviamos el enlace nuevamente a tu correo.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo reenviar');
    }
  }

  return (
    <PageBody>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Mis entradas</h1>
      {error ? (
        <div className="mt-6">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-6">
          <Notice kind="success">{notice}</Notice>
        </div>
      ) : null}
      {!portal && !error ? <Loading /> : null}
      {portal ? (
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-ink-muted text-xs uppercase">{portal.eventTitle}</p>
              <p className="text-ink-muted mt-1 text-sm">
                {formatDateTime(portal.eventStartDate)} · {portal.eventLocation} · Pedido{' '}
                <span className="font-mono">{portal.orderCode}</span>
              </p>
            </div>
            <button className={buttonClass} onClick={() => void resend()}>
              Reenviar por correo
            </button>
          </div>
          {portal.tickets.length === 0 ? (
            <EmptyState>Tus entradas todavía no están listas.</EmptyState>
          ) : (
            portal.tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)
          )}
          <p className="text-ink-muted text-xs">
            Muestra el QR en la entrada. Cada entrada permite un solo ingreso; el QR no contiene
            datos personales.
          </p>
        </div>
      ) : null}
      <Link className="text-ink-muted mt-8 inline-block text-sm hover:text-ink" href="/events">
        ← Volver al catálogo
      </Link>
    </PageBody>
  );
}

export default function TicketsPage(): ReactNode {
  return (
    <SuspenseBoundary>
      <TicketsContent />
    </SuspenseBoundary>
  );
}

function SuspenseBoundary({ children }: { children: ReactNode }): ReactNode {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}
