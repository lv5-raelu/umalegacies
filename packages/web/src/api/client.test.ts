import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, fetchTrainees, resolveRoster } from './client';

describe('ApiError', () => {
  it('carries the code and optional field from ErrorResponse', () => {
    const error = new ApiError('BAD_REQUEST', 'traineeCharaId is required', 'traineeCharaId');
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.field).toBe('traineeCharaId');
    expect(error).toBeInstanceOf(Error);
  });

  it('leaves field undefined when the error is not field-attributable', () => {
    expect(new ApiError('INTERNAL_ERROR', 'Internal error.').field).toBeUndefined();
  });
});

/**
 * The request path itself, which had no test at all until now.
 *
 * `get` and `post` used to be the same fourteen lines twice. Nothing exercised
 * either copy, which is how their shared error message came to describe a CORS
 * allowlist in two places after CORS was deleted. Both verbs now route through
 * one `request`, and these pin what a caller is told when it fails.
 */
describe('what a caller is told when a request fails', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  /** fetch rejecting is all the browser gives us before a response exists. */
  function fetchRejects(): void {
    globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
  }

  function fetchAnswers(status: number, body: unknown): void {
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => (body === undefined ? Promise.reject(new Error('not json')) : Promise.resolve(body)),
      })) as unknown as typeof fetch;
  }

  it('reports a dead connection as NETWORK_ERROR, on both verbs', async () => {
    fetchRejects();
    await expect(fetchTrainees()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    fetchRejects();
    await expect(resolveRoster([])).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('no longer blames a CORS allowlist that does not exist', async () => {
    fetchRejects();
    await expect(fetchTrainees()).rejects.toThrow(/deployment may be starting up/i);
    fetchRejects();
    await expect(fetchTrainees()).rejects.not.toThrow(/CORS/i);
  });

  it("surfaces the API's own code and field rather than the status", async () => {
    fetchAnswers(400, { code: 'INVALID_FIELD', message: 'cardId must be an integer.', field: 'cardId' });
    await expect(resolveRoster([])).rejects.toMatchObject({
      code: 'INVALID_FIELD',
      field: 'cardId',
      message: 'cardId must be an integer.',
    });
  });

  it('carries a boot failure through as its own code', async () => {
    fetchAnswers(503, { code: 'MASTER_DB_MISSING', message: 'master.mdb not readable.' });
    await expect(fetchTrainees()).rejects.toMatchObject({ code: 'MASTER_DB_MISSING' });
  });

  it('falls back to the status when the body is not an ErrorResponse', async () => {
    // What an unmatched path returns: the platform answers, not this API.
    fetchAnswers(404, undefined);
    await expect(fetchTrainees()).rejects.toMatchObject({ code: 'UNKNOWN_ERROR' });
    await expect(fetchTrainees()).rejects.toThrow(/failed with 404/);
  });
});
