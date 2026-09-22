import { describe, expect, it } from 'vitest';
import type {
  ParentPick,
  ResolvedVeteran,
  RosterResolveResponse,
  TraineeOption,
} from '@umalegacies/types';
import { CACHE_VERSION } from './cache-policy';
import { ownPick } from './picks';
import { EMPTY_SELECTION, picksToCache, restoreSelection, type CachedSelection } from './selection';

/**
 * What of the last session's choices may come back.
 *
 * The risk is the mirror of the roster cache's. That one guards against showing
 * numbers computed from game data that moved; this one guards against showing a
 * PAIR that is not the pair you picked. An `own` pick is an index into the
 * request array, so a restore that trusts one against a different save would
 * put two confident, plausible, wrong umas on screen with nothing to indicate
 * it.
 *
 * Every assertion below survived the widening of `Pick` into `ParentPick`
 * unchanged in MEANING -- only the shape of a pick moved. That is the point of
 * the refactor and the reason this file is the one that guards it.
 */

/** A pick as this build writes it. Release 1 emits no other kind. */
const own = (index: number, cardId: number): ParentPick => ({ kind: 'own', index, cardId });

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
  picks: [own(1, 101401), own(2, 100901)],
  ...over,
});

describe('a selection restored from this browser', () => {
  it('comes back whole when nothing has moved', () => {
    expect(restoreSelection(stored(), roster(), trainees)).toEqual({
      traineeCardId: null,
      criteria: [{ groupId: STAMINA, minStars: 4, scope: 'package' }],
      picks: [own(1, 101401), own(2, 100901)],
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
    expect(result.picks).toEqual([own(1, 101401), own(2, 100901)]);
  });
});

describe('a pick is only restored as the uma it was picked as', () => {
  it('drops a pick whose index now holds somebody else', () => {
    // The whole reason the card id is stored. Loading a different save leaves
    // index 1 pointing at a different veteran, and restoring it by index would
    // put a confident, plausible, wrong pair on screen.
    const moved = restoreSelection(stored({ picks: [own(1, 999999)] }), roster(), trainees);
    expect(moved.picks).toEqual([]);
  });

  it('drops a pick whose index is past the end of a shorter roster', () => {
    const short = roster({ veterans: [veteran(0, 100601)] });
    expect(restoreSelection(stored(), short, trainees).picks).toEqual([]);
  });

  it.each([
    ['a negative index', [own(-1, 101401)]],
    ['a fractional index', [own(1.5, 101401)]],
    ['no index at all', [{ kind: 'own', cardId: 101401 }]],
    ['entries that are not objects', [7, null, 'x']],
    ['picks that are not an array', 'picks'],
    // The pre-union shape. Its two fields are a strict SUBSET of the `own`
    // arm's, so every other check here would wave it through; only the missing
    // discriminant stops it. CACHE_VERSION is the real guard and this is the
    // second one, because a subset that passes silently is how a restore ends
    // up reading a format nobody agreed to.
    ['a pick written before the union existed', [{ index: 1, cardId: 101401 }]],
    // Release 1 never writes this arm, so anything carrying it was not written
    // by this build. The borrow release adds a case; it does not relax this.
    [
      'a borrowed pick, which this build cannot have written',
      [{ kind: 'borrowed', package: { self: { cardId: 101401, winSaddleIds: [] }, parents: [null, null] } }],
    ],
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
    const costumes = roster({ veterans: [veteran(0, 100601, 1006), veteran(1, 101402, 1014)] });
    const result = restoreSelection(
      stored({ traineeCardId: 101401, picks: [own(1, 101402)] }),
      costumes,
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
      stored({ picks: [own(0, 100601), own(1, 100602)] }),
      twins,
      trainees,
    );
    expect(result.picks).toEqual([own(0, 100601)]);
  });

  it('never restores more than two', () => {
    const result = restoreSelection(
      stored({ picks: [own(0, 100601), own(1, 101401), own(2, 100901)] }),
      roster(),
      trainees,
    );
    expect(result.picks).toEqual([own(0, 100601), own(1, 101401)]);
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

  describe('the must-have flag makes the round trip', () => {
    // The record stores whole SparkCriterion objects, so the flag is written
    // whether or not the restore looks for it. A restore that rebuilt the
    // criterion without it would silently un-promote a white on every reload
    // and widen the search with nothing on screen to say so.
    it('keeps a promoted white promoted', () => {
      expect(only([{ groupId: STAMINA, minStars: 1, scope: 'package', mustHave: true }])).toEqual([
        { groupId: STAMINA, minStars: 1, scope: 'package', mustHave: true },
      ]);
    });

    it('keeps an explicit false rather than inventing an absence', () => {
      expect(only([{ groupId: STAMINA, minStars: 1, scope: 'package', mustHave: false }])).toEqual([
        { groupId: STAMINA, minStars: 1, scope: 'package', mustHave: false },
      ]);
    });

    it('leaves the field off entirely when the record has none', () => {
      const [restored] = only([{ groupId: STAMINA, minStars: 1, scope: 'package' }]);
      expect(restored).toEqual({ groupId: STAMINA, minStars: 1, scope: 'package' });
      expect(restored && 'mustHave' in restored).toBe(false);
    });

    it('drops a criterion whose flag is not a boolean', () => {
      // Same rule as every other field here: a record this UI did not write is
      // not guessed at.
      expect(only([{ groupId: STAMINA, minStars: 1, scope: 'package', mustHave: 'yes' }])).toEqual(
        [],
      );
      expect(only([{ groupId: STAMINA, minStars: 1, scope: 'package', mustHave: 1 }])).toEqual([]);
    });
  });
});

describe('what gets written', () => {
  it('stamps a pick with the card it was made against, at pick time', () => {
    // The stamp moved OUT of the write and into the pick itself when the type
    // widened. It is the same proof in the same record; it is just no longer
    // re-derived from a roster that may have been replaced since.
    expect(ownPick(roster().veterans[2] as ResolvedVeteran)).toEqual(own(2, 100901));
  });

  it('writes the pair through unchanged', () => {
    expect(picksToCache([own(0, 100601), own(2, 100901)], roster())).toEqual([
      own(0, 100601),
      own(2, 100901),
    ]);
  });

  it('drops an own pick with nothing behind it rather than naming a missing index', () => {
    expect(picksToCache([own(0, 100601), own(99, 100601)], roster())).toEqual([own(0, 100601)]);
  });

  it('never launders a stale card onto a pick that has moved', () => {
    // The whole reason the card rides on the pick. Re-reading it here would
    // stamp whoever NOW sits at index 1 onto a pick made against somebody
    // else, and the restore would then find nothing wrong with it.
    const written = picksToCache([own(1, 999999)], roster());
    expect(written).toEqual([own(1, 999999)]);
    expect(restoreSelection({ ...(stored() as object), picks: written }, roster(), trainees).picks).toEqual([]);
  });

  it('round-trips the widened pick through a write and a restore', () => {
    const r = roster();
    const picks = [ownPick(r.veterans[1] as ResolvedVeteran), ownPick(r.veterans[2] as ResolvedVeteran)];
    const written: CachedSelection = {
      version: CACHE_VERSION,
      traineeCardId: 100601,
      criteria: [],
      picks: picksToCache(picks, r),
    };
    expect(restoreSelection(written, r, trainees)).toEqual({
      traineeCardId: 100601,
      criteria: [],
      picks: [own(1, 101401), own(2, 100901)],
    });
  });
});
