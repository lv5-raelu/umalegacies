import type { VeteranPackage } from '@umalegacies/types';
import type { MasterData, PairSide } from '@umalegacies/core';

/**
 * A BORROWED HALF THE GAME'S RULES CAN BE APPLIED TO.
 *
 * `packageFromRecord` produces a `VeteranPackage`, which is everything the
 * ENGINE needs and nothing the RULES need. `isLegalPair` asks two questions --
 * "are these the same candidate" and "what character is this" -- and a package
 * answers neither: it carries card ids, and a card is a costume rather than a
 * character.
 *
 * That gap was not theoretical. The first live end-to-end ranked
 * Oguri Cap x Oguri Cap first, for a trainee who is also Oguri Cap, and 59 of
 * 150 naively formed pairs were illegal:
 *
 *   refused: a parent IS the trainee's character     52
 *   refused: both parents the same character          7
 *
 * The illegal ones were winning, too -- 525 against a legal best of 438 --
 * because a lineage that reuses the trainee's own character concentrates
 * affinity links the game would never let you have. That is not a subtly wrong
 * ranking; it is a top row the player cannot select.
 *
 * THE KEY IS A STRING, AND THAT IS THE WHOLE DESIGN. `PairSide.index` is an
 * identity, not an ordinal, and the borrow sweep compares own veterans against
 * borrowed ones in the same run. Numbering borrowed halves from 0 would make
 * borrowed 5 equal roster row 5, and `isLegalPair` would refuse a legal pair --
 * silently, and only for the pairs whose numbers happened to line up. A string
 * can never equal a roster row's number, so the collision cannot happen rather
 * than merely not happening.
 *
 * NO SYNTHETIC `index` IS INVENTED. `ParentPick` is a discriminated union
 * because "a position in the array that was SENT" is the one thing a borrowed
 * veteran does not have, and manufacturing one here to satisfy a predicate
 * would have quietly re-introduced exactly what that union exists to prevent.
 * Widening the predicate was the other way round, and it changed no existing
 * caller: a `ResolvedVeteran` satisfies `PairSide` structurally.
 */
export interface BorrowedCandidate extends PairSide {
  /** `borrowed:<n>`. Namespaced so it cannot collide with a roster index. */
  index: string;
  /** Resolved from `self.cardId`, because the rules compare characters. */
  self: { charaId: number | null };
  /** What the engine scores. Untouched by any of the above. */
  package: VeteranPackage;
}

/** The namespace every borrowed identity carries. */
export const BORROWED_PREFIX = 'borrowed:';

/**
 * Borrowed halves the sweep can legally pair.
 *
 * @param packages in the order `searchBorrowable` returned them, which is
 *   uma.moe's own stable ordering. The position is only ever used as an
 *   identity WITHIN one search -- nothing persists it, and nothing compares it
 *   across two searches, which is what makes a position adequate here and
 *   inadequate in `ParentPick`.
 *
 * A null `charaId` -- a card the master extract has no row for, the realistic
 * cause being a patch landing before the extract was rebuilt -- is left null
 * rather than dropped. The identity rules already treat null as "cannot be
 * shown to be the same character" and wave it through, which is the same
 * choice the roster makes: refusing a pair on a lookup failure would punish
 * the reader for a stale extract rather than for anything about the pairing.
 */
export function borrowedCandidates(
  packages: readonly VeteranPackage[],
  master: MasterData,
): BorrowedCandidate[] {
  return packages.map((pkg, at) => ({
    index: `${BORROWED_PREFIX}${at}`,
    self: { charaId: master.charaIdFor(pkg.self.cardId) },
    package: pkg,
  }));
}
