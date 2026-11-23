import { z } from 'zod';

const base64Key = z.string().refine((value) => {
  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}, 'must be a base64-encoded 32-byte key');

/** Treats empty or whitespace-only values as "not set" (common in .env files). */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalEncryptionKey = z.preprocess(emptyToUndefined, base64Key.optional());

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
    WEB_ORIGIN: z.url().default('http://localhost:3000'),

    DATABASE_URL: optionalString,
    DIRECT_URL: optionalString,
    TEST_DATABASE_URL: optionalString,
    TEST_DIRECT_URL: optionalString,

    SUPABASE_URL: optionalUrl,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SUPABASE_PUBLISHABLE_KEY: optionalString,
    SUPABASE_STORAGE_BUCKET_RECEIPTS: z.string().min(1).default('receipts'),
    SUPABASE_STORAGE_BUCKET_TICKETS: z.string().min(1).default('ticket-assets'),

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

    EMAIL_PROVIDER: z.enum(['console', 'resend', 'smtp']).default('console'),
    EMAIL_FROM: z.string().min(3).default('no-reply@eventos.local'),
    RESEND_API_KEY: optionalString,
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
