/**
 * Shared API contract constants.
 *
 * In later phases this package also exposes the TypeScript types generated from
 * the NestJS OpenAPI document (`pnpm --filter @eventos/api openapi:generate`).
 */
export const API_PREFIX = 'api/v1' as const;
export const API_DEFAULT_PORT = 4000 as const;

export type { components, paths } from './generated/api';

export const REQUEST_ID_HEADER = 'x-request-id' as const;
export const CSRF_HEADER = 'x-csrf-token' as const;
export const IDEMPOTENCY_HEADER = 'idempotency-key' as const;

export interface ApiErrorShape {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
