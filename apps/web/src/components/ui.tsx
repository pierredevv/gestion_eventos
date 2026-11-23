import type { ReactNode } from 'react';
import { statusLabel, statusTone } from '@/lib/format';

export function Badge({ status }: { status: string }): ReactNode {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function Notice({
  children,
  kind = 'error',
}: {
  children: ReactNode;
  kind?: 'error' | 'success' | 'info';
}): ReactNode {
  const tone =
    kind === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : kind === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-sky-200 bg-sky-50 text-sky-800';
  return <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-ink-muted block text-xs">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'border-line bg-surface w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15';

export const buttonClass =
  'bg-ink text-paper hover:bg-ink/90 disabled:bg-ink/40 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed';

export const secondaryButtonClass =
  'border-line bg-surface hover:border-ink rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors';

export function EmptyState({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="border-line bg-surface rounded-xl border border-dashed px-6 py-12 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}

export function Loading(): ReactNode {
  return <p className="text-ink-muted py-12 text-center text-sm">Cargando…</p>;
}
