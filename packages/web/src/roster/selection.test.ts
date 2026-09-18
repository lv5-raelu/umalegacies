import { describe, expect, it } from 'vitest';
import type { ResolvedVeteran, RosterResolveResponse, TraineeOption } from '@umalegacies/types';
import { CACHE_VERSION } from './cache-policy';
import { EMPTY_SELECTION, picksToCache, restoreSelection, type CachedSelection } from './selection';

/**
 * What of the last session's choices may come back.
 *
 * The risk is the mirror of the roster cache's. That one guards against showing
 * numbers computed from game data that moved; this one guards against showing a
 * PAIR that is not the pair you picked. Picks are indices into the request
 * array, so a restore that trusts them against a different save would put two
 * confident, plausible, wrong umas on screen with nothing to indicate it.
 */

const STAMINA = 2;
const MEDIUM = 15;

const veteran = (
  index: number,
  cardId: number,
  charaId: number | null = cardId,
): ResolvedVeteran => ({
  index,
  score: 20_000 - index,
  self: { cardId, charaId, name: `uma ${cardId}`, costume: null, resolution: { ok: true } },
  parents: [null, null],
  sparks: [{ groupId: STAMINA, stars: [3, 2, 1] }],
  unknownFactorIds: [],
  ok: true,
});

const roster = (over: Partial<RosterResolveResponse> = {}): RosterResolveResponse => ({
  veterans: [veteran(0, 100601), veteran(1, 101401), veteran(2, 100901)],
  sparkOptions: [
    { groupId: STAMINA, kind: 'blue', name: 'Stamina', veterans: 3 },
    { groupId: MEDIUM, kind: 'pink', name: 'Medium', veterans: 2 },
  ],
  unresolvedCount: 0,
  masterHash: 'abc',
  ...over,
});

const trainees: TraineeOption[] = [
  { cardId: 100601, charaId: 1006, name: 'Oguri Cap', costume: null, ambiguous: false },
  { cardId: 101401, charaId: 1014, name: 'Gold Ship', costume: null, ambiguous: false },
];

const stored = (over: Partial<CachedSelection> = {}): unknown => ({
  version: CACHE_VERSION,
  traineeCardId: null,
  criteria: [{ groupId: STAMINA, minStars: 4, scope: 'package' }],
  picks: [
    { index: 1, cardId: 101401 },
    { index: 2, cardId: 100901 },
  ],
  ...over,
});

describe('a selection restored from this browser', () => {
  it('comes back whole when nothing has moved', () => {
    expect(restoreSelection(stored(), roster(), trainees)).toEqual({
      traineeCardId: null,
      criteria: [{ groupId: STAMINA, minStars: 4, scope: 'package' }],
      picks: [1, 2],
    });
  });

  it('brings the trainee back when the card is still selectable', () => {
    const result = restoreSelection(stored({ traineeCardId: 100601 }), roster(), trainees);
    expect(result.traineeCardId).toBe(100601);
  });

  it.each([
    ['nothing stored', null],
    ['undefined', undefined],
    ['a string', 'selection'],
    ['a number', 7],
  ])('treats %s as no selection at all', (_label, raw) => {
    expect(restoreSelection(raw, roster(), trainees)).toEqual(EMPTY_SELECTION);
  });

  it('refuses a record written by a different build', () => {
    // The scope selector lost an option once already, so an older record can
    // describe a control this build does not have.
    expect(restoreSelection(stored({ version: CACHE_VERSION - 1 }), roster(), trainees)).toEqual(
      EMPTY_SELECTION,
    );
  });

  it('drops one bad field without throwing away the others', () => {
    // The three fail for unrelated reasons, so refusing the whole selection
    // over one stale criterion would punish two good answers for a third.
    const result = restoreSelection(
      stored({ criteria: [{ groupId: 9999, minStars: 1, scope: 'package' }] }),
      roster(),
      trainees,
    );
    expect(result.criteria).toEqual([]);
    expect(result.picks).toEqual([1, 2]);
  });
});

describe('a pick is only restored as the uma it was picked as', () => {
  it('drops a pick whose index now holds somebody else', () => {
    // The whole reason the card id is stored. Loading a different save leaves
    // index 1 pointing at a different veteran, and restoring it by index would
    // put a confident, plausible, wrong pair on screen.
    const moved = restoreSelection(
      stored({ picks: [{ index: 1, cardId: 999999 }] }),
      roster(),
      trainees,
    );
    expect(moved.picks).toEqual([]);
  });

  it('drops a pick whose index is past the end of a shorter roster', () => {
    const short = roster({ veterans: [veteran(0, 100601)] });
    expect(restoreSelection(stored(), short, trainees).picks).toEqual([]);
  });

  it.each([
    ['a negative index', [{ index: -1, cardId: 101401 }]],
    ['a fractional index', [{ index: 1.5, cardId: 101401 }]],
    ['no index at all', [{ cardId: 101401 }]],
    ['entries that are not objects', [7, null, 'x']],
    ['picks that are not an array', 'picks'],
  ])('ignores %s', (_label, picks) => {
    expect(restoreSelection(stored({ picks: picks as never }), roster(), trainees).picks).toEqual(
      [],
    );
  });

  /**
   * `pickBlock` is the rule, here as everywhere else. A restore composes a pair
   * without clicking, so it is held to exactly what clicking would allow --
   * otherwise a restored pair lands in a state the pick handler would refuse to
   * recreate, and the only way out is to unselect something that looks fine.
   */
  it('drops a pick that is the trainee, because you are not your own parent', () => {
    // Compared by charaId, never cardId: the veteran below is Gold Ship in a
    // different costume from the card being trained, and it is still Gold Ship.
    const own = roster({ veterans: [veteran(0, 100601, 1006), veteran(1, 101402, 1014)] });
    const result = restoreSelection(
      stored({ traineeCardId: 101401, picks: [{ index: 1, cardId: 101402 }] }),
      own,
      trainees,
    );
    expect(result.traineeCardId).toBe(101401);
    expect(result.picks).toEqual([]);
  });

  it('drops the second of two picks that are the same character', () => {
    // Two costumes of one uma are still one uma, so the pair is illegal even
    // though the two cards differ.
    const twins = roster({ veterans: [veteran(0, 100601, 1006), veteran(1, 100602, 1006)] });
    const result = restoreSelection(
      stored({
        picks: [
          { index: 0, cardId: 100601 },
          { index: 1, cardId: 100602 },
        ],
      }),
      twins,
      trainees,
    );
    expect(result.picks).toEqual([0]);
  });

  it('never restores more than two', () => {
    const result = restoreSelection(
      stored({
        picks: [
          { index: 0, cardId: 100601 },
          { index: 1, cardId: 101401 },
          { index: 2, cardId: 100901 },
        ],
      }),
      roster(),
      trainees,
    );
    expect(result.picks).toEqual([0, 1]);
  });
});

describe('a criterion is only restored if it can still be asked', () => {
  const only = (criteria: unknown) =>
    restoreSelection(stored({ criteria: criteria as never }), roster(), trainees).criteria;

  it('drops a spark this roster does not carry at all', () => {
    // The catalogue is built from the loaded roster, so a different save can
    // leave a requirement naming a spark with no option behind it.
    expect(only([{ groupId: 9999, minStars: 1, scope: 'package' }])).toEqual([]);
  });

  it('drops a threshold the scope can never reach', () => {
    // 7 stars is askable across the lineage and impossible on one uma. Clamping
    // it to 3 would silently answer a question nobody asked.
    expect(only([{ groupId: STAMINA, minStars: 7, scope: 'parent' }])).toEqual([]);
    expect(only([{ groupId: STAMINA, minStars: 7, scope: 'package' }])).toEqual([
      { groupId: STAMINA, minStars: 7, scope: 'package' },
    ]);
  });

  it.each([
    ['a scope this build removed', [{ groupId: STAMINA, minStars: 1, scope: 'grandparents' }]],
    ['no scope', [{ groupId: STAMINA, minStars: 1 }]],
    ['zero stars', [{ groupId: STAMINA, minStars: 0, scope: 'package' }]],
    ['fractional stars', [{ groupId: STAMINA, minStars: 2.5, scope: 'package' }]],
    ['stars that are not a number', [{ groupId: STAMINA, minStars: '3', scope: 'package' }]],
    ['entries that are not objects', [null, 4, 'stamina']],
    ['criteria that are not an array', 'stamina'],
  ])('ignores %s', (_label, criteria) => {
    expect(only(criteria)).toEqual([]);
  });

  it('keeps only the first row for a spark, because the filter forbids a second', () => {
    expect(
      only([
        { groupId: STAMINA, minStars: 2, scope: 'package' },
        { groupId: STAMINA, minStars: 5, scope: 'package' },
      ]),
    ).toEqual([{ groupId: STAMINA, minStars: 2, scope: 'package' }]);
  });
});

describe('what gets written', () => {
  it('stamps each pick with the card it was made against', () => {
    expect(picksToCache([0, 2], roster())).toEqual([
      { index: 0, cardId: 100601 },
      { index: 2, cardId: 100901 },
    ]);
  });

  it('drops an index with nothing behind it rather than writing a null card', () => {
    expect(picksToCache([0, 99], roster())).toEqual([{ index: 0, cardId: 100601 }]);
  });

  it('round-trips through a restore', () => {
    const r = roster();
    const written = { version: CACHE_VERSION, traineeCardId: 100601, criteria: [], picks: picksToCache([1, 2], r) };
    expect(restoreSelection(written, r, trainees)).toEqual({
      traineeCardId: 100601,
      criteria: [],
      picks: [1, 2],
    });
  });
});
