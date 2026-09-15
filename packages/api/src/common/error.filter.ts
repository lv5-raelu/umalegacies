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

    // body-parser rejects an oversized body with a PayloadTooLargeError, which
    // is a plain Error and NOT a Nest HttpException, so it fell through to the
    // generic 500 below and told the client the SERVER broke when the CLIENT
    // sent too much. The `case 413` in httpCodeFor was written for this and was
    // unreachable until now.
    if (isPayloadTooLarge(exception)) {
      response.status(413).json({
        code: httpCodeFor(413),
        message:
          'Request body is too large. A lineage is six ancestors; it should be a ' +
          'few kilobytes, not megabytes.',
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

/**
 * Structural check, not an instanceof: body-parser is a transitive dependency
 * and importing its error class to test one field would couple this filter to
 * an internal of Express's plumbing.
 */
function isPayloadTooLarge(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const e = exception as { type?: unknown; status?: unknown; statusCode?: unknown };
  return e.type === 'entity.too.large' || e.status === 413 || e.statusCode === 413;
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
