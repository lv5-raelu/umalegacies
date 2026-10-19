import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LineageResponse, ParentPick } from '@umalegacies/types';
import { ComparePane, paneState } from './ComparePane';

/**
 * What the pane says about a pair of OWN picks.
 *
 * The pane is the screen's answer, and it is driven entirely by the pick array:
 * `paneState` counts it to decide between "pick two veterans", "pick one more"
 * and the result, and the clear button names the count back. Widening a pick
 * from a number into a union changes none of that, and this file is how we know
 * it changed none of that -- every string below is the one that was on screen
 * before the refactor.
 *
 * Rendered through `renderToStaticMarkup`, so the assertions are on markup
 * rather than on a state machine described twice. There is no DOM and no click:
 * what is being guarded is what the pane PRINTS for a given pair, which is the
 * part a type change can break silently.
 */

const own = (index: number, cardId: number): ParentPick => ({ kind: 'own', index, cardId });

const render = (
  picks: readonly ParentPick[],
  over: { traineeCardId?: number | null; lineage?: LineageResponse | null } = {},
): string => {
  const { traineeCardId = 100101, lineage = null } = over;
  return renderToStaticMarkup(
    <ComparePane
      state={paneState(traineeCardId, picks, false, null, lineage)}
      criteria={[]}
      sparkOptions={[]}
      pickedCount={picks.length}
      view="once"
      onView={() => {}}
      onClearPicks={() => {}}
      onOpenTree={() => {}}
    />,
  );
};

/**
 * The thinnest lineage the pane will render: a pair total that decomposes, a
 * resolved trainee, two named parents and no sparks.
 *
 * Hand-built rather than taken from a fixture on purpose. The engine's numbers
 * are asserted in packages/api against the real extract; what this file is
 * about is whether two own picks reach the pane at all.
 */
const lineage = {
  pairTotal: {
    ruleId: 'total.pair',
    label: 'Pair total',
    value: 155,
    sources: [],
    children: [
      { ruleId: 'base.two_way', label: 'base', value: 140, sources: [], children: [] },
      { ruleId: 'bonus.shared_g1', label: 'bonus', value: 15, sources: [], children: [] },
    ],
  },
  individualAffinity: {},
  relationRank: { value: 3, ruleId: 'rank.lookup', sources: [] },
  rankBounds: { min: 151, max: 999 },
  masterHash: 'abc',
  trainee: {
    charaId: 1001,
    name: 'Special Week',
    portraitCardId: 100101,
    resolution: { ok: true },
  },
  ancestors: {
    10: {
      position: 10,
      cardId: 100601,
      charaId: 1006,
      name: 'Oguri Cap',
      sparks: { blue: null, pink: null, green: null, whites: [], unknownFactorIds: [] },
      resolution: { ok: true },
    },
    20: {
      position: 20,
      cardId: 100901,
      charaId: 1009,
      name: 'Gold Ship',
      sparks: { blue: null, pink: null, green: null, whites: [], unknownFactorIds: [] },
      resolution: { ok: true },
    },
  },
  sparks: [],
} as unknown as LineageResponse;

describe('the pane reads a pair of own picks', () => {
  it('asks for two when none are picked, and offers nothing to clear', () => {
    const html = render([]);
    expect(html).toContain('Pick two veterans.');
    expect(html).not.toContain('Clear');
  });

  it('asks for one more when a single own pick is held', () => {
    const html = render([own(1, 100601)]);
    expect(html).toContain('Pick one more.');
    // Singular, and it is the only way out when a filter hides the pick.
    expect(html).toContain('Clear pick');
    expect(html).not.toContain('Clear both picks');
  });

  it('stops asking once two own picks are held, and names both to clear', () => {
    const html = render([own(1, 100601), own(2, 100901)]);
    expect(html).not.toContain('Pick one more.');
    expect(html).toContain('Clear both picks');
  });

  it('renders the pair itself once the lineage for two own picks arrives', () => {
    const html = render([own(1, 100601), own(2, 100901)], { lineage });
    expect(html).toContain('155');
    expect(html).toContain('140 base + 15 bonus');
    // The ◎ the game shows for rank 3, and the two parents in slot order.
    expect(html).toContain('◎');
    expect(html).toContain('Oguri Cap');
    expect(html).toContain('Gold Ship');
    expect(html).toContain('Show breakdown');
  });

  it('says choose a trainee first, whatever is picked', () => {
    // The precondition outranks the pair: who you are training decides which
    // veterans are legal parents at all.
    const html = render([own(1, 100601), own(2, 100901)], { traineeCardId: null, lineage });
    expect(html).toContain('Choose who you are training');
    expect(html).not.toContain('155');
  });
});

/**
 * What the pane PRINTS for a white and a gold criterion.
 *
 * The guard on `lineage/odds.ts`. The window, the gold rule and the inherit
 * figure used to live privately in this component, and the compare page needs
 * the same numbers; written before they moved, green before and after, so
 * "the pane and /compare show the same number" starts from the pane's own.
 *
 * Numbers picked so every figure is exact by hand. Uma Stan: 40% across a
 * career, two carriers, so 40% x 25% = 10% white and 40% x 50% = 20% gold.
 * Nimble Navigator: 60%, four carriers, so 18% white and 36% gold.
 */
const whiteRow = (
  groupId: number,
  name: string,
  odds: { inspiration: number; once: number; twice: number },
  carriers: number,
) => ({
  groupId,
  kind: 'white_skill',
  name,
  stars: 5,
  carriers: [],
  withinOneInspiration: odds.inspiration,
  onceInCareer: odds.once,
  twiceInCareer: odds.twice,
  lineageCarriers: carriers,
  timing: null,
  aptitude: null,
});

const withSparks = {
  ...lineage,
  sparks: [
    whiteRow(2001, 'Nimble Navigator', { inspiration: 0.35, once: 0.6, twice: 0.2 }, 4),
    whiteRow(2002, 'Uma Stan', { inspiration: 0.2, once: 0.4, twice: 0.1 }, 2),
  ],
} as unknown as LineageResponse;

const options = [
  { groupId: 2001, kind: 'white_skill', name: 'Nimble Navigator', veterans: 3 },
  { groupId: 2002, kind: 'white_skill', name: 'Uma Stan', veterans: 3 },
] as const;

const renderOdds = (goldUmaStan: boolean): string =>
  renderToStaticMarkup(
    <ComparePane
      state={paneState(100101, [own(1, 100601), own(2, 100901)], false, null, withSparks)}
      criteria={[
        { groupId: 2001, minStars: 1, scope: 'package' },
        { groupId: 2002, minStars: 1, scope: 'package', gold: goldUmaStan },
      ]}
      sparkOptions={options}
      pickedCount={2}
      view="once"
      onView={() => {}}
      onClearPicks={() => {}}
      onOpenTree={() => {}}
    />,
  );

/**
 * A chip's visible text -- name, stars, activation, inherit -- without its hover
 * sentence, which is an attribute and so goes with the tags.
 */
const chipText = (html: string, name: string): string => {
  const parts = html.split(/<[^>]*>/).filter((part) => part !== '');
  const at = parts.indexOf(name);
  return parts.slice(at, at + 4).join('|');
};

describe('the pane prints activation and inherit, white and gold', () => {
  it('prints the career activation and the white inherit figure on each chip', () => {
    const html = renderOdds(false);
    expect(chipText(html, 'Uma Stan')).toBe('Uma Stan|5★|40%|(10%)');
    expect(chipText(html, 'Nimble Navigator')).toBe('Nimble Navigator|5★|60%|(18%)');
    // Together: 40% x 60% to activate, 10% x 18% to inherit.
    expect(html).toContain('both activate');
    expect(html).toContain('24%');
    expect(html).toContain('all skills inherited');
    expect(html).toContain('1.8%');
  });

  it('doubles the roll for the criterion that asked for gold, and only for it', () => {
    const html = renderOdds(true);
    expect(chipText(html, 'Uma Stan')).toBe('Uma Stan|5★|40%|(20%)');
    expect(chipText(html, 'Nimble Navigator')).toBe('Nimble Navigator|5★|60%|(18%)');
    // Activation does not care about the tier; inheriting does: 20% x 18%.
    expect(html).toContain('24%');
    expect(html).toContain('3.6%');
  });
});

describe('what the pick count decides', () => {
  it('is need-picks until there are exactly two, and carries the count', () => {
    expect(paneState(100101, [], false, null, null)).toEqual({ kind: 'need-picks', picked: 0 });
    expect(paneState(100101, [own(1, 100601)], false, null, null)).toEqual({
      kind: 'need-picks',
      picked: 1,
    });
  });

  it('shows a stale error under a full pair rather than the previous lineage', () => {
    // Order matters: an error from the pair being explained now must not be
    // hidden behind the last pair's numbers.
    expect(paneState(100101, [own(1, 100601), own(2, 100901)], false, 'boom', lineage)).toEqual({
      kind: 'error',
      message: 'boom',
    });
  });

  it('shows the spinner while a pair is being re-explained', () => {
    expect(paneState(100101, [own(1, 100601), own(2, 100901)], true, null, lineage)).toEqual({
      kind: 'loading',
    });
  });
});
