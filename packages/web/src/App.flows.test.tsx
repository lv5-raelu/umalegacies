// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExplainPairRequest, LineageResponse } from '@umalegacies/types';
import { CACHE_VERSION } from './roster/cache-policy';
import { readSelection, writeRoster, writeSelection } from './roster/cache';
import type { CachedSelection } from './roster/selection';
import { COMPARE, ROSTER, SEARCH, TREE, navigate } from './route';

/**
 * THE APP'S WIRING, IN A DOM.
 *
 * Every other web test renders through `renderToStaticMarkup` in node, which
 * cannot reach an effect -- and this feature's riskiest bugs were all effect
 * wiring: a reload bounced off /tree by a guard that ran before the restored
 * pair was explained, a drop zone flashed on every reload, a late result
 * painting over a newer one. This file opts into jsdom on its own (the comment
 * on line 1), so every other test stays in node, untouched.
 *
 * What is real: App, IndexedDB (fake-indexeddb, a fresh database per test),
 * the restore, routing. What is not: the network (`api/client`), the engine
 * (`explainPairLocally`, a deferred promise per call so each test decides when
 * a pair finishes), and the tree, which is stubbed to its pair total -- what is
 * under test is that App reaches it with the right lineage, not how it draws.
 */

vi.mock('./api/client', async (importActual) => ({
  ...(await importActual<typeof import('./api/client')>()),
  fetchMasterMeta: () => Promise.resolve({ masterHash: 'abc' }),
}));

/** Every explain the app asks for, in order, each waiting to be settled by the test. */
const explains: Array<{
  request: ExplainPairRequest;
  resolve: (lineage: LineageResponse) => void;
  reject: (error: unknown) => void;
}> = [];

vi.mock('./lineage/explain-local', async (importActual) => ({
  ...(await importActual<typeof import('./lineage/explain-local')>()),
  explainPairLocally: (request: ExplainPairRequest) =>
    new Promise<LineageResponse>((resolve, reject) => {
      explains.push({ request, resolve, reject });
    }),
}));

/**
 * The search's sweep runs in a Web Worker, which jsdom has not got. A test that
 * needs results sets this; otherwise the search sits idle.
 */
const search: { status: import('./search/usePairSearch').SearchStatus } = {
  status: { kind: 'idle' },
};
vi.mock('./search/usePairSearch', () => ({
  usePairSearch: () => search.status,
}));

/** The game data, as far as /compare's row headings need it. */
vi.mock('./lineage/master-source', async (importActual) => ({
  ...(await importActual<typeof import('./lineage/master-source')>()),
  loadMaster: () => Promise.resolve({ hash: 'abc', master: { skillTiming: () => null } }),
}));

vi.mock('./lineage/TreePage', () => ({
  TreePage: ({ lineage }: { lineage: LineageResponse }) => (
    <p>tree of {lineage.pairTotal.value}</p>
  ),
}));

const { App } = await import('./App');

// ------------------------------------------------------------------ fixtures

const member = (cardId: number, charaId: number, name: string) => ({
  cardId,
  charaId,
  name,
  costume: null,
  resolution: { ok: true as const },
});

/** Three veterans of three characters, and two trainees who are none of them. */
const resolved = {
  veterans: [
    { index: 0, score: 18571, self: member(100601, 1006, 'Oguri Cap'), parents: [null, null], sparks: [{ groupId: 2, stars: [3, 0, 0] }], unknownFactorIds: [], ok: true },
    { index: 1, score: 24878, self: member(101401, 1014, 'Gold Ship'), parents: [null, null], sparks: [{ groupId: 2, stars: [2, 0, 0] }], unknownFactorIds: [], ok: true },
    { index: 2, score: 16000, self: member(100901, 1009, 'Tamamo Cross'), parents: [null, null], sparks: [], unknownFactorIds: [], ok: true },
  ],
  sparkOptions: [{ groupId: 2, kind: 'blue', name: 'Stamina', veterans: 2 }],
  unresolvedCount: 0,
  masterHash: 'abc',
};
const trainees = [
  { cardId: 100101, charaId: 1001, name: 'Special Week', costume: null, ambiguous: false },
  { cardId: 101301, charaId: 1013, name: 'Mejiro Ryan', costume: null, ambiguous: false },
];
const veterans = resolved.veterans.map((v) => ({
  score: v.score,
  self: { cardId: v.self.cardId, factorIds: [], winSaddleIds: [] },
  parents: [null, null] as [null, null],
}));

const own = (index: number) => ({
  kind: 'own' as const,
  index,
  cardId: resolved.veterans[index]?.self.cardId ?? 0,
});

/** The thinnest lineage the pane and the stubbed tree will draw. */
const lineageOf = (total: number): LineageResponse =>
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
    sparks: [],
  }) as unknown as LineageResponse;

async function seed(selection: Partial<CachedSelection> = {}): Promise<void> {
  await writeRoster({
    version: CACHE_VERSION,
    masterHash: 'abc',
    fileName: 'data.json',
    savedAt: 0,
    veterans,
    skipped: [],
    resolved: resolved as never,
    trainees,
  });
  await writeSelection({
    version: CACHE_VERSION,
    traineeCardId: 100101,
    criteria: [],
    searchCriteria: [],
    pairFrom: 'list',
    picks: [],
    ...selection,
  });
}

/** Settle the pending explain for the pair A x B (by card), for the given trainee. */
async function explainAs(aCard: number, bCard: number, lineage: LineageResponse, traineeCharaId?: number) {
  const at = explains.findIndex(
    (e) =>
      e.request.veteranA.self.cardId === aCard &&
      e.request.veteranB.self.cardId === bCard &&
      (traineeCharaId === undefined || e.request.traineeCharaId === traineeCharaId),
  );
  if (at === -1) throw new Error(`no pending explain for ${aCard} x ${bCard}`);
  const [pending] = explains.splice(at, 1);
  await act(async () => pending?.resolve(lineage));
}

const OGURI = 100601;
const GOLD_SHIP = 101401;
const TAMAMO = 100901;
const pairOf = (a: number, b: number) => [own(a), own(b)];
/** A column's header, by its letter: where its pair total is printed. */
const column = (letter: string) => within(screen.getByRole('columnheader', { name: `Pair ${letter}` }));

/** Records whether the drop zone was EVER in the document, not only at the end. */
function watchForDropZone(): () => boolean {
  let seen = false;
  const check = () => {
    if (document.body.textContent?.includes('Drop your data.json here')) seen = true;
  };
  const observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  check();
  return () => {
    check();
    observer.disconnect();
    return seen;
  };
}

/** Let IndexedDB and every resolved promise run. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 30)));

beforeEach(() => {
  // A fresh, empty database per test: a restore must only ever see what this
  // test stored.
  globalThis.indexedDB = new IDBFactory();
  explains.length = 0;
  search.status = { kind: 'idle' };
  // jsdom has no layout and no observers of it; App only needs them to exist.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
});

const at = (path: string) => history.replaceState(null, '', path);

// ------------------------------------------------------------------ flows

describe('a reload', () => {
  it('says it is restoring from the first render, and never shows the drop zone', async () => {
    await seed();
    at(ROSTER);
    const dropZoneSeen = watchForDropZone();
    render(<App />);
    expect(screen.getByText('Restoring your roster…')).toBeTruthy();
    await settle();
    expect(screen.queryByText('Restoring your roster…')).toBeNull();
    expect(screen.getByText('Parents for Special Week')).toBeTruthy();
    expect(dropZoneSeen()).toBe(false);
  });

  it('shows the drop zone once the restore finds nothing', async () => {
    at(ROSTER);
    render(<App />);
    await settle();
    expect(screen.getByText(/Drop your data.json here/)).toBeTruthy();
  });

  /* Regression 3 (eng review 1A): the /tree guard used to bounce this to the search. */
  it('stays on /tree with a stored full pair, and draws it once explained', async () => {
    await seed({ picks: [own(0), own(1)] });
    at(TREE);
    render(<App />);
    await settle();
    expect(location.pathname).toBe(TREE);
    expect(screen.getByText('Explaining…')).toBeTruthy();
    expect(explains).toHaveLength(1);
    await act(async () => explains[0]?.resolve(lineageOf(284)));
    expect(location.pathname).toBe(TREE);
    expect(screen.getByText('tree of 284')).toBeTruthy();
  });

  /*
   * Regression 10 (eng re-review, Codex #6). The grid is rebuilt after every
   * visit to the search, and the effect that published --pane-top only re-ran
   * when the roster changed, so the new grid fell back to 80px.
   */
  it('publishes --pane-top on the roster grid rebuilt after a visit to /search', async () => {
    await seed();
    at(ROSTER);
    render(<App />);
    await settle();
    const published = () => document.querySelector('[style*="--pane-top"]');
    expect(published()).not.toBeNull();
    await act(async () => navigate(SEARCH));
    expect(published()).toBeNull();
    await act(async () => navigate(ROSTER));
    expect(published()).not.toBeNull();
  });

  it('leaves /tree when no pair can come', async () => {
    await seed({ picks: [own(0)] });
    at(TREE);
    render(<App />);
    await settle();
    expect(location.pathname).not.toBe(TREE);
  });
});

describe('/compare', () => {
  const tray = [pairOf(0, 1), pairOf(0, 2), pairOf(1, 2)];

  it('restores its tray on a reload with no drop zone, then draws each column', async () => {
    await seed({ tray });
    at(COMPARE);
    const dropZoneSeen = watchForDropZone();
    render(<App />);
    expect(screen.getByText('Restoring your roster…')).toBeTruthy();
    await settle();
    expect(screen.getAllByText('Explaining…').length).toBeGreaterThan(0);
    await explainAs(OGURI, GOLD_SHIP, lineageOf(284));
    await explainAs(OGURI, TAMAMO, lineageOf(250));
    await explainAs(GOLD_SHIP, TAMAMO, lineageOf(222));
    expect(column('A').getByText('284')).toBeTruthy();
    expect(column('B').getByText('250')).toBeTruthy();
    expect(column('C').getByText('222')).toBeTruthy();
    expect(screen.getByText('3 of 4')).toBeTruthy();
    expect(dropZoneSeen()).toBe(false);
  });

  it('never paints a late result for the previous trainee', async () => {
    await seed({ tray: [pairOf(0, 1)] });
    at(COMPARE);
    render(<App />);
    await settle();
    // Special Week's explain is still pending; switch to Mejiro Ryan.
    fireEvent.click(screen.getByRole('button', { name: 'TRAINEE' }));
    fireEvent.click(screen.getByRole('option', { name: /Mejiro Ryan/ }));
    await settle();
    await explainAs(OGURI, GOLD_SHIP, lineageOf(111), 1001);
    expect(screen.queryByText('111')).toBeNull();
    await explainAs(OGURI, GOLD_SHIP, lineageOf(284), 1013);
    expect(column('A').getByText('284')).toBeTruthy();
  });

  it("opens C's own tree from C's Show breakdown, not the roster pair", async () => {
    await seed({ tray, picks: [own(0), own(1)] });
    at(COMPARE);
    render(<App />);
    await settle();
    await explainAs(OGURI, GOLD_SHIP, lineageOf(284));
    await explainAs(OGURI, GOLD_SHIP, lineageOf(284));
    await explainAs(OGURI, TAMAMO, lineageOf(250));
    await explainAs(GOLD_SHIP, TAMAMO, lineageOf(222));
    fireEvent.click(screen.getAllByRole('button', { name: 'Show breakdown' })[2] as HTMLElement);
    await settle();
    expect(location.pathname).toBe(TREE);
    expect(screen.getByText('tree of 222')).toBeTruthy();
  });

  it('puts a removed pair back in place with its numbers, no loading state', async () => {
    await seed({ tray: tray.slice(0, 2) });
    at(COMPARE);
    render(<App />);
    await settle();
    await explainAs(OGURI, GOLD_SHIP, lineageOf(284));
    await explainAs(OGURI, TAMAMO, lineageOf(250));
    fireEvent.click(screen.getByRole('button', { name: 'Remove pair A' }));
    expect(screen.queryByText('284')).toBeNull();
    expect(screen.getByText('1 of 4')).toBeTruthy();
    expect(screen.getByText('Compare (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'undo' }));
    expect(column('A').getByText('284')).toBeTruthy();
    expect(screen.queryByText('Explaining…')).toBeNull();
    expect(explains).toHaveLength(0);
  });

  it('keeps its toggles and open rows across a round trip to the tree', async () => {
    await seed({ tray: tray.slice(0, 2) });
    at(COMPARE);
    render(<App />);
    await settle();
    await explainAs(OGURI, GOLD_SHIP, lineageOf(284));
    await explainAs(OGURI, TAMAMO, lineageOf(250));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide rows identical in every pair' }));
    fireEvent.click(screen.getByRole('button', { name: /Stamina/ }));
    expect(screen.getByRole('button', { name: /Stamina/ }).getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getAllByRole('button', { name: 'Show breakdown' })[0] as HTMLElement);
    await settle();
    expect(location.pathname).toBe(TREE);
    await act(async () => navigate(COMPARE));
    await settle();

    expect(
      (screen.getByRole('checkbox', { name: 'Hide rows identical in every pair' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(screen.getByRole('button', { name: /Stamina/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('is emptied, in memory and in the stored record, when the roster is forgotten', async () => {
    await seed({ tray });
    at(ROSTER);
    render(<App />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Forget this roster' }));
    await settle();
    expect(await readSelection()).toBeUndefined();
    expect(screen.getByText('Compare')).toBeTruthy();
  });
});

/*
 * Regressions 4 and 5 (eng re-review), written against the row as it shipped:
 * the search row is restructured to hold the compare control, and `onPick` is
 * refactored onto `takePair`. Both change behaviour players already rely on.
 */
describe('a search row', () => {
  const STAMINA = { groupId: 2, minStars: 1, scope: 'package' as const };
  const result = (a: number, b: number, pairTotal: number) => ({
    a,
    b,
    joint: null,
    perSpark: [0.75],
    perSparkInherit: [null],
    jointInherit: null,
    pairTotal,
    relationRank: 3,
  });

  async function openSearch() {
    await seed({ searchCriteria: [STAMINA] });
    search.status = {
      kind: 'done',
      sweep: { results: [result(0, 1, 284), result(0, 2, 250)], legal: 3, scored: 2 },
      criteria: [STAMINA],
    };
    at(SEARCH);
    render(<App />);
    await settle();
  }
  const pickButton = () =>
    screen.getByRole('button', { name: 'Pick Oguri Cap and Gold Ship as the parents' });
  const dialog = () => screen.queryByRole('dialog', { name: 'Oguri Cap and Gold Ship' });

  it('opens its pair on a click anywhere on the row', async () => {
    await openSearch();
    const row = pickButton().closest('article') as HTMLElement;
    fireEvent.click(within(row).getByText('284'));
    expect(dialog()).not.toBeNull();
  });

  it('opens its pair from the keyboard, with Enter and with Space', async () => {
    const user = userEvent.setup();
    await openSearch();
    pickButton().focus();
    await user.keyboard('{Enter}');
    expect(dialog()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog()).toBeNull();
    pickButton().focus();
    await user.keyboard(' ');
    expect(dialog()).not.toBeNull();
  });

  it("keeps its chips' hover explanations", async () => {
    await openSearch();
    const row = pickButton().closest('article') as HTMLElement;
    expect(row.querySelector('[title]')).not.toBeNull();
  });

  it('does not open when the reader was selecting its text', async () => {
    await openSearch();
    const row = pickButton().closest('article') as HTMLElement;
    const selection = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ toString: () => 'Oguri Cap', isCollapsed: false } as unknown as Selection);
    fireEvent.click(within(row).getByText('284'));
    selection.mockRestore();
    expect(dialog()).toBeNull();
  });

  it('adds to compare from the row without opening the pair', async () => {
    await openSearch();
    const row = pickButton().closest('article') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Add to compare' }));
    expect(dialog()).toBeNull();
    expect(screen.getByText('Compare (1)')).toBeTruthy();
    expect(within(row).getByRole('link', { name: 'In compare · A' })).toBeTruthy();
  });

  /* Eng re-review, Codex #9: the link names a PAIR, and that pair wins on arrival. */
  it('lands on that pair from "In compare · A", its header focused', async () => {
    await openSearch();
    const row = pickButton().closest('article') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Add to compare' }));
    fireEvent.click(within(row).getByRole('link', { name: 'In compare · A' }));
    await settle();
    expect(location.pathname).toBe(COMPARE);
    await explainAs(OGURI, GOLD_SHIP, lineageOf(284));
    expect(document.activeElement).toBe(screen.getByRole('columnheader', { name: 'Pair A' }));
  });

  it("still opens /tree with that pair from the detail's Show breakdown", async () => {
    await openSearch();
    fireEvent.click(pickButton());
    await explainAs(OGURI, GOLD_SHIP, lineageOf(284));
    fireEvent.click(within(dialog() as HTMLElement).getByRole('button', { name: 'Show breakdown' }));
    await settle();
    expect(location.pathname).toBe(TREE);
    expect(screen.getByText('tree of 284')).toBeTruthy();
  });
});
