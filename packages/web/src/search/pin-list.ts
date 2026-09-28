/**
 * THE SHORTLIST BEHIND A PIN PICKER, as arithmetic rather than as markup.
 *
 * `packages/web`'s tests run with no DOM on purpose -- `vitest.config.ts` says
 * so: "it cannot click anything". So the one part of the multi-select picker
 * that can be got wrong lives here, where it can be asserted, and the component
 * is left holding nothing but the rendering.
 */

/**
 * Add a card to the shortlist, or take it out if it is already there.
 *
 * TOGGLING, not adding. A reader removes a pin the same way they made it,
 * which is the only gesture a list of options can offer without a second
 * control per row.
 *
 * Order is preserved, and that matters: the list is rendered in the order the
 * reader built it, so a pick that jumped to the end would move every row under
 * the pointer.
 */
export function togglePin(chosen: readonly number[], cardId: number): number[] {
  return chosen.includes(cardId) ? chosen.filter((id) => id !== cardId) : [...chosen, cardId];
}

/**
 * What the collapsed control says.
 *
 * ONE is named, because that is the case where the costume matters and there
 * is room to show it. SEVERAL is a count: three names do not fit, and a
 * truncated first name reads as the only choice. NONE is "anyone", which is
 * what no pin means -- not "nobody".
 */
export function pinSummary(names: readonly string[]): string {
  if (names.length === 0) return 'anyone';
  if (names.length === 1) return names[0] as string;
  return `${names.length} umas — any of them`;
}
