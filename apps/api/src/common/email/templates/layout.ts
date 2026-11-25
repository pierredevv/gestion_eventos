import type { BrandConfig } from './brand';
import { renderNextLevelLayout } from './next-level-layout';
import { escapeHtml, safeColor, safeHref } from './shared';

export interface LayoutRow {
  label: string;
  value: string;
}

export interface LayoutCta {
  label: string;
  url: string;
}

export interface LayoutInput {
  brand: BrandConfig;
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  intro: string;
  rows?: LayoutRow[];
  cta?: LayoutCta;
  note?: string;
  footer?: string;
  /** Only rendered by the NEXT LEVEL layout; ignored by the classic one. */
  greeting?: string;
  badge?: { label: string; tone?: 'success' | 'info' | 'warning' | 'danger' };
  details?: LayoutRow[];
  helperNote?: string;
}

const SURFACE = '#ffffff';
const MUTED = '#5b6270';
const LINE = '#e4e0d8';
const SOFT = '#fdf0e7';

/**
 * Table-based layout with inline styles so it renders in Gmail, Outlook and
 * Apple Mail without relying on external stylesheets or images.
 */
export function renderLayout(input: LayoutInput): string {
  if (input.brand.layout?.variant === 'nextLevel') {
    return renderNextLevelLayout(input);
  }
  const brand = input.brand;
  const primary = safeColor(brand.primaryColor, '#b8431a');
  const text = safeColor(brand.textColor, '#12141a');
  const background = safeColor(brand.backgroundColor, '#f8f6f1');
  const brandName = escapeHtml(brand.brandName);
  const logoUrl = safeHref(brand.logoUrl, '');
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName}" width="120" style="display:block;max-width:120px;height:auto;border:0;" />`
    : `<span style="font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${text};">${brandName}</span>`;

  const rows = (input.rows ?? [])
    .map(
      (row) => `
              <tr>
                <td style="padding:12px 16px;border-top:1px solid ${LINE};font-size:13px;color:${MUTED};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(row.label)}</td>
                <td align="right" style="padding:12px 16px;border-top:1px solid ${LINE};font-size:13px;font-weight:700;color:${text};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(row.value)}</td>
              </tr>`,
    )
    .join('');

  const note = input.note
    ? `<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${MUTED};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(input.note).replace(/\n/g, '<br />')}</p>`
    : '';

  const cta = input.cta
    ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px;border-collapse:collapse;">
            <tr>
              <td bgcolor="${primary}" style="border-radius:8px;">
                <a href="${safeHref(input.cta.url, '')}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(input.cta.label)}</a>
              </td>
            </tr>
          </table>`
    : '';

  const footer = escapeHtml(
    input.footer ?? `Enviado por ${brand.brandName}. Por favor, no responder a este correo.`,
  );

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(input.subject)}</title>
    <style>
      @media only screen and (max-width:620px) {
        .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
        .email-title { font-size: 22px !important; }
        .email-button a { display: block !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${background};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;color:${background};">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${background};border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:32px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;border-collapse:collapse;">
            <tr>
              <td class="email-pad" style="padding:0 32px 24px;">${logo}</td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:${SURFACE};border:1px solid ${LINE};border-radius:14px;">
                  <tr>
                    <td style="height:4px;background-color:${primary};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td class="email-pad" style="padding:32px 32px 8px;">
                      <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${primary};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(input.eyebrow)}</p>
                      <h1 class="email-title" style="margin:0;font-size:27px;line-height:1.25;color:${text};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(input.headline)}</h1>
                      <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:${MUTED};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(input.intro)}</p>
                      ${note}
                    </td>
                  </tr>
                  ${
                    rows
                      ? `<tr>
                    <td class="email-pad" style="padding:20px 32px 4px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:${SOFT};border-radius:10px;">
                        ${rows}
                      </table>
                    </td>
                  </tr>`
                      : ''
                  }
                  ${
                    cta
                      ? `<tr>
                    <td class="email-pad email-button" style="padding:8px 32px 34px;">${cta}</td>
                  </tr>`
                      : `<tr><td style="height:26px;font-size:0;line-height:0;">&nbsp;</td></tr>`
                  }
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-pad" style="padding:22px 32px 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;font-family:Arial,Helvetica,sans-serif;">${footer}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
