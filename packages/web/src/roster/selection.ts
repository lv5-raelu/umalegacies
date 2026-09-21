import type {
  FilterScope,
  ParentPick,
  ResolvedVeteran,
  RosterResolveResponse,
  SparkCriterion,
  TraineeOption,
} from '@umalegacies/types';
import { CACHE_VERSION } from './cache-policy';
import { maxStarsFor, pickBlock } from './filter';
import { ownPick } from './picks';

/**
 * What was chosen last time: the trainee, the spark requirements, and the pair.
 *
 * Kept APART from the roster record even though both live in the same store.
 * The roster is ~378 KB and is written once per file; this is a few dozen bytes
 * and is rewritten on every click. Putting them together would mean rewriting
 * the whole roster to remember that a checkbox moved.
 *
 * Kept apart from the IndexedDB code for the same reason `cache-policy.ts` is:
 * the storage is callbacks that cannot run in this package's node test
 * environment, and the DECISION about what may be restored is a pure function
 * of a record and the roster it claims to describe. Every branch below is
 * tested.
 */

export interface CachedSelection {
  /** Shares `CACHE_VERSION` with the roster record: they are written together. */
  version: number;
  traineeCardId: number | null;
  criteria: SparkCriterion[];
  /**
   * The pair, in the SAME shape the app holds it in.
   *
   * There used to be a separate `CachedPick { index, cardId }`, because the
   * in-memory pick was a bare index and the stored one had to carry its proof.
   * Widening `ParentPick` folded the card into the pick itself, so the two
   * shapes became identical and keeping both would have been two definitions
   * that must agree rather than one that cannot disagree.
   */
  picks: ParentPick[];
}

/** Exactly what `App` holds, so a restore is three `set` calls and no mapping. */
export interface Selection {
  traineeCardId: number | null;
  criteria: SparkCriterion[];
  /** The pair, oldest first, at most two. */
  picks: ParentPick[];
}

export const EMPTY_SELECTION: Selection = { traineeCardId: null, criteria: [], picks: [] };

const SCOPES: readonly FilterScope[] = ['package', 'parent'];

/**
 * Whatever was stored, reduced to the part that is still true.
 *
 * NEVER ALL-OR-NOTHING. A stored selection is checked field by field and the
 * parts that no longer hold are dropped, because the three fields fail for
 * unrelated reasons: a spark can leave the catalogue while the trainee is still
 * a real card, and refusing the whole selection over one stale criterion would
 * throw away two good answers to punish one bad one.
 *
 * Never throws, and never returns something the UI could not have produced
 * itself: every pick that survives would be accepted by `pick()`, and every
 * criterion by the filter's own controls.
 */
export function restoreSelection(
  stored: unknown,
  roster: RosterResolveResponse,
  trainees: readonly TraineeOption[],
): Selection {
  if (typeof stored !== 'object' || stored === null) return EMPTY_SELECTION;
  const record = stored as Record<string, unknown>;
  // A record written by an older build describes controls this one may not
  // have. The scope selector lost an option once already.
  if (record.version !== CACHE_VERSION) return EMPTY_SELECTION;

  const trainee = trainees.find((t) => t.cardId === record.traineeCardId) ?? null;
  const criteria = restoreCriteria(record.criteria, roster);
  const picks = restorePicks(record.picks, roster, trainee?.charaId ?? null);

  return { traineeCardId: trainee?.cardId ?? null, criteria, picks };
}

/**
 * The requirements that can still be expressed.
 *
 * A criterion names a spark by `groupId` and a ceiling by scope. Both can move
 * under a stored record: the catalogue is built from the roster that was
 * loaded, and the star range follows the scope, so a 7-star requirement stored
 * against the lineage is unsatisfiable the moment it is read back as a parent
 * requirement. Rather than clamp it -- which would silently answer a question
 * nobody asked -- a criterion that does not check out is dropped.
 */
function restoreCriteria(stored: unknown, roster: RosterResolveResponse): SparkCriterion[] {
  if (!Array.isArray(stored)) return [];
  const known = new Set(roster.sparkOptions.map((o) => o.groupId));
  const seen = new Set<number>();
  const out: SparkCriterion[] = [];

  for (const raw of stored) {
    if (typeof raw !== 'object' || raw === null) continue;
    const c = raw as Record<string, unknown>;
    const { groupId, minStars, scope } = c;

    if (typeof groupId !== 'number' || !known.has(groupId)) continue;
    // The filter refuses a second row for the same spark, so a record holding
    // one was not written by this UI.
    if (seen.has(groupId)) continue;
    if (typeof scope !== 'string' || !SCOPES.includes(scope as FilterScope)) continue;
    if (typeof minStars !== 'number' || !Number.isInteger(minStars)) continue;
    if (minStars < 1 || minStars > maxStarsFor(scope as FilterScope)) continue;

    seen.add(groupId);
    out.push({ groupId, minStars, scope: scope as FilterScope });
  }
  return out;
}

/**
 * The picks that are still the same two umas, and still a legal pair.
 *
 * `pickBlock` is the rule, here as everywhere else. A restore is a way to
 * compose a pair without clicking, so it is held to exactly what clicking would
 * allow: not the trainee, not the same uma twice, never more than two. Rewriting
 * those three rules here is how a restored pair ends up in a state the pick
 * handler would refuse to recreate.
 */
function restorePicks(
  stored: unknown,
  roster: RosterResolveResponse,
  traineeCharaId: number | null,
): ParentPick[] {
  if (!Array.isArray(stored)) return [];
  const picks: ParentPick[] = [];
  const picked: ResolvedVeteran[] = [];

  for (const raw of stored) {
    if (typeof raw !== 'object' || raw === null) continue;
    const p = raw as Record<string, unknown>;
    // ONLY THE ARM THIS BUILD WRITES. Release 1 emits nothing but `own`, so a
    // `borrowed` entry, or the pre-union shape with no `kind` at all, is
    // refused whole rather than read for the fields it happens to share. The
    // borrow release adds its arm HERE, with a shape check of its own: a
    // borrowed package arrives complete from a third party, so none of the
    // checks below apply to it -- there is no roster row to compare it against
    // and no index that could have moved.
    if (p.kind !== 'own') continue;
    if (typeof p.index !== 'number' || !Number.isInteger(p.index)) continue;

    const veteran = roster.veterans[p.index];
    // The index is in range AND still holds the uma it was picked as.
    if (!veteran || veteran.self.cardId !== p.cardId) continue;
    if (pickBlock(veteran, picked, traineeCharaId) !== null) continue;

    // Rebuilt from the roster row, never the stored object: what comes back is
    // then a pick this UI could have produced, rather than whatever shape the
    // record carried around the two fields that were checked.
    picks.push(ownPick(veteran));
    picked.push(veteran);
  }
  return picks;
}

/**
 * The pair as it is stored.
 *
 * Nearly nothing left to do, and that is the point: a pick now carries the card
 * it was made against, so this no longer re-reads it out of the roster at write
 * time. Re-reading would have LAUNDERED a mismatch -- stamping whoever now sits
 * at that index onto a pick made against somebody else -- which is the exact
 * failure the stored card exists to catch on the way back in.
 *
 * What remains is the one drop it always made: an `own` pick with nothing
 * behind it is not written, so a record can never name an index this roster
 * does not have. A borrowed pick has no roster row to check and passes through.
 */
export function picksToCache(
  picks: readonly ParentPick[],
  roster: RosterResolveResponse,
): ParentPick[] {
  return picks.filter((pick) => pick.kind !== 'own' || roster.veterans[pick.index] !== undefined);
}
