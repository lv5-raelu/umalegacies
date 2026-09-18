import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DomainError, type ErrorResponse } from './error-response.js';
import { ErrorFilter } from './error.filter.js';

/**
 * The single error shape, and the promise that nothing escapes it.
 *
 * packages/api/src/common/ had no test file at all until this one, which is a
 * gap worth naming: this filter is the only thing standing between a thrown
 * value and the response body, so it decides both what a client can branch on
 * and what a stack trace is allowed to leak.
 */

interface Captured {
  status: number;
  body: ErrorResponse;
  headers: Record<string, string>;
}

/**
 * The smallest ArgumentsHost that this filter actually touches.
 *
 * A Nest testing module would boot an application to exercise four branches of
 * one method. M0 chose fixtures over testing-module setups for exactly this
 * reason, and the filter's contract is narrow enough to state directly:
 * setHeader, status, json.
 */
function capture(): { host: ArgumentsHost; result: Captured } {
  const result: Captured = { status: 0, body: { code: '', message: '' }, headers: {} };
  const response = {
    setHeader(name: string, value: string) {
      result.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: ErrorResponse) {
      result.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, result };
}

function thrown(exception: unknown): Captured {
  const { host, result } = capture();
  new ErrorFilter().catch(exception, host);
  return result;
}

describe('every error leaves as an ErrorResponse', () => {
  it('passes a DomainError through with its own code, status and field', () => {
    const r = thrown(new DomainError('INVALID_FIELD', 'traineeCharaId must be an integer.', 400, 'traineeCharaId'));
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      code: 'INVALID_FIELD',
      message: 'traineeCharaId must be an integer.',
      field: 'traineeCharaId',
    });
  });

  it('omits field entirely when the problem is not attributable to one', () => {
    const r = thrown(new DomainError('STALE_MASTER_HASH', 'The extract moved.', 409));
    expect(r.status).toBe(409);
    expect('field' in r.body, 'an absent field must be absent, not undefined').toBe(false);
  });

  it('carries a boot failure through at its own status', () => {
    // What MasterService throws when the master data could not be loaded.
    const r = thrown(new DomainError('MASTER_DB_MISSING', 'master.mdb not readable at /x.', 503));
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('MASTER_DB_MISSING');
  });

  it('maps a Nest HttpException onto the same shape', () => {
    expect(thrown(new NotFoundException('nope'))).toMatchObject({
      status: 404,
      body: { code: 'NOT_FOUND' },
    });
    expect(thrown(new BadRequestException('nope'))).toMatchObject({
      status: 400,
      body: { code: 'BAD_REQUEST' },
    });
  });

  /**
   * body-parser rejects an oversized body with a PayloadTooLargeError, which is
   * a plain Error and NOT an HttpException, so it used to fall through to the
   * generic 500 and tell the client the SERVER broke when the CLIENT sent too
   * much. The check is structural because body-parser is a transitive
   * dependency and importing its error class would couple this to an internal
   * of Express's plumbing.
   */
  it.each([
    ['type', { type: 'entity.too.large' }],
    ['status', { status: 413 }],
    ['statusCode', { statusCode: 413 }],
  ])('recognises an oversized body by its %s', (_label, shape) => {
    const r = thrown(Object.assign(new Error('request entity too large'), shape));
    expect(r.status).toBe(413);
    expect(r.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('never returns the internals of an unrecognised error', () => {
    const leaky = new Error('SELECT * FROM card_data WHERE /Users/raelu/secret/path.sql');
    const r = thrown(leaky);
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal error.' });
    expect(r.body.message).not.toContain('SELECT');
    expect(r.body.message, 'a filesystem path must never reach a response body').not.toContain('/Users');
  });

  it('handles a thrown non-Error without becoming one itself', () => {
    expect(thrown('a bare string').body.code).toBe('INTERNAL_ERROR');
    expect(thrown(null).body.code).toBe('INTERNAL_ERROR');
    expect(thrown(undefined).body.code).toBe('INTERNAL_ERROR');
  });
});

describe('no error is ever cacheable', () => {
  /**
   * A @Header() decorator applies BEFORE the handler runs, so a route carrying
   * `s-maxage=86400` -- /roster/trainees does -- hands that lifetime to its own
   * failures. A 503 from a boot failure would then be served from the CDN for a
   * day after the deployment was fixed.
   */
  it.each([
    ['a domain error', new DomainError('MASTER_DB_MISSING', 'gone', 503)],
    ['an http exception', new NotFoundException('nope')],
    ['an oversized body', Object.assign(new Error('too big'), { type: 'entity.too.large' })],
    ['an unrecognised throw', new Error('boom')],
  ])('sets no-store on %s', (_label, exception) => {
    expect(thrown(exception).headers['cache-control']).toBe('no-store');
  });
});
