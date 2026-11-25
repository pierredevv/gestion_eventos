import { z } from 'zod';

/**
 * Admin-editable design tokens for a per-event email layout.
 *
 * Only structured values are accepted here: raw HTML/CSS is never stored.
 * The `classic` variant keeps the original layout byte-for-byte, so existing
 * events and platform-wide auth emails are unaffected.
 */
export const EMAIL_LAYOUT_VARIANTS = ['classic', 'nextLevel'] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const shortText = z.string().min(1).max(120);

const fieldSchemas = {
  variant: z.enum(EMAIL_LAYOUT_VARIANTS),
  tagline: shortText,
  headerColor: hexColor,
  ctaColor: hexColor,
  accentColor: hexColor,
  secondaryColor: hexColor,
  highlightColor: hexColor,
  borderColor: hexColor,
  surfaceColor: hexColor,
  detailsColor: hexColor,
  organizer: shortText,
  contactPhone: z.string().min(1).max(80),
  contactEmail: z.email().max(160),
};

const emailLayoutShape = Object.fromEntries(
  Object.entries(fieldSchemas).map(([key, schema]) => [key, schema.optional()]),
) as {
  [K in keyof typeof fieldSchemas]: z.ZodOptional<(typeof fieldSchemas)[K]>;
};

export const emailLayoutSchema = z.object(emailLayoutShape).strict();

export type EmailLayout = z.infer<typeof emailLayoutSchema>;

/**
 * Legacy/unknown keys are ignored and each invalid token falls back on its own.
 * This keeps a valid variant usable even if an old colour value is malformed.
 */
export function resolveLayout(value: unknown): EmailLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(fieldSchemas)) {
    const parsed = schema.safeParse(source[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return result as EmailLayout;
}
