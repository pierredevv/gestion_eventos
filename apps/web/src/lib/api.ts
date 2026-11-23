import { API_PREFIX } from '@eventos/contracts';

/**
 * Browser-side API client.
 *
 * Sessions are opaque httpOnly cookies, so every request uses
 * `credentials: 'include'`. Unsafe methods echo the readable `csrf_token`
 * cookie in `X-CSRF-Token` (double submit); the API also checks Origin.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? `http://localhost:4000/${API_PREFIX}`;

const CSRF_COOKIE = 'csrf_token';
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

let csrfPending: Promise<void> | null = null;

/** The CSRF middleware sets the cookie on any request, including /health. */
export async function ensureCsrf(): Promise<string | undefined> {
  if (typeof document === 'undefined') return undefined;
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  csrfPending ??= fetch(`${API_BASE_URL}/health`, { credentials: 'include' })
    .then(() => undefined)
    .finally(() => {
      csrfPending = null;
    });
  await csrfPending;
  return readCookie(CSRF_COOKIE);
}

async function request<T>(path: string, init: RequestInit = {}, multipart = false): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!multipart && init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!SAFE_METHODS.has(method)) {
    const csrf = await ensureCsrf();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const body =
      payload && typeof payload === 'object'
        ? (payload as { message?: unknown; code?: unknown })
        : {};
    throw new ApiRequestError(
      response.status,
      typeof body.message === 'string' ? body.message : `Request failed (${response.status})`,
      typeof body.code === 'string' ? body.code : undefined,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
}

export function apiSend<T>(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
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
    if (!response.ok) throw new ApiRequestError(response.status, `Request failed (${response.status})`);
    return response.text();
  });
}
