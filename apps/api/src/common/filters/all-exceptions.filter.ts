import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorShape } from '../http/api-error';
import { getRequestId } from '../http/request-with-id';

interface HttpExceptionPayload {
  message?: string | string[];
  error?: string;
  code?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let code: string | undefined;

    if (isHttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        error = exception.name;
      } else if (payload && typeof payload === 'object') {
        const typed = payload as HttpExceptionPayload;
        if (typed.message) {
          message = typed.message;
        }
        if (typed.error) {
          error = typed.error;
        }
        if (typed.code) {
          code = typed.code;
        }
      }
    } else {
      const stack = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      this.logger.error('Unhandled exception', stack);
    }

    const body: ApiErrorShape = {
      statusCode,
      error,
      code,
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(request),
    };

    response.status(statusCode).json(body);
  }
}
