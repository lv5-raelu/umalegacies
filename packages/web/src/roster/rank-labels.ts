/**
 * The career rank ladder: tier id (1-98) to the label the game shows.
 *
 * NOT FROM master.mdb. `single_mode_rank` carries the 98 score bands and no
 * names for them; the ladder lives in the game client. So this table is the one
 * piece of game vocabulary in this project that is neither extracted nor
 * verifiable against a committed file, and it is kept alone in its own module
 * for exactly that reason.
 *
 * An id with no entry renders as its tier number rather than a guessed letter.
 * This product's claim is that every number opens onto what produced it, and a
 * rank invented here would be the one label on screen that cannot.
 */
export const RANK_LABEL: Readonly<Record<number, string>> = {
  // Awaiting the ladder from the builder. The roster in hand spans tiers 12-30.
};

/**
 * What to print for a tier. Falls back to the tier number, which is true and
 * checkable, rather than to a letter nobody can source.
 */
export function rankLabel(tier: number | null): string | null {
  if (tier === null) return null;
  return RANK_LABEL[tier] ?? `tier ${tier}`;
}
