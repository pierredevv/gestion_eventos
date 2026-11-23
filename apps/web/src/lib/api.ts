import { API_PREFIX } from '@eventos/contracts';

/**
 * Browser-side API client.
 *
 * Sessions are opaque httpOnly cookies, so every request uses
 * `credentials: 'include'`. Web and API may live on different domains, so the
 * CSRF token is echoed from the `X-CSRF-Token` response header (exposed by
 * CORS) instead of relying on `document.cookie` from the API domain. The API
 * also validates the request Origin.
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? `http://localhost:4000/${API_PREFIX}`
).replace(/\/+$/, '');

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const prefix = `${name}=`;
  const entry = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return entry?.slice(prefix.length);
}

let csrfToken: string | undefined;
let csrfPending: Promise<void> | null = null;

/** The CSRF middleware sets both a cookie and a readable response header. */
export async function ensureCsrf(): Promise<string | undefined> {
  if (typeof document === 'undefined') return undefined;
  if (csrfToken) return csrfToken;

  const apiOrigin = new URL(API_BASE_URL, window.location.href).origin;
  const sameSite = apiOrigin === window.location.origin;
  // Only read the cookie when it belongs to this document. With Vercel and
  // Railway on different domains the cookie lives on the API origin and is
  // invisible here, so the response header is the only reliable source.
  if (sameSite) {
    csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) return csrfToken;
  }

  csrfPending ??= fetch(`${API_BASE_URL}/health`, { credentials: 'include' })
    .then((response) => {
      csrfToken = response.headers.get(CSRF_HEADER) ?? undefined;
      if (sameSite) csrfToken ??= readCookie(CSRF_COOKIE);
    })
    .catch(() => undefined)
    .finally(() => {
      csrfPending = null;
    });
  await csrfPending;
  return csrfToken;
}

function clearCsrf(): void {
  csrfToken = undefined;
}

async function sendOnce(
  path: string,
  init: RequestInit,
  headers: Headers,
): Promise<{ response: Response; payload: unknown }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const payload: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => null);
  return { response, payload };
}

function toError(response: Response, payload: unknown): ApiRequestError {
  const body =
    payload && typeof payload === 'object'
      ? (payload as { message?: unknown; code?: unknown })
      : {};
  return new ApiRequestError(
    response.status,
    typeof body.message === 'string' ? body.message : `Request failed (${response.status})`,
    typeof body.code === 'string' ? body.code : undefined,
  );
}

async function request<T>(path: string, init: RequestInit = {}, multipart = false): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!multipart && init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!SAFE_METHODS.has(method)) {
    const csrf = await ensureCsrf();
    if (csrf) headers.set(CSRF_HEADER, csrf);
  }

  let { response, payload } = await sendOnce(path, init, headers);

  // A session-scoped cookie may have disappeared. The first request was
  // rejected before reaching the handler, so retrying cannot duplicate work.
  const errorCode =
    payload && typeof payload === 'object' ? (payload as { code?: unknown }).code : undefined;
  if (response.status === 403 && errorCode === 'CSRF_INVALID') {
    clearCsrf();
    const csrf = await ensureCsrf();
    if (csrf) {
      headers.set(CSRF_HEADER, csrf);
      ({ response, payload } = await sendOnce(path, init, headers));
    }
  }

  if (!response.ok) throw toError(response, payload);
  return payload as T;
}

export function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
}

export function apiSend<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Multipart uploads must not set Content-Type so the browser adds the boundary. */
export function apiUpload<T>(path: string, body: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body }, true);
}

export function apiText(path: string): Promise<string> {
  return fetch(`${API_BASE_URL}${path}`, { credentials: 'include' }).then((response) => {
    if (!response.ok)
      throw new ApiRequestError(response.status, `Request failed (${response.status})`);
    return response.text();
  });
}
