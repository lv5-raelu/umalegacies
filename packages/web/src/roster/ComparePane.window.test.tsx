// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LineageResponse, ParentPick } from '@umalegacies/types';
import type { OddsView } from '../lineage/odds';
import { ComparePane, paneState } from './ComparePane';

/*
 * Regression 6 (eng re-review): the window moved out of the pane into App,
 * shared with /compare and the search's detail. The switch must still change
 * every row, and the chosen window must survive a re-explain -- the reason it
 * lived on the pane rather than in `Result`, which unmounts on every one.
 */

const own = (index: number, cardId: number): ParentPick => ({ kind: 'own', index, cardId });
const picks = [own(1, 100601), own(2, 100901)];

const lineage = (total: number) =>
  ({
    pairTotal: {
      ruleId: 'total.pair',
      label: 'Pair total',
      value: total,
      sources: [],
      children: [
        { ruleId: 'base.two_way', label: 'base', value: total - 10, sources: [], children: [] },
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
        groupId: 2001,
        kind: 'white_skill',
        name: 'Uma Stan',
        stars: 5,
        carriers: [],
        withinOneInspiration: 0.2,
        onceInCareer: 0.4,
        twiceInCareer: 0.1,
        lineageCarriers: 2,
        timing: null,
        aptitude: null,
      },
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
  }) as unknown as LineageResponse;

/** App's side of it: the window is state ABOVE the pane. */
function Harness({ lineage: current, loading }: { lineage: LineageResponse; loading: boolean }) {
  const [view, setView] = useState<OddsView>('once');
  return (
    <ComparePane
      state={paneState(100101, picks, loading, null, current)}
      criteria={[]}
      sparkOptions={[]}
      pickedCount={2}
      view={view}
      onView={setView}
      onClearPicks={() => {}}
      onOpenTree={() => {}}
    />
  );
}

const chipValues = () =>
  [...document.querySelectorAll('[title]')].map((chip) =>
    [...chip.querySelectorAll('span')].map((s) => s.textContent).filter((t) => /%\)?$/.test(t ?? '')).join(' '),
  );

afterEach(() => cleanup());

describe('the pane window, now that it lives in App', () => {
  it('changes every row when switched', () => {
    render(<Harness lineage={lineage(284)} loading={false} />);
    expect(chipValues()).toEqual(['75%', '40% (10%)']);
    fireEvent.click(screen.getByRole('button', { name: 'at least twice' }));
    expect(chipValues()).toEqual(['25%', '10% (10%)']);
  });

  it('keeps the chosen window across a re-explain', async () => {
    const { rerender } = render(<Harness lineage={lineage(284)} loading={false} />);
    fireEvent.click(screen.getByRole('button', { name: '1 inspiration' }));
    // A new pick: the pane shows "Explaining…" and the result unmounts...
    await act(async () => rerender(<Harness lineage={lineage(284)} loading />));
    expect(screen.getByText('Explaining…')).toBeTruthy();
    // ...and the new pair arrives in the window the reader chose.
    await act(async () => rerender(<Harness lineage={lineage(290)} loading={false} />));
    expect(screen.getByRole('button', { name: '1 inspiration' }).getAttribute('aria-pressed')).toBe('true');
    expect(chipValues()).toEqual(['50%', '20% (10%)']);
  });
});
