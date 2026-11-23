import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * AES-256-GCM encryption for high-entropy ticket tokens (ADR 0006).
 *
 * The payload format is `base64(iv).base64(authTag).base64(ciphertext)`.
 * The auth tag makes any tampering detectable instead of producing garbage.
 */
export function encryptToken(token: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptToken(payload: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes');
  }
  const parts = payload.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('Invalid encrypted token format');
  }
  const iv = Buffer.from(parts[0], 'base64url');
  const tag = Buffer.from(parts[1], 'base64url');
  const ciphertext = Buffer.from(parts[2], 'base64url');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
