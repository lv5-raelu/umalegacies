import { afterEach, describe, expect, it } from 'vitest';
import { DomainError } from '@umalegacies/core';
import { MasterService } from './master.service.js';

/**
 * What happens when the master data is unusable.
 *
 * This is the failure the whole product is most exposed to -- every number it
 * exists to produce comes from one file -- and it is also the one least visible
 * in a test suite, because the suite always has a good extract.
 *
 * It used to throw out of `onModuleInit`, which runs INSIDE
 * `NestFactory.create`. That reads like "refuse to start dirty" and behaves that
 * way locally, but on a serverless platform there is no long-lived process to
 * refuse: the function simply dies before any route exists. The deployment
 * returned FUNCTION_INVOCATION_FAILED with an empty body, and the named cause
 * was visible only in the platform log.
 *
 *   before   onModuleInit throws ──► no app ──► FUNCTION_INVOCATION_FAILED
 *   after    onModuleInit stores ──► app runs ──► 503 MASTER_DB_MISSING,
 *                                                 with the fix in the message
 *
 * Nothing serves numbers from bad data either way. The difference is whether
 * the caller is told why.
 */

const ORIGINAL = process.env.MASTER_DB_PATH;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MASTER_DB_PATH;
  else process.env.MASTER_DB_PATH = ORIGINAL;
});

/** Boots a service against a master.mdb that is not there. */
async function bootBroken(): Promise<MasterService> {
  process.env.MASTER_DB_PATH = '/nonexistent/not-a-master-database.mdb';
  const service = new MasterService();
  await service.onModuleInit();
  return service;
}

describe('a master database that cannot be loaded', () => {
  it('does not take the application down with it', async () => {
    // The assertion IS that this resolves. A rejection here is the old
    // behaviour, and on Vercel it costs every route rather than just this one.
    await expect(bootBroken()).resolves.toBeInstanceOf(MasterService);
  });

  it('answers getMeta with the named code, not a generic failure', async () => {
    const service = await bootBroken();
    expect(() => service.getMeta()).toThrow(DomainError);

    try {
      service.getMeta();
      expect.unreachable('getMeta returned data from a database that failed to load');
    } catch (error) {
      const domain = error as DomainError;
      expect(domain.code).toBe('MASTER_DB_MISSING');
      expect(domain.status, '503: the request is fine, the server is not').toBe(503);
      // The message carries the fix. Losing it would leave a correct code and
      // no way to act on it.
      expect(domain.message).toContain('not-a-master-database.mdb');
    }
  });

  it('refuses the data accessor too, so no number is computed from it', async () => {
    const service = await bootBroken();
    // A getter, so it has to be touched rather than called.
    expect(() => service.data).toThrow(DomainError);
    try {
      void service.data;
      expect.unreachable('data returned a MasterData built from a failed load');
    } catch (error) {
      expect((error as DomainError).code).toBe('MASTER_DB_MISSING');
    }
  });

  it('is not thrown as a plain Error, which the filter would hide as a 500', async () => {
    const service = await bootBroken();
    try {
      service.getMeta();
      expect.unreachable('expected a throw');
    } catch (error) {
      // error.filter.ts turns anything that is NOT a DomainError or
      // HttpException into an opaque INTERNAL_ERROR, logging the internals and
      // returning nothing useful -- which is what this whole change is undoing.
      expect(
        error instanceof DomainError,
        'a non-DomainError here becomes an opaque 500 and the code is lost',
      ).toBe(true);
    }
  });
});

describe('a master database that loads cleanly', () => {
  it('serves its metadata, with the content checks passed', async () => {
    delete process.env.MASTER_DB_PATH;
    const service = new MasterService();
    await service.onModuleInit();

    const meta = service.getMeta();
    expect(meta.source).toBe('extract');
    expect(meta.masterHash).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.tables.succession_relation).toBeGreaterThan(0);
    expect(() => service.data).not.toThrow();
  });
});
