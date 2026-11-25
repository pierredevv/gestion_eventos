import { DEFAULT_BRAND } from './brand';
import { renderLayout } from './layout';
import type { RenderedEmail } from './types';

/** Auth emails are platform-wide: they always use the fixed global brand. */
export function renderVerificationEmail(input: { link: string; expires: string }): RenderedEmail {
  const subject = 'Verifica tu correo';
  const text = `${subject}:\n\n${input.link}\n\nEste enlace vence en ${input.expires}. Si no solicitaste este correo, ignóralo.`;
  return {
    subject,
    text,
    html: renderLayout({
      brand: DEFAULT_BRAND,
      subject,
      preheader: 'Confirma tu dirección de correo',
      eyebrow: 'Verificación de cuenta',
      headline: subject,
      intro:
        'Confirma tu dirección de correo para activar tu cuenta y acceder a todas las funciones.',
      rows: [{ label: 'Vigencia del enlace', value: input.expires }],
      cta: { label: 'Verificar correo', url: input.link },
    }),
  };
}

export function renderPasswordResetEmail(input: { link: string; expires: string }): RenderedEmail {
  const subject = 'Restablece tu contraseña';
  const text = `${subject}:\n\n${input.link}\n\nEste enlace vence en ${input.expires}. Si no solicitaste este correo, ignóralo.`;
  return {
    subject,
    text,
    html: renderLayout({
      brand: DEFAULT_BRAND,
      subject,
      preheader: 'Elige una nueva contraseña',
      eyebrow: 'Seguridad de la cuenta',
      headline: subject,
      intro:
        'Recibimos una solicitud para cambiar tu contraseña. Usa el botón de abajo para continuar.',
      rows: [{ label: 'Vigencia del enlace', value: input.expires }],
      cta: { label: 'Cambiar contraseña', url: input.link },
      note: 'Si no solicitaste este cambio, ignora este correo. Tu contraseña seguirá siendo la misma.',
    }),
  };
}
