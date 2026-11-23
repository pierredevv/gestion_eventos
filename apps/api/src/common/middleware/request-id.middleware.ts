import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { RequestWithId } from '../http/request-with-id';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Propagates a trusted incoming request id or generates a new one.
 * Correlates logs and audit records with a single request.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

  (req as RequestWithId).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
