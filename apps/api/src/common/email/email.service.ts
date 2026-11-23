import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppEnv } from '../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
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
  private readonly resendApiKey: string | undefined;
  private smtpTransport: Transporter | undefined;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.provider = config.get('EMAIL_PROVIDER', { infer: true });
    this.from = config.get('EMAIL_FROM', { infer: true });
    this.resendApiKey = config.get('RESEND_API_KEY', { infer: true });
  }

  async send(message: EmailMessage): Promise<void> {
    if (this.provider === 'console') {
      this.logger.log(`[email:console] to=${message.to} subject="${message.subject}"`);
      this.logger.log(message.text);
      return;
    }

    if (this.provider === 'resend') {
      await this.sendWithResend(message);
      return;
    }

    await this.sendWithSmtp(message);
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
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend rejected the message (${response.status}): ${body}`);
    }
  }

  private async sendWithSmtp(message: EmailMessage): Promise<void> {
    this.smtpTransport ??= nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      auth: {
        user: this.config.get('SMTP_USER', { infer: true }),
        pass: this.config.get('SMTP_PASSWORD', { infer: true }),
      },
    });

    await this.smtpTransport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
