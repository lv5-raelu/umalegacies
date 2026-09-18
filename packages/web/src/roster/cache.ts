import type { CachedRoster } from './cache-policy';
import type { CachedSelection } from './selection';

/**
 * The roster, kept in this browser between visits.
 *
 * IndexedDB rather than localStorage for two reasons. The resolved roster is
 * ~378 KB for 259 veterans, which is a real fraction of localStorage's ~5 MB;
 * and localStorage is synchronous, so writing it would block the main thread at
 * exactly the moment the list is being rendered.
 *
 * EVERY OPERATION SWALLOWS ITS ERRORS, and that is the design rather than
 * laziness. Storage is unavailable in more situations than it is worth
 * enumerating -- private windows, disabled site data, a full quota, a browser
 * mid-upgrade -- and in all of them the correct behaviour is the behaviour this
 * app had before the cache existed: show the drop zone and read the file. A
 * cache that can throw is worse than no cache, because it turns a convenience
 * into a way for the whole page to fail.
 *
 * The DECISION about whether a record may be used lives in cache-policy.ts,
 * which is pure and tested. This file is only the I/O.
 */

const DB_NAME = 'umalegacies';
const DB_VERSION = 1;
const STORE = 'roster';
/** One roster at a time. Loading a different file replaces it. */
const KEY = 'current';
/**
 * The trainee, the filters and the pair, under their own key.
 *
 * SEPARATE FROM THE ROSTER ON PURPOSE. The roster is ~378 KB and is written
 * once per file; this is a few dozen bytes rewritten on every click. Sharing a
 * key would mean rewriting the whole roster to remember that a filter moved,
 * on the main thread, while the list is rendering.
 */
const SELECTION_KEY = 'selection';

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Throws outright where site data is blocked.
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // A blocked upgrade never settles either handler; do not hang the load.
    request.onblocked = () => resolve(null);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
  fallback: T,
): Promise<T> {
  const db = await open();
  if (!db) return fallback;
  try {
    return await new Promise<T>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(fallback);
      tx.onabort = () => resolve(fallback);
      tx.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  } finally {
    db.close();
  }
}

/** Whatever is stored, untrusted. Hand it to `inspectCache` before using it. */
export function readRoster(): Promise<unknown> {
  return withStore<unknown>('readonly', (store) => store.get(KEY), null);
}

export async function writeRoster(record: CachedRoster): Promise<void> {
  await withStore('readwrite', (store) => store.put(record, KEY), undefined);
}

export async function clearRoster(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(KEY), undefined);
}

/** Whatever is stored, untrusted. Hand it to `restoreSelection` before using it. */
export function readSelection(): Promise<unknown> {
  return withStore<unknown>('readonly', (store) => store.get(SELECTION_KEY), null);
}

export async function writeSelection(selection: CachedSelection): Promise<void> {
  await withStore('readwrite', (store) => store.put(selection, SELECTION_KEY), undefined);
}

/**
 * Always alongside `clearRoster`. A selection outliving the roster it describes
 * is a set of indices into a list that is no longer there.
 */
export async function clearSelection(): Promise<void> {
  await withStore('readwrite', (store) => store.delete(SELECTION_KEY), undefined);
}
