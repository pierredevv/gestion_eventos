import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../../common/audit/audit.service';
import type { AppEnv } from '../../common/config/env';
import {
  DEFAULT_BRAND,
  eventEmailTemplatesSchema,
  renderOrderCreated,
  renderPaymentApproved,
  renderPaymentRejected,
  renderReceiptReceived,
  renderTicketDelivery,
  resolveBrand,
  type BrandConfig,
  type EventEmailTemplates,
} from '../../common/email/templates';
import type { RequestContext } from '../../common/http/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { EventEmailPreviewDto } from './dto/event-email-preview.dto';
import type { UpdateEventEmailDto } from './dto/update-event-email.dto';
import type { EventEmailConfigView, EventEmailPreviewView } from './events.types';

/** Long-lived enough that an email opened days later still shows the logo. */
const LOGO_URL_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface UploadedLogo {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface EmailRenderContext {
  brand: BrandConfig;
  templates: EventEmailTemplates;
  eventTitle: string | null;
  currency: string;
}

@Injectable()
export class EventEmailBrandingService {
  private readonly logger = new Logger(EventEmailBrandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /** Context used by the notification worker; never throws for a missing config. */
  async getRenderContext(eventId: string | null | undefined): Promise<EmailRenderContext> {
    if (!eventId) {
      return { brand: DEFAULT_BRAND, templates: {}, eventTitle: null, currency: 'BOB' };
    }
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, currency: true },
    });
    if (!event) {
      return { brand: DEFAULT_BRAND, templates: {}, eventTitle: null, currency: 'BOB' };
    }
    const row = await this.prisma.eventEmailBranding.findUnique({ where: { eventId: event.id } });
    return {
      brand: resolveBrand({
        brandName: row?.brandName ?? undefined,
        primaryColor: row?.primaryColor ?? undefined,
        textColor: row?.textColor ?? undefined,
        backgroundColor: row?.backgroundColor ?? undefined,
        logoUrl: row?.logoKey ? await this.signedLogoUrl(row.logoKey) : null,
      }),
      templates: this.parseTemplates(row?.templates),
      eventTitle: event.title,
      currency: event.currency,
    };
  }

  async getConfig(eventId: string): Promise<EventEmailConfigView> {
    const event = await this.findEvent(eventId);
    const row = await this.prisma.eventEmailBranding.findUnique({ where: { eventId } });
    const brand = resolveBrand({
      brandName: row?.brandName ?? undefined,
      primaryColor: row?.primaryColor ?? undefined,
      textColor: row?.textColor ?? undefined,
      backgroundColor: row?.backgroundColor ?? undefined,
      logoUrl: row?.logoKey ? await this.signedLogoUrl(row.logoKey) : null,
    });
    return {
      brandName: brand.brandName,
      primaryColor: brand.primaryColor,
      textColor: brand.textColor,
      backgroundColor: brand.backgroundColor,
      logoUrl: brand.logoUrl ?? null,
      templates: this.parseTemplates(row?.templates),
      eventTitle: event.title,
      currency: event.currency,
    };
  }

  async update(
    eventId: string,
    dto: UpdateEventEmailDto,
    userId: string,
    context: RequestContext,
  ): Promise<EventEmailConfigView> {
    await this.findEvent(eventId);
    const existing = await this.prisma.eventEmailBranding.findUnique({ where: { eventId } });
    const currentTemplates = this.parseTemplates(existing?.templates);
    const templates = this.parseTemplates({
      ...currentTemplates,
      ...(dto.templates ?? {}),
    });

    const data = {
      brandName: dto.brandName ?? existing?.brandName ?? null,
      primaryColor: dto.primaryColor ?? existing?.primaryColor ?? null,
      textColor: dto.textColor ?? existing?.textColor ?? null,
      backgroundColor: dto.backgroundColor ?? existing?.backgroundColor ?? null,
      logoKey: dto.removeLogo ? null : (existing?.logoKey ?? null),
      templates: templates as Prisma.InputJsonValue,
    };
    await this.prisma.eventEmailBranding.upsert({
      where: { eventId },
      create: { eventId, ...data },
      update: data,
    });

    if (dto.removeLogo && existing?.logoKey) {
      await this.storage.remove('event-assets', existing.logoKey).catch(() => undefined);
    }

    await this.audit.record({
      action: 'EVENT_EMAIL_UPDATED',
      entityType: 'event',
      entityId: eventId,
      userId,
      ...context,
      metadata: { fields: Object.keys(dto) },
    });
    return this.getConfig(eventId);
  }

  async uploadLogo(eventId: string, file: UploadedLogo): Promise<EventEmailConfigView> {
    await this.findEvent(eventId);
    if (!ALLOWED_LOGO_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_LOGO_TYPE',
        message: 'Only PNG, JPEG and WebP logos are accepted',
      });
    }
    if (file.size === 0 || file.size > MAX_LOGO_BYTES) {
      throw new BadRequestException({
        code: 'INVALID_LOGO_SIZE',
        message: 'The logo must be smaller than 2 MB',
      });
    }

    const existing = await this.prisma.eventEmailBranding.findUnique({ where: { eventId } });
    const suffix = randomBytes(4).toString('hex');
    const key = `events/${eventId}/email-logo-${Date.now()}-${suffix}`;
    await this.storage.upload({
      bucket: 'event-assets',
      key,
      data: file.buffer,
      contentType: file.mimetype,
    });

    await this.prisma.eventEmailBranding.upsert({
      where: { eventId },
      create: {
        eventId,
        logoKey: key,
        templates: {} as Prisma.InputJsonValue,
      },
      update: { logoKey: key },
    });
    if (existing?.logoKey && existing.logoKey !== key) {
      await this.storage.remove('event-assets', existing.logoKey).catch(() => undefined);
    }
    return this.getConfig(eventId);
  }

  async renderPreview(eventId: string, dto: EventEmailPreviewDto): Promise<EventEmailPreviewView> {
    const stored = await this.getConfig(eventId);
    const draft = dto.config;
    const brand = resolveBrand({
      brandName: draft?.brandName ?? stored.brandName,
      primaryColor: draft?.primaryColor ?? stored.primaryColor,
      textColor: draft?.textColor ?? stored.textColor,
      backgroundColor: draft?.backgroundColor ?? stored.backgroundColor,
      logoUrl: stored.logoUrl,
    });
    const overrides = {
      ...(stored.templates[dto.type] ?? {}),
      ...(draft?.templates?.[dto.type] ?? {}),
    };
    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
    const orderCode = 'PED-2026-0001';
    const sample = {
      brand,
      overrides,
      currency: stored.currency,
      orderCode,
      eventTitle: stored.eventTitle,
      expiresAt: new Date(Date.now() + 25 * 60_000).toISOString(),
      link: `${webOrigin}/orders/${orderCode}?token=preview`,
      amount: '150.00',
      declaredAmount: '150.00',
      paymentReference: 'REF-001',
      reason: 'Comprobante ilegible',
      attempts: 1,
      maxAttempts: 2,
      definitive: false,
    };

    switch (dto.type) {
      case 'ORDER_CREATED':
        return renderOrderCreated(sample);
      case 'RECEIPT_RECEIVED':
        return renderReceiptReceived(sample);
      case 'PAYMENT_APPROVED':
        return renderPaymentApproved(sample);
      case 'PAYMENT_REJECTED':
        return renderPaymentRejected(sample);
      case 'TICKET_DELIVERY':
        return renderTicketDelivery({ ...sample, link: `${webOrigin}/tickets?token=preview` });
    }
  }

  private async findEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, currency: true },
    });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found' });
    }
    return event;
  }

  private async signedLogoUrl(key: string): Promise<string | null> {
    try {
      return await this.storage.createSignedUrl('event-assets', key, LOGO_URL_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(
        `Could not sign event logo ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private parseTemplates(value: unknown): EventEmailTemplates {
    const parsed = eventEmailTemplatesSchema.safeParse(value ?? {});
    return parsed.success ? parsed.data : {};
  }
}
