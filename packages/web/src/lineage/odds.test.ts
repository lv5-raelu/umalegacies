import { describe, expect, it } from 'vitest';
import type { RosterSparkOption, SparkCriterion, SparkKind, SparkSummaryRow } from '@umalegacies/types';
import {
  type OddsView,
  cellInherit,
  goldGroupsOf,
  jointFigures,
  sparkExplanation,
  valueFor,
} from './odds';

/**
 * Hand-built rows whose figures are exact by hand, so a wrong number is a wrong
 * rule rather than a rounding argument. Uma Stan: 40% across a career, two
 * carriers, so the roll is 25% white and 50% gold.
 */
const row = (over: Partial<SparkSummaryRow> & { groupId: number; kind: SparkKind }): SparkSummaryRow =>
  ({
    name: `spark ${over.groupId}`,
    stars: 3,
    carriers: [],
    withinOneInspiration: 0.2,
    onceInCareer: 0.4,
    twiceInCareer: 0.1,
    lineageCarriers: 2,
    timing: null,
    aptitude: null,
    ...over,
  }) as SparkSummaryRow;

const umaStan = row({ groupId: 2002, kind: 'white_skill', name: 'Uma Stan', stars: 5 });
const navigator = row({
  groupId: 2001,
  kind: 'white_skill',
  name: 'Nimble Navigator',
  withinOneInspiration: 0.35,
  onceInCareer: 0.6,
  twiceInCareer: 0.2,
  lineageCarriers: 4,
});
const derby = row({ groupId: 3001, kind: 'white_race', name: 'Japanese Derby', stars: 1 });
const speed = row({
  groupId: 101,
  kind: 'blue',
  name: 'Speed',
  withinOneInspiration: 0.5,
  onceInCareer: 0.75,
  twiceInCareer: 0.25,
  lineageCarriers: 3,
});

const options: RosterSparkOption[] = [
  { groupId: 2001, kind: 'white_skill', name: 'Nimble Navigator', veterans: 3 },
  { groupId: 2002, kind: 'white_skill', name: 'Uma Stan', veterans: 3 },
  { groupId: 2003, kind: 'white_skill', name: 'Tail Held High', veterans: 1 },
  { groupId: 3001, kind: 'white_race', name: 'Japanese Derby', veterans: 2 },
  { groupId: 101, kind: 'blue', name: 'Speed', veterans: 9 },
];

const wants = (groupId: number, over: Partial<SparkCriterion> = {}): SparkCriterion => ({
  groupId,
  minStars: 1,
  scope: 'package',
  ...over,
});

const VIEWS: readonly OddsView[] = ['inspiration', 'once', 'twice'];

describe('valueFor', () => {
  it('reads the column the window names', () => {
    expect(valueFor(umaStan, 'inspiration')).toBe(0.2);
    expect(valueFor(umaStan, 'once')).toBe(0.4);
    expect(valueFor(umaStan, 'twice')).toBe(0.1);
  });
});

describe('goldGroupsOf', () => {
  it('collects only the criteria that asked for gold', () => {
    const gold = goldGroupsOf([wants(2001), wants(2002, { gold: true }), wants(2003, { gold: false })]);
    expect([...gold]).toEqual([2002]);
  });
});

describe('cellInherit', () => {
  it('is career activation times the roll, white or gold', () => {
    expect(cellInherit(umaStan, false)).toBeCloseTo(0.1);
    expect(cellInherit(umaStan, true)).toBeCloseTo(0.2);
  });

  it('has no figure for anything but a white skill', () => {
    expect(cellInherit(derby, false)).toBeNull();
    expect(cellInherit(speed, true)).toBeNull();
  });
});

describe('jointFigures', () => {
  const both = [wants(2001), wants(2002)];

  it('multiplies two present terms and says both', () => {
    const { act, inh } = jointFigures([navigator, umaStan], both, options, 'once');
    expect(act).toMatchObject({ present: 2, total: 2, scope: 'both activate' });
    expect(act.value).toBeCloseTo(0.24);
    // 18% x 10%.
    expect(inh).toMatchObject({ present: 2, total: 2, scope: 'all skills inherited' });
    expect(inh.value).toBeCloseTo(0.018);
  });

  it('follows the window for activation and never for inheriting', () => {
    const { act, inh } = jointFigures([navigator, umaStan], both, options, 'inspiration');
    expect(act.value).toBeCloseTo(0.35 * 0.2);
    expect(inh.value).toBeCloseTo(0.018);
  });

  it('gives the one carried term its own figure, scoped "1 of 2"', () => {
    const { act } = jointFigures([umaStan], both, options, 'once');
    expect(act).toMatchObject({ value: 0.4, present: 1, total: 2, scope: '1 of 2 activate' });
  });

  it('has no value at all when nothing is carried, and still says so', () => {
    const { act } = jointFigures([], both, options, 'once');
    expect(act).toMatchObject({ value: null, present: 0, total: 2, scope: '0 of 2 activate' });
  });

  it('counts a wanted white SKILL the pair misses as a zero to inherit', () => {
    // Missing from the pair, but the catalogue says it is a skill: a failure,
    // not a gap. So the product is zero rather than the one skill's figure.
    const { inh } = jointFigures([umaStan], [wants(2002), wants(2003)], options, 'once');
    expect(inh).toMatchObject({ value: 0, present: 2, total: 2 });
  });

  it('leaves out a missed spark with no inherit figure, rather than zeroing', () => {
    // A blue and a race spark have no inherit figure for any pair.
    const { inh } = jointFigures([umaStan], [wants(2002), wants(101), wants(3001)], options, 'once');
    expect(inh).toMatchObject({ present: 1, total: 1 });
    expect(inh.value).toBeCloseTo(0.1);
  });

  it('rides the gold tier on the criterion', () => {
    const { inh } = jointFigures([navigator, umaStan], [wants(2001), wants(2002, { gold: true })], options, 'once');
    expect(inh.value).toBeCloseTo(0.18 * 0.2);
  });

  it('leaves an excluded criterion out of both products and both scopes', () => {
    const { act, inh } = jointFigures(
      [navigator, umaStan, speed],
      [wants(2001), wants(2002), wants(101, { excludeFromOdds: true })],
      options,
      'once',
    );
    expect(act.total).toBe(2);
    expect(act.value).toBeCloseTo(0.24);
    expect(inh.total).toBe(2);
  });
});

describe('sparkExplanation', () => {
  it('states the career chain for a white skill in the career window', () => {
    expect(sparkExplanation(umaStan, 'once', false)).toBe(
      'Uma Stan 5★ — Career: 40% to activate × 25% to inherit = 10% combined.',
    );
  });

  it('states the selected window on its own, before the career chain', () => {
    expect(sparkExplanation(umaStan, 'inspiration', false)).toBe(
      'Uma Stan 5★ — 20% in one inspiration. Career: 40% to activate × 25% to inherit = 10% combined.',
    );
    expect(sparkExplanation(umaStan, 'twice', true)).toBe(
      'Uma Stan 5★ — 10% to activate at least twice. Career: 40% to activate × 50% to inherit = 20% combined.',
    );
  });

  it('gives a race spark its roll with no product', () => {
    expect(sparkExplanation(derby, 'once', false)).toBe(
      'Japanese Derby 1★ — 40% to activate, then 25% to inherit if the trainee earns it',
    );
  });

  it('gives a blue its activation alone', () => {
    expect(sparkExplanation(speed, 'twice', false)).toBe('Speed 3★ — 25% to activate');
  });

  /*
   * The regression this module was extracted to fix. The sentence used to
   * multiply the SELECTED window's activation by a roll whose inherit figure
   * was built from CAREER activation, so under "1 inspiration" it read
   * "20% x 25% = 10%". Whatever the window, the equation it prints must hold.
   */
  it('prints an equation that is true in every window, white and gold', () => {
    const pct = (s: string) => Number(s.replace('%', '')) / 100;
    for (const spark of [umaStan, navigator]) {
      for (const gold of [false, true]) {
        for (const view of VIEWS) {
          const text = sparkExplanation(spark, view, gold);
          const m = text.match(/([\d.]+%) to activate × ([\d.]+%) to inherit = ([\d.]+%) combined/);
          expect(m, text).not.toBeNull();
          const [, a, k, c] = m as RegExpMatchArray;
          expect(pct(a as string) * pct(k as string), text).toBeCloseTo(pct(c as string), 2);
          expect(pct(c as string), text).toBeCloseTo(cellInherit(spark, gold) as number, 2);
        }
      }
    }
  });
});
