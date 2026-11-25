import { z } from 'zod';

const base64Key = z.string().refine((value) => {
  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}, 'must be a base64-encoded 32-byte key');

/** Display name used when no event-specific sender is configured. */
export const DEFAULT_EMAIL_FROM_NAME = 'Plataforma de Eventos';
/** Brevo's maximum length for the sender display name. */
export const MAX_EMAIL_FROM_NAME_LENGTH = 70;

/** Treats empty or whitespace-only values as "not set" (common in .env files). */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalEncryptionKey = z.preprocess(emptyToUndefined, base64Key.optional());

/** Browsers never send a trailing slash in Origin, so normalise configured URLs. */
const normalizeOrigin = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().replace(/\/+$/, '') : value;

/** Comma-separated allowlist for Vercel preview URLs and future custom domains. */
const originList = z.preprocess((value) => {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return value
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter((item): item is string => typeof item === 'string' && item.length > 0);
}, z.array(z.url()).optional());

/** `z.coerce.boolean()` treats the string "false" as true, so parse explicitly. */
const booleanFromString = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', ''].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_ORIGIN: z.preprocess(normalizeOrigin, z.url().default('http://localhost:3000')),
    ADDITIONAL_WEB_ORIGINS: originList,
    /**
     * Vercel and Railway use different registrable domains, so production needs
     * `none` for the session/CSRF cookies to be sent on cross-site fetches.
     */
    COOKIE_SAME_SITE: z.enum(['lax', 'none', 'strict']).default('lax'),

    DATABASE_URL: optionalString,
    DIRECT_URL: optionalString,
    TEST_DATABASE_URL: optionalString,
    TEST_DIRECT_URL: optionalString,

    SUPABASE_URL: optionalUrl,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SUPABASE_PUBLISHABLE_KEY: optionalString,
    SUPABASE_STORAGE_BUCKET_RECEIPTS: z.string().min(1).default('receipts'),
    SUPABASE_STORAGE_BUCKET_TICKETS: z.string().min(1).default('ticket-assets'),
    SUPABASE_STORAGE_BUCKET_EVENT_ASSETS: z.string().min(1).default('event-assets'),

    TOKEN_ENCRYPTION_KEY: optionalEncryptionKey,

    DEFAULT_CURRENCY: z.string().length(3).default('BOB'),
    EVENT_TIMEZONE: z.string().min(1).default('America/La_Paz'),
    RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(25),
    PAYMENT_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(0).default(2),
    PAYMENT_RETRY_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
    ORDER_ACCESS_LINK_TTL_HOURS: z.coerce.number().int().positive().default(72),
    TICKET_ACCESS_TTL_DAYS_AFTER_EVENT: z.coerce.number().int().min(0).default(7),
    CHECKIN_WINDOW_BEFORE_HOURS: z.coerce.number().int().min(0).default(2),
    CHECKIN_WINDOW_AFTER_HOURS: z.coerce.number().int().min(0).default(1),
    MAX_RECEIPT_SIZE_MB: z.coerce.number().int().positive().default(5),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(120),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),

    EMAIL_PROVIDER: z.enum(['console', 'resend', 'smtp', 'brevo']).default('console'),
    EMAIL_FROM: z.string().min(3).default('no-reply@eventos.local'),
    EMAIL_FROM_NAME: z.preprocess(
      emptyToUndefined,
      z.string().min(1).max(MAX_EMAIL_FROM_NAME_LENGTH).default(DEFAULT_EMAIL_FROM_NAME),
    ),
    RESEND_API_KEY: optionalString,
    BREVO_API_KEY: optionalString,
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_SECURE: booleanFromString.default(true),
  })
  .superRefine((value, ctx) => {
    if (value.EMAIL_PROVIDER === 'resend' && !value.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }

    if (value.EMAIL_PROVIDER === 'brevo' && !value.BREVO_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['BREVO_API_KEY'],
        message: 'BREVO_API_KEY is required when EMAIL_PROVIDER=brevo',
      });
    }

    if (value.EMAIL_PROVIDER === 'smtp') {
      const requiredSmtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'] as const;
      for (const key of requiredSmtpKeys) {
        if (!value[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when EMAIL_PROVIDER=smtp`,
          });
        }
      }
    }

    if (value.NODE_ENV !== 'production') {
      return;
    }

    if (value.EMAIL_PROVIDER === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'a real email provider is required in production',
      });
    }

    const requiredKeys = [
      'DATABASE_URL',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'TOKEN_ENCRYPTION_KEY',
    ] as const;

    for (const key of requiredKeys) {
      if (!value[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }

    if (!value.WEB_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_ORIGIN'],
        message: 'WEB_ORIGIN must use HTTPS in production',
      });
    }

    for (const origin of value.ADDITIONAL_WEB_ORIGINS ?? []) {
      if (!origin.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['ADDITIONAL_WEB_ORIGINS'],
          message: 'every additional web origin must use HTTPS in production',
        });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return parsed.data;
}
