import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LineageResponse } from '@umalegacies/types';
import { PairDetail } from './PairDetail';
import type { PairRowData } from './search-rows';

/*
 * Regression 7 (eng re-review): the search's detail embeds the roster pane,
 * and the pane's window now comes from App. The dialog must follow it, or the
 * search and the roster read one pair in two windows.
 */
const lineage = {
  pairTotal: {
    ruleId: 'total.pair',
    label: 'Pair total',
    value: 284,
    sources: [],
    children: [
      { ruleId: 'base.two_way', label: 'base', value: 274, sources: [], children: [] },
      { ruleId: 'bonus.shared_g1', label: 'bonus', value: 10, sources: [], children: [] },
    ],
  },
  individualAffinity: {},
  relationRank: { value: 3, ruleId: 'rank.lookup', sources: [] },
  rankBounds: { min: 151, max: 999 },
  masterHash: 'abc',
  trainee: { charaId: 1001, name: 'Special Week', portraitCardId: 100101, resolution: { ok: true } },
  ancestors: {},
  sparks: [
    {
      groupId: 2,
      kind: 'blue',
      name: 'Stamina',
      stars: 3,
      carriers: [],
      withinOneInspiration: 0.5,
      onceInCareer: 0.75,
      twiceInCareer: 0.25,
      lineageCarriers: 1,
      timing: null,
      aptitude: null,
    },
  ],
} as unknown as LineageResponse;

const row = {
  a: { index: 0, self: { name: 'Oguri Cap' } },
  b: { index: 1, self: { name: 'Gold Ship' } },
} as unknown as PairRowData;

const render = (view: 'inspiration' | 'once' | 'twice') =>
  renderToStaticMarkup(
    <PairDetail
      state={{ kind: 'ok', lineage }}
      row={row}
      criteria={[]}
      sparkOptions={[]}
      view={view}
      onView={() => {}}
      onClose={() => {}}
      onChoose={() => {}}
    />,
  );

describe("the search detail's embedded pane", () => {
  it('reads the shared window', () => {
    expect(render('once')).toContain('>75%<');
    expect(render('twice')).toContain('>25%<');
    expect(render('inspiration')).toContain('>50%<');
  });

  it('marks the shared window as the pressed one', () => {
    expect(render('twice')).toMatch(/aria-pressed="true"[^>]*>at least twice</);
  });
});
