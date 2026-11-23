import { randomBytes } from 'node:crypto';
import { decryptToken, encryptToken } from './token-cipher';

describe('token cipher', () => {
  const key = randomBytes(32);

  it('round-trips a token', () => {
    const token = `EVT1:${randomBytes(32).toString('base64url')}`;
    expect(decryptToken(encryptToken(token, key), key)).toBe(token);
  });

  it('uses a fresh IV for every encryption', () => {
    const token = 'EVT1:constant-token';
    expect(encryptToken(token, key)).not.toBe(encryptToken(token, key));
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptToken('EVT1:secret', key);
    const parts = encrypted.split('.');
    const flipped = Buffer.from(parts[2] ?? '', 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], flipped.toString('base64url')].join('.');
    expect(() => decryptToken(tampered, key)).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() => encryptToken('token', randomBytes(16))).toThrow(/32 bytes/);
    expect(() => decryptToken('a.b.c', randomBytes(16))).toThrow(/32 bytes/);
  });
});
