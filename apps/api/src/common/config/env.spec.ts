import { validateEnv } from './env';

describe('validateEnv', () => {
  it('applies safe defaults in development', () => {
    const env = validateEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@host/db',
    });

    expect(env.PORT).toBe(4000);
    expect(env.DEFAULT_CURRENCY).toBe('BOB');
    expect(env.EVENT_TIMEZONE).toBe('America/La_Paz');
    expect(env.RESERVATION_TTL_MINUTES).toBe(25);
    expect(env.PAYMENT_RETRY_MAX_ATTEMPTS).toBe(2);
  });

  it('coerces numeric values from strings', () => {
    const env = validateEnv({ NODE_ENV: 'test', PORT: '4100', RESERVATION_TTL_MINUTES: '15' });

    expect(env.PORT).toBe(4100);
    expect(env.RESERVATION_TTL_MINUTES).toBe(15);
  });

  it('normalises browser origins and parses the cross-site cookie setting', () => {
    const env = validateEnv({
      NODE_ENV: 'development',
      WEB_ORIGIN: 'https://app.example.com/',
      ADDITIONAL_WEB_ORIGINS: 'https://preview.example.com, https://preview2.example.com/',
      COOKIE_SAME_SITE: 'none',
    });

    expect(env.WEB_ORIGIN).toBe('https://app.example.com');
    expect(env.ADDITIONAL_WEB_ORIGINS).toEqual([
      'https://preview.example.com',
      'https://preview2.example.com',
    ]);
    expect(env.COOKIE_SAME_SITE).toBe('none');
  });

  it('requires database and secrets in production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('rejects an invalid encryption key length', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        TOKEN_ENCRYPTION_KEY: Buffer.from('too-short').toString('base64'),
      }),
    ).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });
});
