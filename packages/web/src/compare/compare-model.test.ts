import { describe, expect, it } from 'vitest';
import type {
  LineageResponse,
  PackageSpark,
  ParentPick,
  ResolvedVeteran,
  RosterSparkOption,
  SparkCriterion,
  SparkKind,
  SparkSummaryRow,
} from '@umalegacies/types';
import { jointFigures } from '../lineage/odds';
import { percentJoint } from '../lineage/sparks';
import { compareModel, hiddenBy, type ModelColumn, type ModelInput } from './compare-model';
import type { ColumnResult } from './run-columns';

/*
 * Groups used below. 2 is a blue, 15 a pink, and the 2000s white skills; 2003
 * is carried by no pair, so it exists only because a criterion names it.
 */
const STAMINA = 2;
const MEDIUM = 15;
const UMA_STAN = 2001;
const NAVIGATOR = 2002;
const RAMP_UP = 2003;
const ARC_MAESTRO = 2004;

const options: RosterSparkOption[] = [
  { groupId: STAMINA, kind: 'blue', name: 'Stamina', veterans: 9 },
  { groupId: MEDIUM, kind: 'pink', name: 'Medium', veterans: 9 },
  { groupId: UMA_STAN, kind: 'white_skill', name: 'Uma Stan', veterans: 9 },
  { groupId: NAVIGATOR, kind: 'white_skill', name: 'Nimble Navigator', veterans: 9 },
  { groupId: RAMP_UP, kind: 'white_skill', name: 'Ramp Up', veterans: 1 },
  { groupId: ARC_MAESTRO, kind: 'white_skill', name: 'Arc Maestro', veterans: 9 },
];
const kindOf = (groupId: number): SparkKind =>
  options.find((o) => o.groupId === groupId)?.kind ?? 'white_skill';

const veteran = (index: number, sparks: PackageSpark[]): ResolvedVeteran => ({
  index,
  score: 18_000 + index,
  self: { cardId: 100600 + index, charaId: 1000 + index, name: `uma ${index}`, costume: null, resolution: { ok: true } },
  parents: [null, null],
  sparks,
  unknownFactorIds: [],
  ok: true,
});

const own = (v: ResolvedVeteran): ParentPick => ({ kind: 'own', index: v.index, cardId: v.self.cardId });

/** A lineage row whose career and window figures are given; carriers from the packages. */
const row = (
  groupId: number,
  stars: number,
  carriers: number,
  odds: { inspiration?: number; once: number; twice?: number },
): SparkSummaryRow =>
  ({
    groupId,
    kind: kindOf(groupId),
    name: options.find((o) => o.groupId === groupId)?.name ?? '?',
    stars,
    carriers: [],
    withinOneInspiration: odds.inspiration ?? odds.once / 2,
    onceInCareer: odds.once,
    twiceInCareer: odds.twice ?? odds.once / 4,
    lineageCarriers: carriers,
    timing: null,
    aptitude: null,
  }) as unknown as SparkSummaryRow;

const ok = (rows: SparkSummaryRow[]): ColumnResult => ({
  kind: 'ok',
  lineage: { sparks: rows } as unknown as LineageResponse,
});

// Halves: each carries Stamina and Uma Stan; v1 and v3 also carry Navigator.
const v0 = veteran(0, [
  { groupId: STAMINA, stars: [3, 0, 0] },
  { groupId: UMA_STAN, stars: [1, 1, 0] },
]);
const v1 = veteran(1, [
  { groupId: STAMINA, stars: [2, 0, 0] },
  { groupId: UMA_STAN, stars: [0, 2, 0] },
  { groupId: NAVIGATOR, stars: [1, 0, 1] },
]);
const v2 = veteran(2, [
  { groupId: STAMINA, stars: [3, 0, 0] },
  { groupId: UMA_STAN, stars: [1, 1, 0] },
]);
const v3 = veteran(3, [
  { groupId: STAMINA, stars: [2, 0, 0] },
  { groupId: UMA_STAN, stars: [0, 2, 0] },
  { groupId: NAVIGATOR, stars: [2, 0, 0] },
]);

// A = v0 x v1, B = v2 x v3. Stamina 5★ 2/6 and Uma Stan 4★ 3/6 in both.
// Navigator: A 2★ 2/6, B 2★ 1/6 -- differs.
const linA = [
  row(STAMINA, 5, 2, { once: 1 }),
  row(UMA_STAN, 4, 3, { once: 0.4312, inspiration: 0.2, twice: 0.1 }),
  row(NAVIGATOR, 2, 2, { once: 0.3 }),
];
const linB = [
  row(STAMINA, 5, 2, { once: 1 }),
  // 43.49% prints as 43% too: identical as printed. Differs under "at least twice".
  row(UMA_STAN, 4, 3, { once: 0.4349, inspiration: 0.2, twice: 0.15 }),
  row(NAVIGATOR, 2, 1, { once: 0.2 }),
];

const column = (letter: string, a: ResolvedVeteran, b: ResolvedVeteran, result: ColumnResult): ModelColumn => ({
  letter,
  pair: [own(a), own(b)],
  halves: [a, b],
  result,
});

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  columns: [column('A', v0, v1, ok(linA)), column('B', v2, v3, ok(linB))],
  criteria: [],
  sparkOptions: options,
  view: 'once',
  timingOf: () => null,
  hideIdentical: true,
  onlyFiltered: false,
  open: new Set(),
  ...over,
});

const visible = (model: ReturnType<typeof compareModel>) => [
  ...model.filtered.map((r) => r.name),
  ...model.groups.flatMap((g) => g.rows.map((r) => r.name)),
];
const want = (groupId: number, over: Partial<SparkCriterion> = {}): SparkCriterion => ({
  groupId,
  minStars: 1,
  scope: 'package',
  ...over,
});

describe('rows', () => {
  it('are the union of both pairs, by group, read off the roster', () => {
    const model = compareModel(input({ hideIdentical: false }));
    expect(visible(model).sort()).toEqual(['Nimble Navigator', 'Stamina', 'Uma Stan']);
  });

  it('exist, with stars and carriers, before any column has numbers', () => {
    const loading: ColumnResult = { kind: 'loading' };
    const model = compareModel(
      input({ columns: [column('A', v0, v1, loading), column('B', v2, v3, loading)] }),
    );
    const navigator = model.groups.flatMap((g) => g.rows).find((r) => r.groupId === NAVIGATOR);
    expect(navigator?.cells.map((c) => [c.stars, c.carriers, c.act])).toEqual([
      ['2★', '2/6', null],
      ['2★', '1/6', null],
    ]);
  });

  it('do not change when the trainee switch puts every column back to loading', () => {
    const before = compareModel(input({ hideIdentical: false }));
    const loading: ColumnResult = { kind: 'loading' };
    const after = compareModel(
      input({ hideIdentical: false, columns: [column('A', v0, v1, loading), column('B', v2, v3, loading)] }),
    );
    expect(visible(after)).toEqual(visible(before));
  });

  it('are the same for A x B and B x A', () => {
    const ab = compareModel(input({ columns: [column('A', v0, v1, { kind: 'loading' })] }));
    const ba = compareModel(input({ columns: [column('A', v1, v0, { kind: 'loading' })] }));
    expect(visible(ba)).toEqual(visible(ab));
    expect(ba.groups.flatMap((g) => g.rows.map((r) => r.cells[0]?.stars))).toEqual(
      ab.groups.flatMap((g) => g.rows.map((r) => r.cells[0]?.stars)),
    );
  });

  it('lead with the filtered sparks in the order asked, including one no pair carries', () => {
    const model = compareModel(input({ criteria: [want(RAMP_UP), want(UMA_STAN)] }));
    expect(model.filtered.map((r) => r.name)).toEqual(['Ramp Up', 'Uma Stan']);
    const ramp = model.filtered[0];
    expect(ramp?.kind).toBe('white_skill');
    expect(ramp?.cells.every((c) => !c.carried)).toBe(true);
  });

  it('follow SPARK_GROUP_ORDER, then name', () => {
    const v4 = veteran(4, [
      { groupId: MEDIUM, stars: [1, 0, 0] },
      { groupId: ARC_MAESTRO, stars: [1, 0, 0] },
      { groupId: NAVIGATOR, stars: [1, 0, 0] },
    ]);
    const model = compareModel(
      input({ hideIdentical: false, columns: [column('A', v4, v0, { kind: 'loading' })] }),
    );
    expect(model.groups.map((g) => g.key)).toEqual(['blue', 'pink', 'white_skill']);
    expect(model.groups.at(-1)?.rows.map((r) => r.name)).toEqual([
      'Arc Maestro',
      'Nimble Navigator',
      'Uma Stan',
    ]);
  });

  it('take their heading from the game data timing, not from a lineage', () => {
    const model = compareModel(
      input({
        hideIdentical: false,
        timingOf: (id) => (id === NAVIGATOR ? 'late' : null),
        columns: [column('A', v0, v1, { kind: 'loading' })],
      }),
    );
    expect(model.groups.map((g) => g.key)).toContain('timing:late');
  });
});

describe('cells', () => {
  it('print stars, carriers, activation and the bracketed inherit', () => {
    const model = compareModel(input({ hideIdentical: false }));
    const stan = model.groups.flatMap((g) => g.rows).find((r) => r.groupId === UMA_STAN);
    // 43.12% x (20% + 3 x 2.5%) = 11.858%.
    expect(stan?.cells[0]).toMatchObject({ stars: '4★', carriers: '3/6', act: '43%', inh: '(12%)' });
  });

  it('leave the inherit slot EMPTY for a non-skill, never a dash', () => {
    const model = compareModel(input({ hideIdentical: false }));
    const stamina = model.groups.flatMap((g) => g.rows).find((r) => r.groupId === STAMINA);
    expect(stamina?.cells[0]).toMatchObject({ carried: true, act: '100%', inh: '' });
  });

  it('say not-carried once, for the whole cell', () => {
    const model = compareModel(input({ criteria: [want(RAMP_UP)] }));
    expect(model.filtered[0]?.cells[0]).toMatchObject({ carried: false, stars: '', carriers: '' });
  });

  it('carry the chip explanation in words', () => {
    const model = compareModel(input({ hideIdentical: false }));
    const rows = model.groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.groupId === UMA_STAN)?.cells[0]?.title).toBe(
      'Uma Stan 4★ — Career: 43% to activate × 27.5% to inherit = 12% combined · carried by 3 of 6',
    );
    expect(rows.find((r) => r.groupId === STAMINA)?.cells[0]?.title).toBe(
      'Stamina 5★ — 100% to activate · carried by 2 of 6',
    );
  });

  it('follow the gold plan per spark', () => {
    const model = compareModel(input({ criteria: [want(UMA_STAN, { gold: true })] }));
    // 43.12% x (40% + 3 x 5%) = 23.716%.
    expect(model.filtered[0]?.cells[0]?.inh).toBe('(24%)');
  });
});

describe('identical rows', () => {
  it('compare the PRINTED cells: 43.12% and 43.49% both read 43% and hide', () => {
    const model = compareModel(input());
    expect(visible(model)).toEqual(['Nimble Navigator']);
    expect(model.hidden).toEqual({ identical: 2, filter: 0 });
  });

  it('reappear when the window makes them differ', () => {
    const model = compareModel(input({ view: 'twice' }));
    expect(visible(model)).toContain('Uma Stan');
  });

  it('never apply with one finished column', () => {
    const model = compareModel(input({ columns: [column('A', v0, v1, ok(linA))] }));
    expect(model.identicalApplies).toBe(false);
    expect(model.hidden.identical).toBe(0);
    expect(model.canCompare).toBe(false);
  });

  it('wait while any column is loading, and keep the toggle meanwhile', () => {
    const model = compareModel(
      input({
        columns: [
          column('A', v0, v1, ok(linA)),
          column('B', v2, v3, ok(linB)),
          column('C', v0, v3, { kind: 'loading' }),
        ],
      }),
    );
    expect(model.hidden.identical).toBe(0);
    expect(model.canCompare).toBe(true);
  });

  it('ignore a blocked column, which also does not count toward comparing', () => {
    const blocked: ColumnResult = { kind: 'blocked', reason: 'P1 is the trainee' };
    const model = compareModel(
      input({ columns: [column('A', v0, v1, ok(linA)), column('B', v2, v3, ok(linB)), column('C', v0, v3, blocked)] }),
    );
    expect(model.hidden.identical).toBe(2);
    const oneLeft = compareModel(input({ columns: [column('A', v0, v1, ok(linA)), column('C', v0, v3, blocked)] }));
    expect(oneLeft.canCompare).toBe(false);
  });

  it('treat an empty inherit slot and a dash as different', () => {
    // Stamina is carried by A only: its B cell is the dash, A's an empty inherit slot.
    const v5 = veteran(5, [{ groupId: UMA_STAN, stars: [1, 1, 0] }]);
    const v7 = veteran(7, [
      { groupId: UMA_STAN, stars: [0, 2, 0] },
      { groupId: NAVIGATOR, stars: [1, 0, 1] },
    ]);
    const model = compareModel(
      input({
        columns: [
          column('A', v0, v1, ok(linA)),
          column('B', v5, v7, ok([row(UMA_STAN, 4, 3, { once: 0.4312 }), row(NAVIGATOR, 2, 2, { once: 0.3 })])),
        ],
      }),
    );
    const stamina = model.groups.flatMap((g) => g.rows).find((r) => r.groupId === STAMINA);
    expect(stamina?.cells.map((c) => [c.carried, c.inh])).toEqual([
      [true, ''],
      [false, ''],
    ]);
    expect(stamina?.identical).toBe(false);
    // And the rows that DO print the same in both are hidden, so the rule is live.
    expect(visible(model)).toEqual(['Stamina']);
  });
});

describe('the one visibility rule', () => {
  it('never hides a filtered spark or an open row', () => {
    expect(hiddenBy({ filtered: true, identical: true, open: false }, { onlyFiltered: true, hideIdentical: true })).toBeNull();
    expect(hiddenBy({ filtered: false, identical: true, open: true }, { onlyFiltered: true, hideIdentical: true })).toBeNull();
  });

  it('gives each hidden row one reason, so the parts add up', () => {
    const model = compareModel(input({ criteria: [want(UMA_STAN)], onlyFiltered: true }));
    // Uma Stan is filtered and identical: shown. The other two: 'filter', not both.
    expect(model.filtered.map((r) => r.name)).toEqual(['Uma Stan']);
    expect(model.hidden).toEqual({ identical: 0, filter: 2 });
  });

  it('keeps an open row that becomes identical', () => {
    const model = compareModel(input({ open: new Set([STAMINA]) }));
    expect(visible(model)).toContain('Stamina');
  });

  it('ignores "only my filtered sparks" with no filter', () => {
    const model = compareModel(input({ onlyFiltered: true, hideIdentical: false }));
    expect(model.hidden.filter).toBe(0);
  });
});

describe('the together rows', () => {
  it('are absent below two counted criteria', () => {
    expect(compareModel(input({ criteria: [want(UMA_STAN)] })).together).toEqual([]);
    expect(
      compareModel(input({ criteria: [want(UMA_STAN), want(NAVIGATOR, { excludeFromOdds: true })] })).together,
    ).toEqual([]);
  });

  it('equal the pane figures for the same pair, window and gold plan', () => {
    const criteria = [want(UMA_STAN, { gold: true }), want(NAVIGATOR), want(STAMINA)];
    const model = compareModel(input({ criteria, view: 'inspiration' }));
    const pane = jointFigures(linA, criteria, options, 'inspiration');
    expect(model.together.map((r) => r.label)).toEqual(['Together: activate', 'Together: inherited']);
    expect(model.together[0]?.cells[0]).toEqual({ value: percentJoint(pane.act.value as number), scope: pane.act.scope });
    expect(model.together[1]?.cells[0]).toEqual({ value: percentJoint(pane.inh.value as number), scope: pane.inh.scope });
  });

  it('give a column carrying one of two its own figure, and none an empty value', () => {
    const v5 = veteran(5, [{ groupId: STAMINA, stars: [1, 0, 0] }]);
    const v6 = veteran(6, [{ groupId: MEDIUM, stars: [1, 0, 0] }]);
    const model = compareModel(
      input({
        criteria: [want(UMA_STAN), want(RAMP_UP)],
        columns: [
          column('A', v0, v1, ok(linA)),
          column('B', v5, v6, ok([row(STAMINA, 1, 1, { once: 0.5 }), row(MEDIUM, 1, 1, { once: 0.5 })])),
        ],
      }),
    );
    expect(model.together[0]?.cells).toEqual([
      { value: '43.12%', scope: '1 of 2 activate' },
      { value: '', scope: '0 of 2 activate' },
    ]);
  });

  it('have no figure for a column with no numbers', () => {
    const model = compareModel(
      input({ criteria: [want(UMA_STAN), want(NAVIGATOR)], columns: [column('A', v0, v1, { kind: 'loading' })] }),
    );
    expect(model.together[0]?.cells).toEqual([null]);
  });
});

describe('shared halves', () => {
  it('name the earlier side a column shares, across positions', () => {
    const model = compareModel(
      input({
        columns: [
          column('A', v0, v1, { kind: 'loading' }),
          column('B', v2, v3, { kind: 'loading' }),
          column('C', v1, v3, { kind: 'loading' }),
        ],
      }),
    );
    expect(model.sharedHalves).toEqual([
      [null, null],
      [null, null],
      ['same half as A·P2', 'same half as B·P2'],
    ]);
  });
});
