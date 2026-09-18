import type {
  RosterResolveResponse,
  RosterVeteranInput,
  TraineeOption,
} from '@umalegacies/types';
import type { SkippedEntry } from './save';

/**
 * Whether a roster found on disk may be used, and why not when it may not.
 *
 * Kept apart from the IndexedDB code on purpose. The storage is a handful of
 * callbacks that cannot run in this package's node test environment; the
 * DECISION is the part with rules in it, and it is a pure function of a record
 * and a hash. Every branch below is tested.
 */

/**
 * Bump when the shape changes. A record written by an older build is discarded
 * rather than read optimistically: the alternative is a restore that half works
 * and reports numbers from a structure nobody checked.
 */
export const CACHE_VERSION = 2;

/**
 * What a restore needs, and nothing more.
 *
 * WHAT THIS DOES NOT CONTAIN, and cannot: `owner_viewer_id`, nicknames,
 * timestamps, stats, skills, race history. `slimSave` strips all of it in the
 * browser before anything is sent or stored, so the raw save never reaches this
 * record -- the 183 other players' trainer ids in a real data.json are gone
 * three steps before the cache exists. What is here is the user's own roster
 * composition plus public game data.
 */
export interface CachedRoster {
  version: number;
  /** The extract every number here was computed from. */
  masterHash: string;
  fileName: string;
  /** Epoch millis, so the UI can say how old the restore is. */
  savedAt: number;
  veterans: RosterVeteranInput[];
  skipped: SkippedEntry[];
  resolved: RosterResolveResponse;
  trainees: TraineeOption[];
}

export type CacheVerdict =
  /** Usable. When `masterHash` was not supplied, staleness is still unchecked. */
  | { use: true; record: CachedRoster }
  /** Nothing stored, which is the ordinary first visit. */
  | { use: false; reason: 'absent' }
  /** Written by a different build of this app. */
  | { use: false; reason: 'version' }
  /** Present but not the shape this build reads. */
  | { use: false; reason: 'malformed' }
  /** Real, but computed from a different master extract. */
  | { use: false; reason: 'stale-master' };

function isVeteranInput(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.score === 'number' && typeof r.self === 'object' && Array.isArray(r.parents);
}

/**
 * Is this the shape this build reads?
 *
 * Deliberately structural rather than trusting `version` alone. A record can
 * carry the right version number and still be truncated -- a quota error
 * mid-write, a browser killed during a transaction -- and the failure of a
 * half-written roster is a screen of undefined names rather than a clean miss.
 */
function looksRight(record: unknown): record is CachedRoster {
  if (typeof record !== 'object' || record === null) return false;
  const r = record as Record<string, unknown>;
  if (typeof r.masterHash !== 'string' || r.masterHash === '') return false;
  if (typeof r.fileName !== 'string') return false;
  if (typeof r.savedAt !== 'number') return false;
  if (!Array.isArray(r.veterans) || !Array.isArray(r.skipped)) return false;
  if (!Array.isArray(r.trainees)) return false;

  const resolved = r.resolved as Record<string, unknown> | null | undefined;
  if (typeof resolved !== 'object' || resolved === null) return false;
  if (!Array.isArray(resolved.veterans)) return false;
  if (typeof resolved.masterHash !== 'string') return false;

  // An empty roster is a legitimate save; a roster whose entries are not
  // veterans is not.
  if (r.veterans.length !== resolved.veterans.length) return false;
  if (!r.veterans.every(isVeteranInput)) return false;

  return true;
}

/**
 * @param record          whatever came back from storage, untrusted
 * @param currentMasterHash  the extract the server is serving NOW, or null when
 *                        it is not known yet and the caller will check later
 */
export function inspectCache(record: unknown, currentMasterHash: string | null): CacheVerdict {
  if (record === null || record === undefined) return { use: false, reason: 'absent' };

  const version = (record as Record<string, unknown>).version;
  if (version !== CACHE_VERSION) return { use: false, reason: 'version' };

  if (!looksRight(record)) return { use: false, reason: 'malformed' };

  // The record and its own payload must agree before either is compared to the
  // server. They are written together, so a mismatch means the record was
  // assembled wrong rather than that the game moved.
  if (record.resolved.masterHash !== record.masterHash) {
    return { use: false, reason: 'malformed' };
  }

  if (currentMasterHash !== null && record.masterHash !== currentMasterHash) {
    return { use: false, reason: 'stale-master' };
  }

  return { use: true, record };
}

/**
 * What to tell the user, for the one case worth explaining.
 *
 * `absent` is the ordinary first visit and `version` is an app update; neither
 * is the user's business. A stale extract IS: their roster was read against a
 * game version that has since been rebuilt, and the numbers they might remember
 * from last time came from different data.
 */
export function explainDiscard(verdict: CacheVerdict): string | null {
  if (verdict.use) return null;
  if (verdict.reason === 'stale-master') {
    return 'The game data has been updated since your roster was saved, so it was cleared. Load your file again to see current numbers.';
  }
  return null;
}
