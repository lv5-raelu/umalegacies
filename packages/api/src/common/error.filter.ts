import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, type ErrorResponse } from './error-response';

/**
 * Normalises every thrown value into ErrorResponse, so a client never has to
 * parse two error shapes. Unrecognised errors are logged with their stack and
 * returned as an opaque 500: an internal message could carry a filesystem path
 * or a SQL fragment, and neither belongs in a response body.
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      const body: ErrorResponse = {
        code: exception.code,
        message: exception.message,
      };
      if (exception.field !== undefined) body.field = exception.field;
      response.status(exception.status).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        code: httpCodeFor(status),
        message: exception.message,
      } satisfies ErrorResponse);
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal error.',
    } satisfies ErrorResponse);
  }
}

function httpCodeFor(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 404:
      return 'NOT_FOUND';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED';
  }
}
