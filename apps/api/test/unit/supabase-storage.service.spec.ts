import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../src/common/config/env';
import { SupabaseStorageService } from '../../src/common/storage/supabase-storage.service';

describe('SupabaseStorageService', () => {
  const originalFetch = global.fetch;
  const config = {
    get: (key: string) =>
      ({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        SUPABASE_STORAGE_BUCKET_RECEIPTS: 'receipts',
        SUPABASE_STORAGE_BUCKET_TICKETS: 'ticket-assets',
        MAX_RECEIPT_SIZE_MB: 5,
      })[key],
  } as unknown as ConfigService<AppEnv, true>;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('treats HTTP 400 BucketAlreadyExists as an existing bucket and uploads', async () => {
    const urls: string[] = [];
    global.fetch = jest.fn(async (...args: unknown[]) => {
      const url = String(args[0]);
      urls.push(url);
      if (url.endsWith('/storage/v1/bucket')) {
        return new Response(
          JSON.stringify({
            statusCode: '409',
            error: 'Duplicate',
            message: 'The resource already exists',
            code: 'BucketAlreadyExists',
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const service = new SupabaseStorageService(config);
    await expect(
      service.upload({
        bucket: 'receipts',
        key: 'order/receipt.png',
        data: Buffer.from('png'),
        contentType: 'image/png',
      }),
    ).resolves.toBeUndefined();

    expect(urls.some((url) => url.endsWith('/storage/v1/bucket'))).toBe(true);
    expect(urls.some((url) => url.includes('/storage/v1/object/receipts/order/receipt.png'))).toBe(
      true,
    );
  });

  it('still fails on a genuine bucket setup error', async () => {
    global.fetch = jest.fn(
      async () => new Response('provider down', { status: 500 }),
    ) as unknown as typeof fetch;

    const service = new SupabaseStorageService(config);
    await expect(
      service.upload({
        bucket: 'receipts',
        key: 'order/receipt.png',
        data: Buffer.from('png'),
        contentType: 'image/png',
      }),
    ).rejects.toThrow('Storage bucket setup failed (500)');
  });
});
