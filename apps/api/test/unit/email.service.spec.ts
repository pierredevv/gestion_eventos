import { ConfigService } from '@nestjs/config';
import { DEFAULT_EMAIL_FROM_NAME, type AppEnv } from '../../src/common/config/env';
import { EmailService, type EmailMessage } from '../../src/common/email/email.service';

describe('EmailService sender name', () => {
  const originalFetch = global.fetch;
  const message: EmailMessage = {
    to: 'buyer@example.com',
    subject: 'Tus entradas',
    text: 'Texto',
    html: '<p>Texto</p>',
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function configFor(
    overrides: Partial<Record<keyof AppEnv, unknown>> = {},
  ): ConfigService<AppEnv, true> {
    return {
      get: (key: string) =>
        ({
          EMAIL_PROVIDER: 'brevo',
          EMAIL_FROM: 'sender@example.com',
          EMAIL_FROM_NAME: DEFAULT_EMAIL_FROM_NAME,
          BREVO_API_KEY: 'brevo-key',
          ...overrides,
        })[key],
    } as unknown as ConfigService<AppEnv, true>;
  }

  it('sends the configured display name in the Brevo sender payload', async () => {
    let payload:
      | {
          sender: { email: string; name: string };
          to: { email: string }[];
          subject: string;
        }
      | undefined;
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body)) as typeof payload;
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    const service = new EmailService(configFor());
    await service.send(message);

    expect(payload?.sender).toEqual({
      email: 'sender@example.com',
      name: DEFAULT_EMAIL_FROM_NAME,
    });
    expect(payload?.to).toEqual([{ email: message.to }]);
    expect(payload?.subject).toBe(message.subject);
  });

  it('sanitizes and truncates the display name before sending it', async () => {
    let payload: { sender: { name: string } } | undefined;
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body)) as typeof payload;
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    const unsafeName = `  Plataforma\n de <Eventos>  ${'x'.repeat(80)}`;
    const service = new EmailService(configFor({ EMAIL_FROM_NAME: unsafeName }));
    await service.send(message);

    expect(payload?.sender.name).toHaveLength(70);
    expect(payload?.sender.name).not.toMatch(/[\r\n<>]/);
    expect(payload?.sender.name.startsWith('Plataforma de Eventos')).toBe(true);
  });

  it('falls back to the platform default for a blank display name', async () => {
    let payload: { sender: { name: string } } | undefined;
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body)) as typeof payload;
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    const service = new EmailService(configFor({ EMAIL_FROM_NAME: '   ' }));
    await service.send(message);

    expect(payload?.sender.name).toBe(DEFAULT_EMAIL_FROM_NAME);
  });

  it('keeps the same display name for the Resend adapter', async () => {
    let payload: { from: string } | undefined;
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body)) as typeof payload;
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const service = new EmailService(
      configFor({
        EMAIL_PROVIDER: 'resend',
        EMAIL_FROM_NAME: 'Plataforma de Eventos',
        RESEND_API_KEY: 'resend-key',
      }),
    );
    await service.send(message);

    expect(payload?.from).toBe('Plataforma de Eventos <sender@example.com>');
  });
});
