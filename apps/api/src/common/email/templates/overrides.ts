import { z } from 'zod';

/** Only event-scoped notifications can be customised per event. */
export const EVENT_EMAIL_TYPES = [
  'ORDER_CREATED',
  'RECEIPT_RECEIVED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'TICKET_DELIVERY',
] as const;

export type EventEmailType = (typeof EVENT_EMAIL_TYPES)[number];

export const emailOverrideSchema = z
  .object({
    subject: z.string().min(1).max(160).optional(),
    headline: z.string().min(1).max(160).optional(),
    intro: z.string().min(1).max(600).optional(),
    ctaLabel: z.string().min(1).max(80).optional(),
    footer: z.string().min(1).max(300).optional(),
  })
  .strict();

export type EmailOverrides = z.infer<typeof emailOverrideSchema>;

export const eventEmailTemplatesSchema = z
  .object({
    ORDER_CREATED: emailOverrideSchema.optional(),
    RECEIPT_RECEIVED: emailOverrideSchema.optional(),
    PAYMENT_APPROVED: emailOverrideSchema.optional(),
    PAYMENT_REJECTED: emailOverrideSchema.optional(),
    TICKET_DELIVERY: emailOverrideSchema.optional(),
  })
  .strict();

export type EventEmailTemplates = z.infer<typeof eventEmailTemplatesSchema>;

export const eventEmailBrandingSchema = z
  .object({
    brandName: z.string().min(1).max(80).optional(),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    textColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    backgroundColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    templates: eventEmailTemplatesSchema.optional(),
  })
  .strict();

export type EventEmailBranding = z.infer<typeof eventEmailBrandingSchema>;
