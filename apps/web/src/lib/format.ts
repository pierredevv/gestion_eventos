const TIME_ZONE = 'America/La_Paz';

export function formatMoney(amount: string, currency = 'BOB'): string {
  return new Intl.NumberFormat('es-BO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Finalizado',
  SOLD_OUT: 'Agotado',
  PENDING_PAYMENT: 'Esperando pago',
  PENDING_REVIEW: 'En revisión',
  CONFIRMED: 'Confirmado',
  EXPIRED: 'Expirado',
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  VALID: 'Vigente',
  USED: 'Utilizado',
  OUTSIDE_WINDOW: 'Fuera de horario',
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusTone(status: string): string {
  if (['CONFIRMED', 'APPROVED', 'VALID', 'PUBLISHED', 'ACTIVE'].includes(status)) {
    return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  }
  if (['REJECTED', 'CANCELLED', 'EXPIRED', 'USED', 'INACTIVE'].includes(status)) {
    return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
  return 'bg-amber-50 text-amber-800 ring-amber-200';
}
