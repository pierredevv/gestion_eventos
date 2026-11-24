import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env';
import { StorageService, type StorageBucket, type UploadObjectInput } from './storage.service';

interface SignedUrlResponse {
  signedURL?: string;
  signedUrl?: string;
}

/**
 * Supabase Storage adapter using its REST API and the service-role key.
 *
 * No `supabase-js` dependency is needed: three small endpoints cover upload,
 * deletion and signed URLs. All buckets are private by design (ADR 0002).
 */
@Injectable()
export class SupabaseStorageService extends StorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly url: string | undefined;
  private readonly serviceKey: string | undefined;
  private readonly buckets: Record<StorageBucket, string>;
  private readonly ensuredBuckets = new Set<StorageBucket>();

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    super();
    this.url = this.config.get('SUPABASE_URL', { infer: true })?.replace(/\/$/, '');
    this.serviceKey = this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });
    this.buckets = {
      receipts: this.config.get('SUPABASE_STORAGE_BUCKET_RECEIPTS', { infer: true }),
      'ticket-assets': this.config.get('SUPABASE_STORAGE_BUCKET_TICKETS', { infer: true }),
    };
  }

  async upload(input: UploadObjectInput): Promise<void> {
    await this.ensureBucket(input.bucket);
    const response = await fetch(this.objectUrl(input.bucket, input.key), {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': input.contentType,
        'x-upsert': 'false',
        'cache-control': '3600',
      },
      body: input.data,
    });
    if (!response.ok) {
      throw new Error(`Storage upload failed (${response.status}): ${await response.text()}`);
    }
  }

  async createSignedUrl(
    bucket: StorageBucket,
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const response = await fetch(`${this.endpoint()}/object/sign/${this.path(bucket, key)}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!response.ok) {
      throw new Error(`Storage signed URL failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as SignedUrlResponse;
    const signed = body.signedURL ?? body.signedUrl;
    if (!signed) {
      throw new Error('Storage signed URL response was empty');
    }
    // Supabase may return either an absolute URL or a path relative to /storage/v1.
    return signed.startsWith('http') ? signed : `${this.endpoint()}/${signed.replace(/^\//, '')}`;
  }

  async remove(bucket: StorageBucket, key: string): Promise<void> {
    const response = await fetch(this.objectUrl(bucket, key), {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!response.ok) {
      this.logger.warn(`Storage delete failed (${response.status}) for ${bucket}/${key}`);
    }
  }

  /** Creates the private bucket on first use; existing buckets are fine. */
  private async ensureBucket(bucket: StorageBucket): Promise<void> {
    if (this.ensuredBuckets.has(bucket)) {
      return;
    }
    const response = await fetch(`${this.endpoint()}/bucket`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.buckets[bucket],
        id: this.buckets[bucket],
        public: false,
        file_size_limit: this.config.get('MAX_RECEIPT_SIZE_MB', { infer: true }) * 1024 * 1024,
      }),
    });
    if (!response.ok && response.status !== 409 && response.status !== 422) {
      throw new Error(`Storage bucket setup failed (${response.status}): ${await response.text()}`);
    }
    this.ensuredBuckets.add(bucket);
  }

  private objectUrl(bucket: StorageBucket, key: string): string {
    return `${this.endpoint()}/object/${this.path(bucket, key)}`;
  }

  private path(bucket: StorageBucket, key: string): string {
    return `${this.buckets[bucket]}/${key}`;
  }

  private endpoint(): string {
    if (!this.url || !this.serviceKey) {
      throw new ServiceUnavailableException('Object storage is not configured');
    }
    return `${this.url}/storage/v1`;
  }

  private headers(): Record<string, string> {
    if (!this.serviceKey) {
      throw new ServiceUnavailableException('Object storage is not configured');
    }
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey };
  }
}
