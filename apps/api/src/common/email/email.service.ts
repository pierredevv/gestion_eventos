import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { DEFAULT_EMAIL_FROM_NAME, MAX_EMAIL_FROM_NAME_LENGTH, type AppEnv } from '../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text fallback, always generated alongside the HTML version. */
  text: string;
  html: string;
}

/**
 * Provider-agnostic email delivery.
 *
 * - `console` (development): prints the message, so flows can be tested without
 *   an account. It never logs in production because the env schema forbids it.
 * - `resend`: HTTPS API, no extra dependency.
 * - `smtp`: nodemailer transport.
 *
 * Delivery is fire-and-forget for the caller: a failed email must not roll back
 * a business transaction (see ADR 0009 / notification jobs in F7).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: AppEnv['EMAIL_PROVIDER'];
  private readonly from: string;
  private readonly fromName: string;
  private readonly resendApiKey: string | undefined;
  private readonly brevoApiKey: string | undefined;
  private smtpTransport: Transporter | undefined;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.provider = config.get('EMAIL_PROVIDER', { infer: true });
    this.from = config.get('EMAIL_FROM', { infer: true });
    this.fromName = this.normalizeSenderName(config.get('EMAIL_FROM_NAME', { infer: true }));
    this.resendApiKey = config.get('RESEND_API_KEY', { infer: true });
    this.brevoApiKey = config.get('BREVO_API_KEY', { infer: true });
  }

  async send(message: EmailMessage): Promise<void> {
    if (this.provider === 'console') {
      this.logger.log(
        `[email:console] from="${this.fromName} <${this.from}>" to=${message.to} subject="${message.subject}"`,
      );
      this.logger.log(message.text);
      return;
    }

    if (this.provider === 'resend') {
      await this.sendWithResend(message);
      return;
    }

    if (this.provider === 'brevo') {
      await this.sendWithBrevo(message);
      return;
    }

    await this.sendWithSmtp(message);
  }

  /** Keeps the display name safe for SMTP headers and within Brevo's limit. */
  private normalizeSenderName(value: string | undefined): string {
    const cleaned = (value ?? DEFAULT_EMAIL_FROM_NAME)
      .replace(/[\r\n<>\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_EMAIL_FROM_NAME_LENGTH)
      .trim();
    return cleaned || DEFAULT_EMAIL_FROM_NAME;
  }

  private async sendWithResend(message: EmailMessage): Promise<void> {
    if (!this.resendApiKey) {
      throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${this.fromName} <${this.from}>`,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend rejected the message (${response.status}): ${body}`);
    }
  }

  /**
   * HTTPS fallback: some hosts block outbound SMTP ports, so Brevo's REST API
   * is used with a dedicated Brevo API key.
   */
  private async sendWithBrevo(message: EmailMessage): Promise<void> {
    if (!this.brevoApiKey) {
      throw new Error('BREVO_API_KEY is required when EMAIL_PROVIDER=brevo');
    }

    const startedAt = Date.now();
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.brevoApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { email: this.from, name: this.fromName },
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Brevo rejected the message (${response.status}): ${body.slice(0, 500)}`);
    }
    this.logger.log(
      `Brevo accepted message from "${this.fromName}" in ${Date.now() - startedAt}ms`,
    );
  }

  private async sendWithSmtp(message: EmailMessage): Promise<void> {
    this.smtpTransport ??= nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      // Render's egress to the SMTP relay is intermittently slower than a local
      // IPv4 connection. Short connect/greeting timeouts made otherwise valid
      // sends fail and left rejection notices stuck as retrying jobs.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      dnsTimeout: 10_000,
      auth: {
        user: this.config.get('SMTP_USER', { infer: true }),
        pass: this.config.get('SMTP_PASSWORD', { infer: true }),
      },
    });

    const startedAt = Date.now();
    try {
      await this.smtpTransport.sendMail({
        from: { name: this.fromName, address: this.from },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      this.logger.log(
        `SMTP accepted message in ${Date.now() - startedAt}ms via ${this.config.get('SMTP_HOST', { infer: true })}:${this.config.get('SMTP_PORT', { infer: true })}`,
      );
    } catch (error) {
      this.logger.warn(
        `SMTP delivery failed after ${Date.now() - startedAt}ms: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
