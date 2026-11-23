import { API_PREFIX } from '@eventos/contracts';

/**
 * Browser-side API client.
 *
 * Uses `credentials: 'include'` because sessions are opaque httpOnly cookies.
 * Domain errors are surfaced as `ApiRequestError` so UI layers can branch on
 * `statusCode` instead of parsing messages.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? `http://localhost:4000/${API_PREFIX}`;

export class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : `Request failed with status ${response.status}`;
    throw new ApiRequestError(response.status, message);
  }

  return (await response.json()) as T;
}
