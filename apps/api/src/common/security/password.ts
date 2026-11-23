import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

/**
 * OWASP-recommended baseline for Argon2id (19 MiB, 2 iterations, 1 lane).
 * Changing these parameters invalidates nothing: Argon2 embeds them in the hash.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

export function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  return argon2.verify(hash, plainPassword);
}

/**
 * Verifies a password against a throwaway hash so that a login attempt for an
 * unknown email costs the same as one for a known email. Prevents timing-based
 * user enumeration.
 */
let dummyHashPromise: Promise<string> | undefined;

export async function verifyAgainstDummyHash(plainPassword: string): Promise<false> {
  dummyHashPromise ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(await dummyHashPromise, plainPassword);
  return false;
}

/**
 * Returns a human-readable problem, or `null` when the policy is satisfied.
 * Kept as a pure function so it can be unit tested without touching the network.
 */
export function checkPasswordPolicy(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `must be at least ${PASSWORD_MIN_LENGTH} characters long`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `must be at most ${PASSWORD_MAX_LENGTH} characters long`;
  }
  if (!/[a-z]/.test(password)) {
    return 'must contain a lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'must contain an uppercase letter';
  }
  if (!/\d/.test(password)) {
    return 'must contain a digit';
  }
  return null;
}
