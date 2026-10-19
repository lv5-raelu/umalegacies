import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  LineageResponse,
  ParentPick,
  ResolvedVeteran,
  RosterResolveResponse,
  SparkSummaryRow,
} from '@umalegacies/types';
import { catalogueOf } from '../roster/catalogue';
import { CarrierSlots } from './CarrierSlots';
import { compareModel, type ModelColumn } from './compare-model';
import { ComparePage, FRESH_COMPARE } from './ComparePage';
import { CompareTable, type Slot } from './CompareTable';
import type { ColumnResult } from './run-columns';
import { columnKey } from './useCompareColumns';
import type { TrayPair } from './tray';

/*
 * What /compare PRINTS in each state, through renderToStaticMarkup like every
 * other component test. Effects do not run here, so a column with no stored
 * result reads as loading -- exactly the first render a reader sees.
 */

const member = (cardId: number, charaId: number, name: string) => ({
  cardId,
  charaId,
  name,
  costume: null,
  resolution: { ok: true as const },
});
const veteran = (index: number, cardId: number, charaId: number, name: string): ResolvedVeteran => ({
  index,
  score: 18000 + index,
  self: member(cardId, charaId, name),
  parents: [member(100401, 1004, 'Inari One'), member(102401, 1024, 'Mayano Top Gun')],
  sparks: [{ groupId: 2, stars: [2, 1, 0] }],
  unknownFactorIds: [],
  ok: true,
});
const roster: RosterResolveResponse = {
  veterans: [
    veteran(0, 100601, 1006, 'Oguri Cap'),
    veteran(1, 101401, 1014, 'Gold Ship'),
    veteran(2, 100901, 1009, 'Tamamo Cross'),
  ],
  sparkOptions: [{ groupId: 2, kind: 'blue', name: 'Stamina', veterans: 3 }],
  unresolvedCount: 0,
  masterHash: 'abc',
};
const trainees = [
  { cardId: 100101, charaId: 1001, name: 'Special Week', costume: null, ambiguous: false },
  { cardId: 100601, charaId: 1006, name: 'Oguri Cap', costume: null, ambiguous: false },
];
const own = (index: number): ParentPick => ({
  kind: 'own',
  index,
  cardId: roster.veterans[index]?.self.cardId ?? 0,
});
const pair = (a: number, b: number): TrayPair => [own(a), own(b)];

const page = (
  tray: TrayPair[],
  over: { traineeCardId?: number | null; results?: Map<string, ColumnResult>; trayCleared?: boolean; criteria?: [] } = {},
) =>
  renderToStaticMarkup(
    <ComparePage
      roster={roster}
      veterans={[]}
      trainees={trainees}
      traineeCardId={over.traineeCardId === undefined ? 100101 : over.traineeCardId}
      onTrainee={() => {}}
      tray={tray}
      onTray={() => {}}
      criteria={over.criteria ?? []}
      view="once"
      onView={() => {}}
      memory={FRESH_COMPARE}
      onMemory={() => {}}
      results={over.results ?? new Map()}
      onStale={() => {}}
      onShowBreakdown={() => {}}
      trayCleared={over.trayCleared ?? false}
      onTrayClearedSeen={() => {}}
      target={null}
      onTargetUsed={() => {}}
      nav={null}
    />,
  );

describe('the compare page', () => {
  it('with no pairs: no controls, no table, and where pairs come from', () => {
    const html = page([]);
    expect(html).toContain('Nothing to compare yet. Add pairs from');
    expect(html).toContain('Optimize Parents');
    expect(html).toContain('roster pane');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('Hide rows identical');
  });

  it('with one pair: its column, the add slot, no filter toggles', () => {
    const html = page([pair(0, 1)]);
    expect(html).toContain('1 of 4');
    expect(html).toContain('Add one more pair to compare.');
    expect(html).toContain('Add a pair');
    expect(html).not.toContain('Hide rows identical');
  });

  it('with two pairs: the identical toggle, but no filtered-sparks toggle without a filter', () => {
    const html = page([pair(0, 1), pair(0, 2)]);
    expect(html).toContain('Hide rows identical in every pair');
    expect(html).not.toContain('Only my filtered sparks');
  });

  it('with no trainee: the picker and one line, no table', () => {
    const html = page([pair(0, 1)], { traineeCardId: null });
    expect(html).toContain('Choose who you are training.');
    expect(html).not.toContain('<table');
  });

  it('a loading column: its identity at once, skeletons for what waits on the trainee', () => {
    const html = page([pair(0, 1)]);
    expect(html).toContain('Oguri Cap');
    expect(html).toContain('18000');
    expect(html).toContain('Inari One × Mayano Top Gun');
    expect(html).toContain('Explaining…');
    expect(html).toMatch(/class="[^"]*skeleton/);
  });

  it('a blocked column: the reason in words, no skeleton, no breakdown button', () => {
    // Oguri Cap is the trainee: P1 cannot be.
    const results = new Map<string, ColumnResult>([
      [columnKey('abc', 100601, pair(0, 1)), { kind: 'blocked', reason: 'P1 is the trainee' }],
    ]);
    const html = page([pair(0, 1)], { traineeCardId: 100601, results });
    expect(html).toContain('P1 is the trainee');
    expect(html).not.toContain('Explaining…');
    expect(html).not.toContain('Show breakdown');
  });

  it('an error column: the message, muted, with retry', () => {
    const results = new Map<string, ColumnResult>([
      [columnKey('abc', 100101, pair(0, 1)), { kind: 'error', message: 'Could not load the game data' }],
    ]);
    const html = page([pair(0, 1)], { results });
    expect(html).toContain('Could not load the game data');
    expect(html).toContain('>retry<');
  });

  it('says once that the tray was cleared with the roster', () => {
    expect(page([], { trayCleared: true })).toContain(
      'Your compare tray was cleared because the roster changed.',
    );
  });
});

/* Design review 6B: real table semantics. */
describe('the compare table', () => {
  const lineage = {
    pairTotal: {
      ruleId: 'total.pair',
      label: 'Pair total',
      value: 284,
      sources: [],
      children: [
        { ruleId: 'base.two_way', label: 'base', value: 131, sources: [], children: [] },
        { ruleId: 'bonus.shared_g1', label: 'bonus', value: 153, sources: [], children: [] },
      ],
    },
    relationRank: { value: 3, ruleId: 'rank.lookup', sources: [] },
    trainee: { charaId: 1013, name: 'Mejiro Ryan', portraitCardId: 101301, resolution: { ok: true } },
    sparks: [],
  } as unknown as LineageResponse;
  const column = (letter: string, p: TrayPair, result: ColumnResult): ModelColumn => ({
    letter,
    pair: p,
    halves: [roster.veterans[p[0].kind === 'own' ? p[0].index : 0] ?? null, null],
    result,
  });
  const columns = [column('A', pair(0, 1), { kind: 'ok', lineage }), column('B', pair(0, 2), { kind: 'loading' })];
  const model = compareModel({
    columns,
    criteria: [],
    sparkOptions: roster.sparkOptions,
    view: 'once',
    timingOf: () => null,
    hideIdentical: false,
    onlyFiltered: false,
    open: new Set([2]),
  });
  const slots: Slot[] = columns.map((c) => ({ kind: 'live', letter: c.letter, column: c, key: c.letter }));
  const html = renderToStaticMarkup(
    <CompareTable
      traineeName="Mejiro Ryan"
      slots={slots}
      model={model}
      catalogue={catalogueOf(roster.sparkOptions)}
      view="once"
      open={new Set([2])}
      rowsReady
      showAddSlot
      boxRef={() => {}}
      onToggle={() => {}}
      onRemove={() => {}}
      onShowBreakdown={() => {}}
      onRetry={() => {}}
      onShowAll={() => {}}
    />,
  );

  it('has a caption, column headers and row headers', () => {
    expect(html).toContain('<caption');
    expect(html).toContain('Compare pairs for Mejiro Ryan');
    expect(html).toContain('scope="col"');
    expect(html).toMatch(/<th scope="row"[^>]*>.*Stamina/s);
  });

  it('expands with aria-expanded and aria-controls pointing at the expansion', () => {
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="compare-exp-2"');
    expect(html).toContain('id="compare-exp-2"');
  });

  it('keeps its legend on screen', () => {
    expect(html).toContain('★ · carriers of 6 · activate · (inherit, career)');
    expect(html).toContain('at least once');
  });

  it('names each pair for "Remove pair A"', () => {
    expect(html).toContain('aria-label="Remove pair A"');
  });
});

/* Design review 1D / D20: named slots, stars and per-inspiration, no IA. */
describe('the carrier expansion', () => {
  const detail = {
    groupId: 2,
    carriers: [
      { position: 10, stars: 2, individualAffinity: 150, baseRate: 0.1, perInspiration: 0.28 },
      { position: 11, stars: 1, individualAffinity: 40, baseRate: 0.05, perInspiration: 0.07 },
    ],
  } as unknown as SparkSummaryRow;
  const column: ModelColumn = {
    letter: 'A',
    pair: pair(0, 1),
    halves: [roster.veterans[0] ?? null, roster.veterans[1] ?? null],
    result: { kind: 'ok', lineage: {} as LineageResponse },
  };
  const html = renderToStaticMarkup(
    <CarrierSlots
      column={column}
      cell={{ carried: true, stars: '3★', carriers: '2/6', act: '', inh: '', title: null, detail }}
    />,
  );
  const lines = html.split('<li').slice(1);

  it('names all six slots, P1 and P2 with their parents', () => {
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain('P1');
    expect(lines[0]).toContain('Oguri Cap');
    expect(lines[1]).toContain('Inari One');
    expect(lines[3]).toContain('P2');
    expect(lines[3]).toContain('Gold Ship');
  });

  it('prints stars and the per-inspiration rate, and a dash where it is not carried', () => {
    expect(lines[0]).toContain('2★');
    expect(lines[0]).toContain('28%');
    expect(lines[2]).toContain('—');
  });

  it('never prints Individual Affinity', () => {
    expect(html).not.toContain('150');
    expect(html).not.toContain('IA');
  });
});
