import type { ParentPick } from '@umalegacies/types';

/**
 * THE COMPARE TRAY: up to four whole pairs, in the order they were added.
 *
 * A pair is two `ParentPick`s, P1 then P2, exactly as the roster pane and the
 * search hold one, so a pair moves between the three surfaces without being
 * translated. Kept apart from `picks`: the tray is a list of pairs to READ, the
 * picks are the one pair being BUILT, and a trainee change that drops an
 * illegal pick must not reach into the tray (Premise 1: an illegal pair keeps
 * its column and says why).
 *
 * Pure, so every rule below has a node test.
 */
export type TrayPair = readonly [ParentPick, ParentPick];

/** Four columns at their 200px minimum plus the name column is the 1080px breakpoint. */
export const TRAY_CAP = 4;

/** The slot letters. Positions, left to right; never an identity. */
export const LETTERS = ['A', 'B', 'C', 'D'] as const;

/**
 * One pick, as a string that is equal exactly when the picks are the same half.
 *
 * An own pick is its roster `index` (the card rides along so a stale index can
 * never collide with a fresh one). A borrowed pick has no index and compares
 * by its whole package, which is the only identity it has.
 */
export const pickKey = (pick: ParentPick): string =>
  pick.kind === 'own' ? `own:${pick.index}:${pick.cardId}` : `borrowed:${JSON.stringify(pick.package)}`;

export const samePick = (a: ParentPick, b: ParentPick): boolean => pickKey(a) === pickKey(b);

/**
 * ORDERED: A x B is not B x A here, and must not be.
 *
 * A lineage stores its carriers by slot -- the first veteran's three umas go to
 * 10-12, the second's to 20-22 -- so a result explained as A x B would name the
 * wrong umas in every expansion line of a column headed B x A. Every number is
 * the same both ways; the names are not.
 */
export const pairKey = (pair: TrayPair): string => `${pickKey(pair[0])}|${pickKey(pair[1])}`;

/**
 * UNORDERED, for one question only: is this pair already in the tray? A x B and
 * B x A are the same two parents, and comparing a pair with itself reversed
 * would be a column of identical numbers under a different header.
 */
export const dedupeKey = (pair: TrayPair): string =>
  [pickKey(pair[0]), pickKey(pair[1])].sort().join('|');

/** Where this pair sits in the tray, in either order, or -1. */
export const trayIndexOf = (tray: readonly TrayPair[], pair: TrayPair): number => {
  const key = dedupeKey(pair);
  return tray.findIndex((p) => dedupeKey(p) === key);
};

export type TrayAdd =
  | { ok: true; tray: TrayPair[]; index: number }
  | { ok: false; reason: 'full' | 'duplicate' };

/**
 * Add a pair at the end. Refused, with the reason, rather than silently
 * replacing anything: a full tray never evicts a pair, and a pair already in
 * it is not added twice.
 */
export function addToTray(tray: readonly TrayPair[], pair: TrayPair): TrayAdd {
  if (trayIndexOf(tray, pair) !== -1) return { ok: false, reason: 'duplicate' };
  if (tray.length >= TRAY_CAP) return { ok: false, reason: 'full' };
  return { ok: true, tray: [...tray, pair], index: tray.length };
}

export const removeFromTray = (tray: readonly TrayPair[], index: number): TrayPair[] =>
  tray.filter((_, i) => i !== index);

/** Put a removed pair back where it was, if there is still room and it is not back already. */
export function restoreToTray(tray: readonly TrayPair[], pair: TrayPair, index: number): TrayPair[] {
  if (trayIndexOf(tray, pair) !== -1 || tray.length >= TRAY_CAP) return [...tray];
  const at = Math.max(0, Math.min(index, tray.length));
  return [...tray.slice(0, at), pair, ...tray.slice(at)];
}
