import type { BrandConfig } from './brand';
import type { LayoutInput, LayoutRow } from './layout';
import { escapeHtml, safeColor, safeHref } from './shared';

/**
 * NEXT LEVEL email layout: navy header + white logo box, a white content card
 * and a full-width CTA. Built only with tables, inline styles and a small
 * progressive-enhancement media query so Gmail, Outlook and mobile clients
 * render the same structure. No external fonts or JavaScript.
 */

const NAVY = '#0B2559';
const CTA = '#0052A5';
const PAGE = '#F1F5F9';
const SURFACE = '#FFFFFF';
const TEXT = '#1E293B';
const MUTED = '#475569';
const DETAILS = '#F4F7FA';
const BORDER = '#DCE5F2';
const ORANGE = '#F5A000';
const PURPLE = '#6524B8';
const CYAN = '#08A6D5';
const SUBTITLE = '#E2E8F0';
const HELPER = '#94A3B8';
const FOOTER = '#64748B';

const FONT = "'Inter','Roboto','Segoe UI',Arial,sans-serif";

type BadgeTone = 'success' | 'info' | 'warning' | 'danger';

const BADGES: Record<BadgeTone, { bg: string; fg: string }> = {
  success: { bg: '#DCFCE7', fg: '#16A34A' },
  info: { bg: '#DBEAFE', fg: '#1D4ED8' },
  warning: { bg: '#FEF3C7', fg: '#B45309' },
  danger: { bg: '#FEE2E2', fg: '#B91C1C' },
};

function renderBadge(label: string, tone: BadgeTone): string {
  const colors = BADGES[tone];
  return `<span style="display:inline-block;padding:4px 12px;border-radius:9999px;background-color:${colors.bg};color:${colors.fg};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;font-family:${FONT};">${escapeHtml(label)}</span>`;
}

function renderDetails(
  rows: LayoutRow[],
  colors: { text: string; muted: string; surface: string; details: string; border: string },
): string {
  if (rows.length === 0) return '';
  const body = rows
    .map((row, index) => {
      const first = index === 0;
      const style = [
        'padding:6px 0',
        index === rows.length - 1 ? '' : `border-bottom:1px solid ${colors.border}`,
        first
          ? `font-size:15px;font-weight:600;color:${colors.text}`
          : `font-size:14px;color:${colors.muted}`,
        `font-family:${FONT}`,
      ]
        .filter(Boolean)
        .join(';');
      return `      <tr>
        <td style="${style};">${escapeHtml(row.label)}${row.label ? ': ' : ''}${escapeHtml(row.value)}</td>
      </tr>`;
    })
    .join('\n');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 24px;background-color:${colors.details};border-radius:8px;">
      <tr>
        <td style="padding:18px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
${body}
          </table>
        </td>
      </tr>
    </table>`;
}

function renderCta(label: string, url: string, color: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="nl-button" style="border-collapse:collapse;margin:0 0 14px;">
      <tr>
        <td bgcolor="${color}" align="center" style="background-color:${color};border-radius:8px;">
          <a href="${safeHref(url, '')}" style="display:block;padding:15px 24px;font-size:14px;font-weight:700;letter-spacing:0.5px;color:#ffffff;text-decoration:none;text-align:center;font-family:${FONT};">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

export function renderNextLevelLayout(input: LayoutInput): string {
  const brand: BrandConfig = input.brand;
  const layout = brand.layout ?? {};
  const header = safeColor(layout.headerColor, NAVY);
  const ctaColor = safeColor(layout.ctaColor ?? brand.primaryColor, CTA);
  const background = safeColor(brand.backgroundColor, PAGE);
  const text = safeColor(brand.textColor, TEXT);
  const surface = safeColor(layout.surfaceColor, SURFACE);
  const details = safeColor(layout.detailsColor, DETAILS);
  const border = safeColor(layout.borderColor, BORDER);
  const accent = safeColor(layout.accentColor, ORANGE);
  const secondary = safeColor(layout.secondaryColor, PURPLE);
  const highlight = safeColor(layout.highlightColor, CYAN);

  const brandName = escapeHtml(brand.brandName);
  const logoUrl = safeHref(brand.logoUrl, '');
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName}" width="85" height="85" style="display:block;width:85px;height:85px;object-fit:contain;border:0;" />`
    : `<span style="display:block;font-size:20px;font-weight:700;letter-spacing:0.5px;color:#ffffff;font-family:${FONT};">${brandName}</span>`;

  const badge = renderBadge(input.badge?.label ?? input.eyebrow, input.badge?.tone ?? 'success');
  const greeting = input.greeting ?? 'Hola,';
  const note = input.note
    ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};font-family:${FONT};">${escapeHtml(input.note).replace(/\n/g, '<br />')}</p>`
    : '';
  const helper = input.helperNote
    ? `<p style="margin:0;text-align:center;font-size:12px;color:${HELPER};font-family:${FONT};">${escapeHtml(input.helperNote)}</p>`
    : '';
  const cta = input.cta ? renderCta(input.cta.label, input.cta.url, ctaColor) : '';
  const detailRows = input.details?.length ? input.details : (input.rows ?? []);

  const contact = [layout.contactPhone, layout.contactEmail].filter(Boolean).join(' · ');
  const organization = escapeHtml(layout.organizer ?? brand.brandName);
  const footer = input.footer
    ? escapeHtml(input.footer)
    : contact
      ? escapeHtml(contact)
      : 'Por favor, no responder a este correo.';

  // The accent/cyan tokens are used as thin progressive-enhancement rules.
  // They degrade to the solid navy/CTA colours in clients without gradients.
  const accentRule = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr>
    <td style="width:45%;height:3px;background-color:${secondary};font-size:0;line-height:0;">&nbsp;</td>
    <td style="width:35%;height:3px;background-color:${highlight};font-size:0;line-height:0;">&nbsp;</td>
    <td style="width:20%;height:3px;background-color:${accent};font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(input.subject)}</title>
    <style>
      @media only screen and (max-width:620px) {
        .nl-pad { padding-left: 20px !important; padding-right: 20px !important; }
        .nl-body { padding: 24px 20px !important; }
        .nl-title { font-size: 20px !important; }
        .nl-button a { display: block !important; width: 100% !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${background};font-family:${FONT};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;color:${background};">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${background};border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;border-collapse:collapse;border-radius:12px;">
            <tr>
              <td bgcolor="${header}" style="background-color:${header};padding:24px 32px 28px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" align="center" style="width:100%;max-width:480px;border-collapse:collapse;background-color:${surface};border-radius:12px;">
                  <tr>
                    <td align="center" style="height:110px;padding:16px;">${logo}</td>
                  </tr>
                </table>
                <p class="nl-title" style="margin:16px 0 4px;font-size:20px;font-weight:700;letter-spacing:0.5px;color:#ffffff;font-family:${FONT};">${brandName}</p>
                <p style="margin:0;font-size:11px;font-weight:400;letter-spacing:0.8px;text-transform:uppercase;color:${SUBTITLE};font-family:${FONT};">${escapeHtml(layout.tagline ?? 'MÁS ALLÁ DEL CONOCIMIENTO')}</p>
              </td>
            </tr>
            <tr>
              <td class="nl-pad" style="padding:0 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${surface}" style="border-collapse:collapse;background-color:${surface};border:1px solid ${border};border-top:0;border-radius:0 0 12px 12px;">
                  <tr>
                    <td class="nl-body" style="padding:28px 24px;text-align:left;">
                      <p style="margin:0 0 12px;font-family:${FONT};">${badge}</p>
                      <h1 class="nl-title" style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${header};font-family:${FONT};">${escapeHtml(input.headline)}</h1>
                      <p style="margin:0 0 12px;font-size:15px;font-weight:400;line-height:1.5;color:${text};font-family:${FONT};">${escapeHtml(greeting)}</p>
                      <p style="margin:0 0 20px;font-size:15px;font-weight:400;line-height:1.5;color:${text};font-family:${FONT};">${escapeHtml(input.intro)}</p>
                      ${note}
                      ${renderDetails(detailRows, { text, muted: MUTED, surface, details, border })}
                      ${cta}
                      ${helper}
                      ${accentRule}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="nl-pad" style="padding:20px 16px 28px;text-align:center;">
                <p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.4px;color:${header};font-family:${FONT};">${organization}</p>
                <p style="margin:0;font-size:12px;font-weight:400;color:${FOOTER};font-family:${FONT};">${footer}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
