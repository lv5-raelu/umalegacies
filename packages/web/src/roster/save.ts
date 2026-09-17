import type { RosterMemberInput, RosterVeteranInput } from '@umalegacies/types';

/**
 * Turns the game's `data.json` into the three public fields per uma that the API
 * is allowed to see.
 *
 * THIS FUNCTION IS THE PRIVACY PROMISE. The screen says the file never leaves
 * your machine, and what makes that true is not a server policy but this: the
 * request is BUILT from an allowlist, so a personal field has no path onto the
 * wire even by accident. A save entry carries `owner_viewer_id` on every ancestor
 * slot -- 184 distinct 12-digit trainer ids belonging to OTHER players in the
 * builder's own file -- plus nicknames, registration timestamps, stats, skills,
 * race history and the save's internal `trained_chara_id`. None of them are read
 * here, so none of them can be sent.
 *
 * Measured on the builder's save: 5,283,444 bytes in, 160,495 out.
 */
export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

/** The veteran's own slots 10 and 20, which become the grandparents beneath it. */
const PARENT_SLOTS = [10, 20] as const;

/** One entry the file described but this parser could not use, and why. */
export interface SkippedEntry {
  /** 1-based, matching how the entry is counted in the reason text. */
  entry: number;
  reason: string;
}

export interface SlimmedSave {
  veterans: RosterVeteranInput[];
  /**
   * Entries dropped for being malformed. NOT an error: one unusable row must
   * not cost the user the other 258.
   *
   * The API already refuses to fail a whole upload over a single unresolvable
   * card -- "a patch that adds one uma must not brick the roster" -- but that
   * protection only covered identity RESOLUTION on the server. Parsing happens
   * here, before any of it, and used to throw, so a single odd entry anywhere in
   * the file killed the upload with one generic message. The likelier real
   * trigger is a save-format change, which is exactly when losing the whole
   * roster is least acceptable.
   */
  skipped: SkippedEntry[];
}

export function slimSave(text: string): SlimmedSave {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError(
      'That file is not valid JSON. Export your trained characters again and pick the ' +
        'data.json the exporter writes.',
    );
  }

  if (!Array.isArray(parsed)) {
    throw new SaveError(
      'That JSON file is not a roster. data.json is a list of trained characters; this ' +
        `file is ${describe(parsed)}.`,
    );
  }
  if (parsed.length === 0) {
    throw new SaveError('That roster is empty. There are no trained characters in it to compare.');
  }

  const veterans: RosterVeteranInput[] = [];
  const skipped: SkippedEntry[] = [];
  parsed.forEach((entry, i) => {
    try {
      veterans.push(slimVeteran(entry, i));
    } catch (error) {
      // Only THIS entry is lost, and it says why. A malformed file that yields
      // no usable veteran at all is still a file-level failure, below.
      if (!(error instanceof SaveError)) throw error;
      skipped.push({ entry: i + 1, reason: error.message });
    }
  });

  if (veterans.length === 0) {
    throw new SaveError(
      `None of the ${parsed.length} entries in that file could be read. ` +
        `The first problem was: ${skipped[0]?.reason ?? 'unknown'}`,
    );
  }

  return { veterans, skipped };
}

function slimVeteran(entry: unknown, index: number): RosterVeteranInput {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new SaveError(`Entry ${index + 1} in that roster is not a trained character.`);
  }
  const raw = entry as Record<string, unknown>;

  const slots = Array.isArray(raw.succession_chara_array) ? raw.succession_chara_array : [];
  const slotAt = (position: number): unknown =>
    slots.find(
      (s) => typeof s === 'object' && s !== null && (s as Record<string, unknown>).position_id === position,
    );

  // rank_score is the only figure here that is not an id into master.mdb. It is
  // the game's own strength number, it leads every card, and the rank badge is
  // derived from it. Coercing a missing one to 0 produced a veteran that
  // claimed a real score of 0 and a confident "G" rank -- a fabricated fact
  // sitting in a tool whose whole claim is that its numbers are traceable.
  if (typeof raw.rank_score !== 'number' || !Number.isFinite(raw.rank_score)) {
    throw new SaveError(
      `Entry ${index + 1} has no usable rank_score, so its rank and its place ` +
        'in the list cannot be worked out.',
    );
  }

  return {
    score: raw.rank_score,
    self: slimMember(raw, `entry ${index + 1}`),
    // A missing slot is null rather than an error: the engine models an absent
    // ancestor deliberately, so a veteran with an empty parent slot is usable.
    parents: [
      optionalMember(slotAt(PARENT_SLOTS[0])),
      optionalMember(slotAt(PARENT_SLOTS[1])),
    ],
  };
}

const optionalMember = (slot: unknown): RosterMemberInput | null =>
  slot === undefined ? null : slimMember(slot as Record<string, unknown>, 'an ancestor slot');

function slimMember(raw: Record<string, unknown>, where: string): RosterMemberInput {
  const cardId = raw.card_id;
  if (typeof cardId !== 'number' || !Number.isInteger(cardId)) {
    throw new SaveError(
      `${where} has no card_id, so there is no way to tell which uma it is. That file ` +
        'does not look like a trained-character export.',
    );
  }
  return {
    cardId,
    // Deduped because the API refuses repeats: a repeated spark would be counted
    // as a second independent carrier and inflate both its star total and its
    // odds. Never observed in a real save, but this is user-supplied data.
    winSaddleIds: unique(numbers(raw.win_saddle_id_array)),
    // Only the factor IDS travel. The sibling `level` is 0 on all 1,554 ancestor
    // slots in the builder's roster, so it carries no information.
    factorIds: unique(
      Array.isArray(raw.factor_info_array)
        ? raw.factor_info_array
            .map((f) =>
              typeof f === 'object' && f !== null
                ? (f as Record<string, unknown>).factor_id
                : undefined,
            )
            .filter((id): id is number => typeof id === 'number' && Number.isInteger(id))
        : [],
    ),
  };
}

const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((n): n is number => typeof n === 'number' && Number.isInteger(n)) : [];

const unique = (ids: number[]): number[] => [...new Set(ids)];

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'object') return 'a single object';
  return `a ${typeof value}`;
}
