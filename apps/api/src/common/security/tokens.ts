import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque tokens are 256 bits of entropy encoded as base64url (43 chars).
 * They are shown to the client exactly once; the database stores only the hash.
 */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

/**
 * SHA-256 is appropriate here (not Argon2) because the input is a high-entropy
 * random token, so brute force is infeasible. Argon2 is used for passwords.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison for already-hashed or random tokens of equal length. */
export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
