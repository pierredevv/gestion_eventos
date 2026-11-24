/** Buckets are private; every read goes through a short-lived signed URL. */
export type StorageBucket = 'receipts' | 'ticket-assets';

export interface UploadObjectInput {
  bucket: StorageBucket;
  key: string;
  data: Buffer;
  contentType: string;
}

/**
 * Port for object storage. Keeping an abstraction lets integration tests use
 * an in-memory adapter without touching the real Supabase project.
 */
export abstract class StorageService {
  abstract upload(input: UploadObjectInput): Promise<void>;
  abstract createSignedUrl(bucket: StorageBucket, key: string, expiresInSeconds: number): Promise<string>;
  abstract remove(bucket: StorageBucket, key: string): Promise<void>;
}
