import type {
  ExplainPairRequest,
  ParentPick,
  ResolvedVeteran,
  RosterResolveResponse,
  RosterVeteranInput,
  TraineeOption,
  VeteranPackage,
} from '@umalegacies/types';

/**
 * Everything that reads a `ParentPick`, in one place.
 *
 * A pick is a discriminated union (see `ParentPick`), and the reason to keep
 * the readers together is the next release rather than this one: borrowing adds
 * a second arm, and a `pick.kind === 'own'` test spread across `App.tsx`,
 * `VeteranList.tsx` and `selection.ts` is four places to forget instead of one
 * function to extend. Release 1 only ever produces `own`, so every `borrowed`
 * branch below is a declaration of where that work goes, not dead weight
 * pretending to be finished.
 *
 * Pure, and in the workspace that owns the behaviour: the TYPE is shared with
 * the API because its borrowed arm carries a `VeteranPackage`, which is a wire
 * shape; the functions are the web app's alone and `packages/types` may not
 * emit them anyway.
 */

/** A roster row, as the pick that names it. The card is stamped here, once. */
export const ownPick = (veteran: ResolvedVeteran): ParentPick => ({
  kind: 'own',
  index: veteran.index,
  cardId: veteran.self.cardId,
});

/** Is this pick the roster row sitting at `index`? A borrowed pick never is. */
export const isOwnPickOf = (pick: ParentPick, index: number): boolean =>
  pick.kind === 'own' && pick.index === index;

/**
 * Which half of the pair a roster row fills -- 0 is A, 1 is B -- or -1.
 *
 * Searched across ALL picks rather than across the own ones, so the slot stays
 * the slot. Filtering to own picks first would relabel the own half of a
 * borrowed-plus-own pair as A when it is B, and the card's badge is the only
 * thing on the list that says which is which.
 */
export const slotOf = (picks: readonly ParentPick[], index: number): number =>
  picks.findIndex((pick) => isOwnPickOf(pick, index));

/**
 * The roster rows behind the picks, in pick order.
 *
 * Feeds `pickBlock`, which is why this is not simply "the picks". The rules it
 * enforces -- not the trainee, not the same uma twice -- are comparisons
 * against resolved characters, and a borrowed package carries `cardId` only, so
 * there is nothing here to compare until the borrow release resolves one.
 *
 * NOTE FOR THAT RELEASE: `pickBlock`'s third rule counts this list, so a
 * borrowed pick dropped from it would also drop out of "two is the limit".
 * Release 1 cannot produce one, so the count is exact today and is the thing to
 * fix first when it can.
 */
export const ownVeterans = (
  picks: readonly ParentPick[],
  roster: RosterResolveResponse | null,
): ResolvedVeteran[] =>
  picks.flatMap((pick) => {
    if (pick.kind !== 'own') return [];
    const veteran = roster?.veterans[pick.index];
    return veteran ? [veteran] : [];
  });

/**
 * The slimmed package a pick stands for.
 *
 * `own` resolves through the request array the browser still holds --
 * `ResolvedVeteran.index` is the position that was SENT, which is why the API
 * preserves request order and why the display list is sorted separately.
 * `borrowed` already IS the package; there is nothing to resolve.
 */
export function packageOf(
  pick: ParentPick,
  veterans: readonly RosterVeteranInput[],
): VeteranPackage {
  if (pick.kind === 'borrowed') return pick.package;
  const veteran = veterans[pick.index];
  if (!veteran) throw new Error(`no veteran at index ${pick.index}`);
  return {
    self: veteran.self,
    parents: [veteran.parents[0], veteran.parents[1]],
  };
}

/**
 * The pair, as the question the server is asked.
 *
 * Returns null rather than a partial request when the pair is not yet two, so
 * the caller has one condition to check instead of a length test and two
 * non-null assertions on the indices it just measured.
 *
 * The client never composes an `ExplainRequest` -- which grandparent sits under
 * which parent is the server's job, in one tested place. This only names the
 * two halves.
 */
export function explainPairRequest(
  trainee: TraineeOption,
  picks: readonly ParentPick[],
  veterans: readonly RosterVeteranInput[],
): ExplainPairRequest | null {
  const [a, b] = picks;
  if (picks.length !== 2 || !a || !b) return null;
  return {
    traineeCharaId: trainee.charaId,
    // The costume being trained. Decides the portrait; changes no number.
    traineeCardId: trainee.cardId,
    veteranA: packageOf(a, veterans),
    veteranB: packageOf(b, veterans),
  };
}
