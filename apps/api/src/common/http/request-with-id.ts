import type { Request } from 'express';

/**
 * Express request enriched with the correlation id assigned by
 * `requestIdMiddleware`. Declared locally instead of augmenting the global
 * Express namespace, which differs between @types/express versions.
 */
export type RequestWithId = Request & { requestId: string };

export function getRequestId(request: Request): string | undefined {
  return (request as Partial<RequestWithId>).requestId;
}
