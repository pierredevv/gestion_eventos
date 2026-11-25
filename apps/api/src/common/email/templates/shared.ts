/** Helpers shared by every email template. Everything interpolated is escaped. */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Admin-provided colours are validated again here in case of legacy data. */
export function safeColor(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value.trim()) ? value.trim() : fallback;
}

/** Only internal links and explicit https links are ever rendered as hrefs. */
export function safeHref(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return escapeHtml(url.toString());
    }
  } catch {
    // Not a usable absolute URL.
  }
  return fallback;
}

export function formatDate(
  value: string | null | undefined,
  fallback = 'el plazo indicado',
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/La_Paz',
  }).format(date);
}

export function formatMoney(value: string | null | undefined, currency = 'BOB'): string {
  if (!value) return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('es-BO', { style: 'currency', currency }).format(amount);
}
