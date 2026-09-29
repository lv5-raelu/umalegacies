import type { VeteranPackage } from '@umalegacies/types';
import { DomainError } from '@umalegacies/core';
import { umaMoeApiKey } from './api-key.js';
import { packageFromRecord, recordKey, type UmaMoeSearchResponse } from './record.js';

/**
 * THE BORROW POOL, PAGED.
 *
 * WHY THIS IS A FILTERED SWEEP AND NOT A SHORTLIST. Measured 2026-09-24 and
 * recorded in `TODOS.md` #3: there is no reachable rate limit -- ~140 requests
 * escalating to 8-way concurrency were all 200, with latency FLAT under
 * concurrency, which is the signature of no throttle rather than a generous
 * one. What binds instead is three other numbers:
 *
 *   limit caps at 100            the server clamps silently; limit=500 returns 100
 *   a record is ~2 KB            so a full page is ~205 KB
 *   total is display-capped      "over 10000" is a ceiling on the DISPLAY, not
 *                                the pool; total_pages is just ceil(cap/limit)
 *
 * So the pool is not something to pull whole -- 10,000+ records is ~21 MB for a
 * question the server can answer in one query -- and not something to sample
 * either, because the server will happily serve whatever is asked for. A
 * realistic filtered pool of ~1,111 records is 12 pages, ~2.4 MB, about 4
 * seconds at concurrency 4. That is a progress bar, not an architecture.
 *
 * THE POLITENESS RULE, which is not negotiable and is why the defaults are
 * where they are. This is somebody else's service, running for their users.
 * Concurrency is 4 rather than the 8 the probe reached, `maxRecords` exists so
 * a mis-built filter cannot walk the whole pool, and a non-200 aborts the
 * remaining pages instead of retrying. The probe already established that no
 * `Retry-After` or `X-RateLimit` header is ever sent, so if a 429 ever does
 * appear the status code is the entire signal and backing off on it is the
 * only correct response.
 */

/** Their cap, enforced server-side. Asking for more silently returns this. */
export const MAX_LIMIT = 100;

/** Pages in flight at once. Half what the probe reached without complaint. */
export const DEFAULT_CONCURRENCY = 4;

/**
 * How many records one search may pull before it stops and says so.
 *
 * 2,000 is 20 pages and ~4 MB. It is not a guess about what is reasonable to
 * fetch; it is a guess about what is reasonable to SWEEP. 2,000 borrowed
 * halves against 259 own veterans is 518,000 pairs, which at the measured
 * 0.072 ms per pair is already ~37 seconds of scoring -- so a pool bigger than
 * this is a filter that needs narrowing, not a fetch that needs to be faster.
 */
export const DEFAULT_MAX_RECORDS = 2_000;

export const SEARCH_URL = 'https://uma.moe/api/v3/search';

export class UmaMoeUnavailable extends DomainError {
  constructor(status: number, page: number, body: string) {
    super(
      'UMA_MOE_UNAVAILABLE',
      `uma.moe answered ${status} for page ${page}. ${body.slice(0, 200)}`,
    );
  }
}

export interface BorrowSearch {
  /**
   * The filter, already translated into their vocabulary.
   *
   * Taken as built rather than as criteria, because translating our scopes into
   * their exact-sum OR-lists is its own problem with its own soundness
   * argument, and mixing it into the transport would make neither testable.
   */
  params: URLSearchParams;
  limit?: number;
  maxRecords?: number;
  concurrency?: number;
  /** Cancels the pages not yet fetched. */
  signal?: AbortSignal;
  /** Injected in tests. Defaults to the global. */
  fetchImpl?: typeof fetch;
  /**
   * Injected in tests, so no test ever needs the developer's real key. In
   * production this is absent and `umaMoeApiKey` reads `process.env` and the
   * file, in that order.
   */
  env?: Record<string, string | undefined>;
}

export interface BorrowResult {
  /** Borrowable veterans, in the order uma.moe returned them. */
  packages: VeteranPackage[];
  /**
   * Their `total` verbatim, which is a numeric string OR the literal
   * `"over 10000"`. Passed through rather than parsed to a number, because
   * turning the display cap into 10000 would state a pool size that is not
   * known -- paging past it returns more, distinct records.
   */
  total: string;
  pagesFetched: number;
  /**
   * True when `maxRecords` stopped the fetch before the pool ran out, so the
   * caller can say "the best of the first 2,000" rather than "the best".
   */
  truncated: boolean;
  /** Records that arrived but could not be a package at all. See `packageFromRecord`. */
  unusable: number;
}

async function fetchPage(
  search: BorrowSearch,
  page: number,
  limit: number,
  key: string,
): Promise<UmaMoeSearchResponse> {
  const query = new URLSearchParams(search.params);
  // `search_type` last and unconditional: a caller's filter must not be able to
  // widen this to support cards, which carry no lineage and would arrive as a
  // page of records `packageFromRecord` rejects one by one.
  query.set('search_type', 'inheritance');
  query.set('limit', String(limit));
  query.set('page', String(page));

  const doFetch = search.fetchImpl ?? fetch;
  const response = await doFetch(`${SEARCH_URL}?${query.toString()}`, {
    headers: { 'X-API-Key': key, Accept: 'application/json' },
    ...(search.signal ? { signal: search.signal } : {}),
  });
  if (!response.ok) {
    throw new UmaMoeUnavailable(response.status, page, await response.text().catch(() => ''));
  }
  return (await response.json()) as UmaMoeSearchResponse;
}

/**
 * Every borrowable veteran the filter admits, up to `maxRecords`.
 *
 * PAGE 0 FIRST, ALONE, and the rest in parallel behind it. Measured: paging is
 * 0-indexed and page 0 is a distinct first page, not an alias for page 1. The
 * first page is what says how many there are, so fanning out before it has
 * landed would mean either guessing the page count or fetching pages that do
 * not exist.
 */
export async function searchBorrowable(search: BorrowSearch): Promise<BorrowResult> {
  const key = umaMoeApiKey(search.env ? { env: search.env } : {});
  const limit = Math.min(search.limit ?? MAX_LIMIT, MAX_LIMIT);
  const maxRecords = search.maxRecords ?? DEFAULT_MAX_RECORDS;
  const concurrency = Math.max(1, search.concurrency ?? DEFAULT_CONCURRENCY);

  const first = await fetchPage(search, 0, limit, key);
  const total = first.total ?? '0';

  // `total_pages` is computed from the DISPLAY cap, so at limit=100 it reads
  // 101 however large the pool is and 5001 when the cap moves. It is an upper
  // bound worth respecting and not a count worth believing, hence the min with
  // what we are willing to take.
  const wantPages = Math.ceil(maxRecords / limit);
  const lastPage = Math.min(first.total_pages ?? wantPages, wantPages) - 1;

  const pages: UmaMoeSearchResponse[] = [first];
  let pagesFetched = 1;

  // A fixed-size pool of workers pulling from one cursor, rather than batches:
  // batches run at the speed of their slowest page and leave the link idle
  // while the last one finishes.
  let next = 1;
  const worker = async (): Promise<void> => {
    for (;;) {
      const page = next++;
      if (page > lastPage) return;
      if (search.signal?.aborted === true) return;
      pages[page] = await fetchPage(search, page, limit, key);
      pagesFetched++;
    }
  };
  if (lastPage >= 1) {
    await Promise.all(Array.from({ length: Math.min(concurrency, lastPage) }, worker));
  }

  const all: VeteranPackage[] = [];
  const seen = new Set<number>();
  let unusable = 0;
  for (const page of pages) {
    for (const record of page?.items ?? []) {
      const id = recordKey(record);
      if (id !== null && seen.has(id)) continue;
      const veteran = packageFromRecord(record);
      if (!veteran) {
        unusable++;
        continue;
      }
      if (id !== null) seen.add(id);
      all.push(veteran);
    }
  }

  /*
   * TRUNCATED MEANS "THERE WAS MORE", not "we stopped".
   *
   * The two come apart when the pool ends exactly on the last page we were
   * willing to take: an earlier cut returned the moment it had `maxRecords`
   * packages, which labelled a COMPLETE result as "the best of the first
   * 2,000" and invited the reader to go and narrow a filter that was already
   * as narrow as the pool.
   *
   * So it is asked afterwards, of the two things that can actually cut a
   * result short: more pages existed than we asked for, or the pages we did
   * ask for held more records than we will keep.
   */
  const askedFewerPages = (first.total_pages ?? 0) > lastPage + 1;
  const packages = all.slice(0, maxRecords);
  return {
    packages,
    total,
    pagesFetched,
    truncated: askedFewerPages || all.length > maxRecords,
    unusable,
  };
}
