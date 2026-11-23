import type { Request } from 'express';
import { getRequestId } from '../http/request-with-id';

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

/** Normalised request metadata used for audit records and session creation. */
export function getRequestContext(request: Request): RequestContext {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.header('user-agent')?.slice(0, 255) ?? null,
    requestId: getRequestId(request) ?? null,
  };
}
