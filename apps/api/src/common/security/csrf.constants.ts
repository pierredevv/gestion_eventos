/**
 * Double-submit CSRF protection.
 *
 * The token is stored in a readable cookie (`csrf_token`) and echoed in the
 * `X-CSRF-Token` header. A cross-site attacker can send the cookie but cannot
 * read it to set the header, because of the same-origin policy.
 */
export const SESSION_COOKIE_NAME = 'session';
export const CSRF_COOKIE_NAME = 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
