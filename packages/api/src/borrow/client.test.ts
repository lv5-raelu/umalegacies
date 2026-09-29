import { describe, expect, it } from 'vitest';
import { KEY_ENV } from './api-key.js';
import { BORROWED_RECORD } from './fixture.js';
import { UmaMoeUnavailable, searchBorrowable } from './client.js';

/**
 * The paging, against a fake uma.moe rather than the real one.
 *
 * NOT hitting the live API, deliberately. It is somebody else's service run
 * for their users, and a test suite that calls it on every `npm test` is a
 * load generator with good intentions. What the live API settled -- no
 * reachable rate limit, limit clamps at 100, 0-indexed pages, stable order --
 * was measured once and written down in `TODOS.md` #3; what is checked here is
 * OUR half: that we page correctly, stay within the concurrency we promised,
 * stop where we said we would, and refuse loudly.
 */

const env = { [KEY_ENV]: 'test-key' };

/** A server holding `count` records, `limit` to a page. */
function fakeServer(count: number, limit = 100) {
  const calls: URL[] = [];
  let inFlight = 0;
  let peak = 0;

  const fetchImpl = (async (url: string) => {
    calls.push(new URL(url));
    inFlight++;
    peak = Math.max(peak, inFlight);
    // A tick, so overlapping requests actually overlap.
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;

    const parsed = new URL(url);
    const page = Number(parsed.searchParams.get('page'));
    const size = Number(parsed.searchParams.get('limit'));
    const from = page * size;
    const items = Array.from({ length: Math.max(0, Math.min(size, count - from)) }, (_, i) => ({
      inheritance: { ...BORROWED_RECORD, inheritance_id: from + i + 1 },
    }));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items,
        total: String(count),
        page,
        limit: size,
        total_pages: Math.ceil(count / size),
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { fetchImpl, calls, peak: () => peak, limit };
}

describe('paging the pool', () => {
  it('fetches page 0 first and every later page after it', async () => {
    const server = fakeServer(250);
    const result = await searchBorrowable({ params: new URLSearchParams(), fetchImpl: server.fetchImpl, env });
    expect(result.packages).toHaveLength(250);
    expect(result.pagesFetched).toBe(3);
    // Page 0 is a real first page, not an alias for page 1. Measured against
    // the live API: pages 0, 1 and 2 return three distinct sets.
    expect(server.calls[0]?.searchParams.get('page')).toBe('0');
    expect(server.calls.map((u) => u.searchParams.get('page')).sort()).toEqual(['0', '1', '2']);
  });

  it('says how big the pool is in their words, cap and all', async () => {
    const server = fakeServer(120);
    const result = await searchBorrowable({ params: new URLSearchParams(), fetchImpl: server.fetchImpl, env });
    // Passed through as a STRING. Their "over 10000" is a display cap, not a
    // count -- paging past it returns more, distinct records -- so parsing it
    // to a number would state a pool size nobody knows.
    expect(result.total).toBe('120');
    expect(result.truncated).toBe(false);
  });

  it('keeps no more than `concurrency` pages in flight', async () => {
    // This is a politeness promise, not a performance one. The probe reached
    // 8-way without complaint and this stays at half of it.
    const server = fakeServer(1000);
    await searchBorrowable({
      params: new URLSearchParams(),
      fetchImpl: server.fetchImpl,
      concurrency: 3,
      env,
    });
    expect(server.peak()).toBeLessThanOrEqual(3);
    expect(server.peak()).toBeGreaterThan(1);
  });
});

describe('the ceiling on how much one search may take', () => {
  it('stops at maxRecords and says the result was cut', async () => {
    const server = fakeServer(1000);
    const result = await searchBorrowable({
      params: new URLSearchParams(),
      fetchImpl: server.fetchImpl,
      maxRecords: 150,
      env,
    });
    expect(result.packages).toHaveLength(150);
    expect(result.truncated).toBe(true);
    // And it did not walk the whole pool to find that out.
    expect(result.pagesFetched).toBe(2);
  });

  it('does NOT call a complete result truncated just because it filled the cap', async () => {
    // The distinction the flag exists for. 200 records with a cap of 200 is the
    // whole pool; labelling it "the best of the first 200" would send the
    // reader off to narrow a filter that is already as narrow as the pool.
    const server = fakeServer(200);
    const result = await searchBorrowable({
      params: new URLSearchParams(),
      fetchImpl: server.fetchImpl,
      maxRecords: 200,
      env,
    });
    expect(result.packages).toHaveLength(200);
    expect(result.truncated).toBe(false);
  });
});

describe('what the caller may and may not ask for', () => {
  it('clamps limit to their cap instead of letting the server clamp it silently', async () => {
    // limit=500 returns 100 items and the same 205 KB. Asking for what we can
    // actually get keeps `pagesFetched` and `maxRecords` arithmetic honest.
    const server = fakeServer(50);
    await searchBorrowable({ params: new URLSearchParams(), fetchImpl: server.fetchImpl, limit: 500, env });
    expect(server.calls[0]?.searchParams.get('limit')).toBe('100');
  });

  it('forces search_type, so a filter cannot widen the query to support cards', async () => {
    const server = fakeServer(10);
    await searchBorrowable({
      params: new URLSearchParams({ search_type: 'all', blue_sparks: '209' }),
      fetchImpl: server.fetchImpl,
      env,
    });
    expect(server.calls[0]?.searchParams.get('search_type')).toBe('inheritance');
    // ...while leaving the caller's actual filter alone.
    expect(server.calls[0]?.searchParams.get('blue_sparks')).toBe('209');
  });

  it('sends the key as a header and never in the query string', async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push(init);
      expect(String(url)).not.toContain('test-key');
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], total: '0', total_pages: 0 }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    await searchBorrowable({ params: new URLSearchParams(), fetchImpl, env });
    expect((seen[0]?.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
  });
});

describe('when uma.moe refuses', () => {
  it('names the status and the page rather than returning an empty pool', async () => {
    // An empty result would read as "nobody is lending a veteran like that",
    // which is a claim about the pool rather than about the request.
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 429,
        text: async () => 'slow down',
      }) as unknown as Response) as unknown as typeof fetch;

    await expect(
      searchBorrowable({ params: new URLSearchParams(), fetchImpl, env }),
    ).rejects.toThrow(UmaMoeUnavailable);
  });

  it('backs off on the status code alone, because no header ever carries a hint', async () => {
    // Measured: no `Retry-After` and no `X-RateLimit-*` appears on any
    // response, and the OpenAPI spec documents no limit. The code is the
    // entire signal, so there is nothing to retry against and we do not.
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return { ok: false, status: 503, text: async () => '' } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(
      searchBorrowable({ params: new URLSearchParams(), fetchImpl, env }),
    ).rejects.toMatchObject({ code: 'UMA_MOE_UNAVAILABLE' });
    expect(calls).toBe(1);
  });
});

describe('a record that is not a lineage', () => {
  it('is counted and skipped, never fatal to the page it arrived on', async () => {
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { inheritance: { ...BORROWED_RECORD, inheritance_id: 1 } },
            { inheritance: null },
            {},
            { inheritance: { ...BORROWED_RECORD, inheritance_id: 2, main_parent_id: 0 } },
          ],
          total: '4',
          total_pages: 1,
        }),
      }) as unknown as Response) as unknown as typeof fetch;

    const result = await searchBorrowable({ params: new URLSearchParams(), fetchImpl, env });
    expect(result.packages).toHaveLength(1);
    expect(result.unusable).toBe(3);
  });

  it('does not list the same borrowable veteran twice', async () => {
    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { inheritance: { ...BORROWED_RECORD, inheritance_id: 9 } },
            { inheritance: { ...BORROWED_RECORD, inheritance_id: 9 } },
          ],
          total: '2',
          total_pages: 1,
        }),
      }) as unknown as Response) as unknown as typeof fetch;

    const result = await searchBorrowable({ params: new URLSearchParams(), fetchImpl, env });
    expect(result.packages).toHaveLength(1);
  });
});
