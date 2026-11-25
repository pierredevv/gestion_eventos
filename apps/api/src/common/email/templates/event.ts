import type { BrandConfig } from './brand';
import { renderLayout, type LayoutInput, type LayoutRow } from './layout';
import type { EmailOverrides } from './overrides';
import { formatDate, formatMoney } from './shared';
import type { RenderedEmail } from './types';

interface BaseInput {
  brand: BrandConfig;
  overrides?: EmailOverrides | null;
  currency?: string;
  /** Real event data for the NEXT LEVEL details card; never hard-coded. */
  details?: LayoutRow[];
}

function textWithFooter(text: string, footer: string | undefined): string {
  return footer ? `${text}\n\n${footer}` : text;
}

function render(
  input: BaseInput,
  defaults: {
    subject: string;
    headline: string;
    intro: string;
    /** HTML-only copy fix; the legacy plain text always uses `intro`. */
    htmlIntro?: string;
    ctaLabel?: string;
    greeting?: string;
    badge?: LayoutInput['badge'];
  },
  details: Pick<LayoutInput, 'preheader' | 'eyebrow' | 'rows' | 'cta' | 'note' | 'helperNote'> & {
    text: string;
    details?: LayoutRow[];
  },
): RenderedEmail {
  const subject = input.overrides?.subject ?? defaults.subject;
  return {
    subject,
    text: textWithFooter(details.text, input.overrides?.footer),
    html: renderLayout({
      brand: input.brand,
      subject,
      preheader: details.preheader,
      eyebrow: details.eyebrow,
      headline: input.overrides?.headline ?? defaults.headline,
      intro: input.overrides?.intro ?? defaults.htmlIntro ?? defaults.intro,
      rows: details.rows,
      cta: details.cta
        ? {
            label: input.overrides?.ctaLabel ?? defaults.ctaLabel ?? details.cta.label,
            url: details.cta.url,
          }
        : undefined,
      note: details.note,
      footer: input.overrides?.footer,
      greeting: defaults.greeting,
      badge: defaults.badge,
      details: details.details,
      helperNote: details.helperNote,
    }),
  };
}

export interface OrderCreatedInput extends BaseInput {
  orderCode: string;
  eventTitle?: string | null;
  expiresAt?: string | null;
  link: string;
}

export function renderOrderCreated(input: OrderCreatedInput): RenderedEmail {
  const rawExpiry = input.expiresAt ?? 'el plazo indicado';
  const readableExpiry = formatDate(input.expiresAt);
  const cleanExpiry = readableExpiry.replace(/\.$/, '');
  const intro = `Tu pedido ${input.orderCode} fue creado. Completa el pago antes de ${readableExpiry}.`;
  const htmlIntro = `Tu pedido ${input.orderCode} fue creado. Completa el pago antes de ${cleanExpiry}.`;
  return render(
    input,
    {
      subject: `Pedido ${input.orderCode} creado`,
      headline: '¡Tu pedido fue creado!',
      intro,
      htmlIntro,
      ctaLabel: 'Ver mi pedido',
      greeting: 'Hola,',
      badge: { label: 'Pedido creado', tone: 'info' },
    },
    {
      details: input.details,
      preheader: `Completa el pago de tu pedido ${input.orderCode}`,
      eyebrow: 'Pedido creado',
      rows: [
        ...(input.eventTitle ? [{ label: 'Evento', value: input.eventTitle }] : []),
        { label: 'Pedido', value: input.orderCode },
        { label: 'Paga antes de', value: readableExpiry },
      ],
      cta: { label: 'Ver mi pedido', url: input.link },
      // Keep byte-for-byte compatibility with the previous plain-text email.
      text: `Tu pedido ${input.orderCode} fue creado. Completa el pago antes de ${rawExpiry}.\nRevisa tu pedido aquí: ${input.link}`,
    },
  );
}

export interface ReceiptReceivedInput extends BaseInput {
  orderCode: string;
  declaredAmount?: string | null;
  paymentReference?: string | null;
}

export function renderReceiptReceived(input: ReceiptReceivedInput): RenderedEmail {
  const amount = input.declaredAmount ?? 'el monto declarado';
  const intro = `Recibimos tu comprobante por ${amount}. Te avisaremos cuando termine la revisión.`;
  return render(
    input,
    {
      subject: `Comprobante recibido para ${input.orderCode}`,
      headline: 'Recibimos tu comprobante',
      intro,
      greeting: 'Hola,',
      badge: { label: 'Comprobante recibido', tone: 'info' },
    },
    {
      details: input.details,
      preheader: 'Tu comprobante está en revisión',
      eyebrow: 'Comprobante recibido',
      rows: [
        { label: 'Pedido', value: input.orderCode },
        {
          label: 'Monto declarado',
          value: formatMoney(input.declaredAmount, input.currency) || amount,
        },
        ...(input.paymentReference ? [{ label: 'Referencia', value: input.paymentReference }] : []),
      ],
      note: 'No necesitas hacer nada más. Te escribiremos cuando termine la revisión.',
      text: intro,
    },
  );
}

export interface PaymentApprovedInput extends BaseInput {
  orderCode: string;
  amount?: string | null;
}

export function renderPaymentApproved(input: PaymentApprovedInput): RenderedEmail {
  const amount = input.amount ?? '';
  const intro = `Tu pago de ${amount} fue aprobado. Tus entradas estarán disponibles en tu portal.`;
  return render(
    input,
    {
      subject: `Pago aprobado para ${input.orderCode}`,
      headline: '¡Pago aprobado!',
      intro,
      greeting: 'Hola,',
      badge: { label: 'Pago aprobado', tone: 'success' },
    },
    {
      details: input.details,
      preheader: 'Tu pago fue aprobado',
      eyebrow: 'Pago aprobado',
      rows: [
        { label: 'Pedido', value: input.orderCode },
        { label: 'Monto', value: formatMoney(input.amount, input.currency) || amount },
        { label: 'Estado', value: 'Aprobado' },
      ],
      note: 'Tus entradas se enviarán en un correo separado. También puedes consultarlas en tu portal.',
      text: intro,
    },
  );
}

export interface PaymentRejectedInput extends BaseInput {
  orderCode: string;
  reason?: string | null;
  attempts: number;
  maxAttempts: number;
  definitive: boolean;
}

export function renderPaymentRejected(input: PaymentRejectedInput): RenderedEmail {
  const reason = input.reason ?? 'no especificado';
  const remaining = Math.max(0, input.maxAttempts - input.attempts);
  const attempts = remaining === 1 ? '1 intento' : `${remaining} intentos`;
  const intro = input.definitive
    ? `Tu comprobante fue rechazado de forma definitiva. Motivo: ${reason}.`
    : `Tu comprobante fue rechazado. Motivo: ${reason}. Te quedan ${remaining} intentos.`;
  const htmlIntro = input.definitive
    ? intro
    : `Tu comprobante fue rechazado. Motivo: ${reason}. Te quedan ${attempts}.`;
  return render(
    input,
    {
      subject: `Comprobante rechazado para ${input.orderCode}`,
      headline: input.definitive ? 'Comprobante rechazado' : 'Necesitamos un nuevo comprobante',
      intro,
      htmlIntro,
      greeting: 'Hola,',
      badge: { label: 'Comprobante rechazado', tone: 'danger' },
    },
    {
      details: input.details,
      preheader: 'Hay un problema con tu comprobante',
      eyebrow: 'Comprobante rechazado',
      rows: [
        { label: 'Pedido', value: input.orderCode },
        { label: 'Motivo', value: reason },
        ...(input.definitive ? [] : [{ label: 'Intentos restantes', value: String(remaining) }]),
      ],
      note: input.definitive
        ? 'Si crees que se trata de un error, contacta con la organización del evento.'
        : 'Puedes volver a enviar tu comprobante desde el portal de tu pedido.',
      text: intro,
    },
  );
}

export interface TicketDeliveryInput extends BaseInput {
  orderCode: string;
  eventTitle?: string | null;
  link: string;
}

export function renderTicketDelivery(input: TicketDeliveryInput): RenderedEmail {
  const intro = 'Tus entradas están listas. Consúltalas y muestra el QR en la entrada.';
  return render(
    input,
    {
      subject: `Tus entradas para ${input.orderCode}`,
      headline: '¡Tus entradas están listas!',
      intro,
      ctaLabel: 'Ver mis entradas',
      greeting: 'Hola,',
      badge: { label: 'Entrada confirmada', tone: 'success' },
    },
    {
      details: input.details,
      preheader: 'Tus entradas con QR ya están disponibles',
      helperNote: 'Tu código QR individual se muestra en tu entrada.',
      eyebrow: 'Entrega de entradas',
      rows: [
        ...(input.eventTitle ? [{ label: 'Evento', value: input.eventTitle }] : []),
        { label: 'Pedido', value: input.orderCode },
        { label: 'Estado', value: 'Listas para usar' },
      ],
      cta: { label: 'Ver mis entradas', url: input.link },
      text: `Tus entradas están listas. Consúltalas y muestra el QR en la entrada: ${input.link}`,
    },
  );
}
