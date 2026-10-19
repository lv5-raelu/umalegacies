import { describe, expect, it } from 'vitest';
import { loadFixture } from '../affinity/fixtures.js';
import { careerOdds, explainLineage, SPARK_KIND_ORDER } from '@umalegacies/core';
import { extractDatabase, extractHash, extractMaster } from '../master/master-extract.js';

const master = extractMaster();
const lineage = (name: string) =>
  explainLineage(loadFixture(name).request, master, extractHash());

describe('careerOdds', () => {
  it('matches the closed form on ordinary rates', () => {
    // The Medium pink on the Oguri verification lineage: three carriers at
    // 8.58%, 16.25% and 1.69% per inspiration.
    const { once, twice } = careerOdds([0.0858, 0.1625, 0.0169]);
    expect(once).toBeCloseTo(0.4334379804, 10);
    expect(twice).toBeCloseTo(0.0877525219, 10);
  });

  it('survives a carrier capped at exactly 100%', () => {
    // A blue spark on a parent caps at 1.0, and the closed form for "exactly
    // one fires" divides by (1 - p). This is why the DP exists.
    const { once, twice } = careerOdds([1, 0.2]);
    expect(once).toBe(1);
    // The capped carrier fires in both inspirations, so two activations are
    // certain regardless of the second carrier.
    expect(twice).toBe(1);
  });

  it('returns EXACTLY 1 only when a carrier is genuinely capped', () => {
    // The audit trail omits a blue row on `once === 1`, so this exactness is
    // load-bearing. A 0.999 epsilon hid a 1-star blue at individual affinity
    // 39-42 (career 99.93% to 99.996%) under a note claiming it computed to
    // 100%, and that band sits inside the ordinary grandparent range.
    expect(careerOdds([1]).once).toBe(1);
    expect(careerOdds([0.7 * 1.43 > 1 ? 1 : 0.7 * 1.43]).once).toBe(1);
    // Uncapped carriers can get arbitrarily close and must never reach it.
    expect(careerOdds([0.7 * 1.42]).once).toBeLessThan(1);
    expect(careerOdds([0.99, 0.99, 0.99]).once).toBeLessThan(1);
  });

  it('is 0 for a spark nobody carries', () => {
    expect(careerOdds([])).toEqual({ withinOne: 0, once: 0, twice: 0 });
  });

  /**
   * The three figures the pane offers, and they NEST: one inspiration is
   * contained in the career, and the doubled case is contained in "at least
   * once". Each ordering below is an invariant the UI relies on -- the switch
   * changes one column in place, so a view that could print a bigger number
   * than the view above it would read as the pair having improved.
   */
  describe('the three windows', () => {
    it('cannot make one inspiration likelier than two', () => {
      for (const rates of [[0.3], [0.3, 0.4], [0.05, 0.05, 0.05, 0.9]]) {
        const o = careerOdds(rates);
        expect(o.withinOne).toBeLessThanOrEqual(o.once);
      }
    });

    it('cannot make at-least-twice likelier than at-least-once', () => {
      for (const rates of [[0.3], [0.3, 0.4], [0.1, 0.25, 0.6]]) {
        const o = careerOdds(rates);
        expect(o.twice).toBeLessThanOrEqual(o.once);
      }
    });

    it('gives a certain carrier 1 in every window', () => {
      // A blue on a parent is capped at 1.0 and fires in BOTH inspirations, so
      // there is no window in which it can fail to arrive.
      expect(careerOdds([1])).toEqual({ withinOne: 1, once: 1, twice: 1 });
    });

    it('measures one inspiration, not two', () => {
      // One carrier at 0.5: within a single inspiration it is exactly 0.5,
      // while the career gets two rolls and reaches 0.75, of which the doubled
      // quarter is the part that stacks.
      const o = careerOdds([0.5]);
      expect(o.withinOne).toBeCloseTo(0.5, 12);
      expect(o.once).toBeCloseTo(0.75, 12);
      expect(o.twice).toBeCloseTo(0.25, 12);
    });
  });

  it('never returns a negative probability', () => {
    // Floating point leaves a small negative here without the clamp.
    for (const p of [1e-9, 0.5, 1 - 1e-9]) {
      const { once, twice } = careerOdds([p]);
      expect(once).toBeGreaterThanOrEqual(0);
      expect(twice).toBeGreaterThanOrEqual(0);
    }
  });

  it('agrees with the closed form it replaced, away from the cap', () => {
    const rates = [0.0286, 0.09, 0.1512, 0.0441, 0.195];
    const p0 = rates.reduce((acc, p) => acc * (1 - p), 1);
    const p1 = p0 * rates.reduce((acc, p) => acc + p / (1 - p), 0);
    const { once, twice } = careerOdds(rates);
    expect(once).toBeCloseTo(1 - p0 * p0, 12);
    expect(twice).toBeCloseTo(1 - p0 * p0 - 2 * p0 * p1, 12);
  });
});

describe('the Oguri Cap verification lineage', () => {
  const result = lineage('verify-oguri');

  it('names every slot', () => {
    expect(result.trainee.name).toBe('Oguri Cap');
    expect(result.ancestors[10]?.name).toBe('Mejiro Dober');
    expect(result.ancestors[20]?.name).toBe('Narita Brian');
    expect(result.ancestors[11]?.name).toBe('Inari One');
    expect(result.ancestors[12]?.name).toBe('Gold Ship');
    expect(result.ancestors[21]?.name).toBe('Inari One');
    expect(result.ancestors[22]?.name).toBe('Gold Ship');
  });

  it('gives every ancestor exactly one blue, one pink and one green', () => {
    for (const position of [10, 20, 11, 12, 21, 22]) {
      const sparks = result.ancestors[position]?.sparks;
      expect(sparks?.blue, `slot ${position} blue`).not.toBeNull();
      expect(sparks?.pink, `slot ${position} pink`).not.toBeNull();
      expect(sparks?.green, `slot ${position} green`).not.toBeNull();
      expect(sparks?.whites.length, `slot ${position} whites`).toBeGreaterThan(0);
    }
  });

  it('resolves every factor id the save carried', () => {
    for (const position of [10, 20, 11, 12, 21, 22]) {
      expect(result.ancestors[position]?.sparks.unknownFactorIds).toEqual([]);
    }
  });

  it('totals Medium at 6 stars across three carriers', () => {
    // Mejiro Dober 2*, Narita Brian 3*, the Gold Ship at slot 22 1*. The star
    // figure is the LINEAGE TOTAL, not a maximum across carriers: the maximum
    // carries no meaning and disagrees with M7's filter unit.
    const medium = result.sparks.find((s) => s.kind === 'pink' && s.name === 'Medium');
    expect(medium?.stars).toBe(6);
    expect(medium?.carriers.map((c) => c.position).sort((a, b) => a - b)).toEqual([10, 20, 22]);
    expect(medium?.onceInCareer).toBeCloseTo(0.4334379804, 8);
    expect(medium?.twiceInCareer).toBeCloseTo(0.0877525219, 8);
  });

  it('scales each carrier by the four-link parent affinity, not the three-link one', () => {
    // breeding-optimizer displays 127 for Mejiro Dober where this engine says
    // 186; the difference is exactly the parent-parent link. hakuraku feeds the
    // 186-style figure into its own spark odds, so that is the one used here.
    const medium = result.sparks.find((s) => s.kind === 'pink' && s.name === 'Medium');
    const dober = medium?.carriers.find((c) => c.position === 10);
    expect(dober?.individualAffinity).toBe(186);
    expect(dober?.baseRate).toBe(0.03);
    expect(dober?.perInspiration).toBeCloseTo(0.0858, 10);
  });

  it('caps a parent blue at 100% and leaves a grandparent blue below it', () => {
    // A 1-star blue needs Individual Affinity >= 43 to reach certainty. Across
    // the roster, parent slots clear that 99.6% of the time and grandparent
    // slots only 38.2%, so a parent's blue is not information and a
    // grandparent's is.
    const blues = result.sparks.filter((s) => s.kind === 'blue');
    expect(blues.length).toBeGreaterThan(0);
    for (const blue of blues) {
      for (const carrier of blue.carriers) {
        if (carrier.position === 10 || carrier.position === 20) {
          expect(carrier.perInspiration, blue.name).toBe(1);
        }
      }
    }
    const belowCap = blues.flatMap((b) => b.carriers).filter((c) => c.perInspiration < 1);
    expect(belowCap.every((c) => c.position > 20 || c.position === 11 || c.position === 12)).toBe(
      true,
    );
  });

  it('groups the 1/2/3-star variants of one spark into a single row', () => {
    const names = result.sparks.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('orders rows by category then by likelihood', () => {
    const rank = (kind: string) => SPARK_KIND_ORDER.indexOf(kind as never);
    for (let i = 1; i < result.sparks.length; i++) {
      const previous = result.sparks[i - 1]!;
      const current = result.sparks[i]!;
      expect(rank(previous.kind)).toBeLessThanOrEqual(rank(current.kind));
      if (previous.kind === current.kind) {
        expect(previous.onceInCareer).toBeGreaterThanOrEqual(current.onceInCareer);
      }
    }
  });

  it('carries every affinity number the engine already produced', () => {
    expect(result.pairTotal.value).toBe(352);
    expect(result.relationRank.value).toBe(3);
    expect(result.individualAffinity[10]?.value).toBe(186);
  });
});

describe('costumes are distinct umas, not skins', () => {
  it('gives an ancestor its own card, so the portrait matches the green spark', () => {
    // 38 of the 69 characters have more than one card, and a card carries its
    // own unique skill -- which IS the green spark the node prints under the
    // portrait. Keying the image by chara_id drew one costume's face above
    // another costume's spark. Measured on a real roster, 15 characters appear
    // with two different greens.
    const result = lineage('verify-oguri');
    for (const position of [10, 20, 11, 12, 21, 22]) {
      const ancestor = result.ancestors[position];
      expect(ancestor?.cardId, `slot ${position}`).toBeGreaterThan(0);
      // The card is the identity the portrait must use; chara_id is coarser.
      expect(master.charaIdFor(ancestor!.cardId)).toBe(ancestor!.charaId);
    }
  });

  it('keeps two costumes of one character apart', () => {
    // Oguri Cap 100601 is "Triumphant Pulse"; 100602 is "Festive Miracle".
    const base = master.charaIdFor(100601);
    const alt = master.charaIdFor(100602);
    expect(base).toBe(alt);
    expect(100601).not.toBe(100602);
    // The trainee is the one member with no card in the request, so it falls
    // back to the base costume. That affects no number: a trainee shows no sparks.
    expect(master.baseCardFor(base as number)).toBe(100601);
  });
});

describe('a trainee master.mdb does not know', () => {
  it('says so instead of returning a confident total', () => {
    // An unknown trainee collapses every base term that touches it: both
    // trainee-parent links AND all four three-way grandparent terms. The 352
    // lineage silently became 227 under an unqualified headline and a rank-3
    // verdict, which is the exact failure types.ts declares unacceptable.
    const request = { ...loadFixture('verify-oguri').request, traineeCharaId: 999999 };
    const result = explainLineage(request, master, extractHash());
    // unknown_chara, NOT no_relation_rows: the extract has never heard of this
    // id, so a message about relation rows would be a claim about relations for
    // a character that does not exist.
    expect(result.trainee.resolution).toEqual({
      ok: false,
      reason: 'unknown_chara',
      id: 999999,
    });
  });

  it('resolves a trainee it does know', () => {
    const result = lineage('verify-oguri');
    expect(result.trainee.resolution).toEqual({ ok: true });
    expect(result.trainee.name).toBe('Oguri Cap');
  });
});

describe('careerOdds invariants hold for callers that skip the HTTP boundary', () => {
  it('never lets a non-finite rate reach the result', () => {
    // build-fixtures.mjs and M3's roster path never call parseExplainRequest,
    // so the cap and the clamp cannot live only at the edge.
    for (const bad of [NaN, Infinity, -Infinity]) {
      const { once, twice } = careerOdds([bad, 0.2]);
      expect(Number.isFinite(once), String(bad)).toBe(true);
      expect(Number.isFinite(twice), String(bad)).toBe(true);
      expect(once).toBeGreaterThanOrEqual(0);
      expect(once).toBeLessThanOrEqual(1);
    }
  });

  it('clamps an out-of-range rate rather than propagating it', () => {
    expect(careerOdds([1.5]).once).toBe(1);
    expect(careerOdds([-0.5]).once).toBe(0);
  });
});

describe('a lineage with empty grandparent slots', () => {
  const result = lineage('synthetic-absent-ancestor');

  it('emits all six ancestor keys, with null for an empty slot', () => {
    expect(Object.keys(result.ancestors).map(Number).sort((a, b) => a - b)).toEqual([
      10, 11, 12, 20, 21, 22,
    ]);
    for (const position of [11, 12, 21, 22]) {
      expect(result.ancestors[position]).toBeNull();
    }
  });

  it('returns no spark rows when no ancestor carries factorIds', () => {
    // The synthetic fixtures predate sparks and carry none. An affinity-only
    // request must still succeed: the summary is empty, not an error.
    expect(result.sparks).toEqual([]);
  });
});

describe('an ancestor whose card master.mdb does not know', () => {
  const result = lineage('synthetic-unresolved');

  it('says so rather than returning a bare name', () => {
    const parent = result.ancestors[10];
    expect(parent?.charaId).toBeNull();
    expect(parent?.resolution).toEqual({ ok: false, reason: 'unknown_card', id: 999999 });
  });
});

/**
 * THE END-OF-CAREER ROLL, THROUGH THE WHOLE ENGINE AND AGAINST A REAL LINEAGE.
 *
 * `inherit.test.ts` pins the table. This pins the WIRING: that the carrier
 * count summariseSparks hands the table is the count of umas the table means,
 * that the three kinds it does not govern come back null rather than 20%, and
 * that the composed figure is only ever built for the one kind whose
 * precondition this engine models. Every one of those is a place a plausible
 * edit would produce a number that still looks like a percentage.
 */
describe('what the trainee finishes a career carrying', () => {
  const sparks = lineage('5531').sparks;

  it('counts the carriers the table is indexed by, not the carrier entries', () => {
    for (const row of sparks) {
      expect(row.lineageCarriers).toBe(new Set(row.carriers.map((c) => c.position)).size);
      expect(row.lineageCarriers).toBeGreaterThanOrEqual(1);
      expect(row.lineageCarriers).toBeLessThanOrEqual(6);
    }
  });

  it('reads the published table off that count, for every white row', () => {
    const whites = sparks.filter((row) => row.kind.startsWith('white'));
    expect(whites.length).toBeGreaterThan(0);
    for (const row of whites) {
      expect(row.acquisitionChance).toBeCloseTo(0.2 + 0.025 * row.lineageCarriers, 10);
    }
  });

  it('leaves blue, pink and green alone, because the lineage does not decide them', () => {
    const own = sparks.filter((row) => !row.kind.startsWith('white'));
    expect(own.length).toBeGreaterThan(0);
    for (const row of own) {
      expect(row.acquisitionChance).toBeNull();
      expect(row.inheritOnceInCareer).toBeNull();
    }
  });

  it('composes only for skill sparks, and always below the activation it is built from', () => {
    for (const row of sparks) {
      if (row.kind === 'white_skill') {
        expect(row.inheritOnceInCareer).toBeCloseTo(
          row.onceInCareer * (row.acquisitionChance as number),
          10,
        );
        // The whole point of the feature: getting the skill is not keeping it.
        expect(row.inheritOnceInCareer as number).toBeLessThan(row.onceInCareer);
      } else {
        expect(row.inheritOnceInCareer).toBeNull();
      }
    }
  });

  it('separates the two axes on a row where they disagree', () => {
    // A spark can be near-certain to fire and still unlikely to stick, and that
    // gap is the reason the column exists rather than being folded into ONCE.
    const loud = sparks
      .filter((row) => row.kind === 'white_skill')
      .sort((a, b) => b.onceInCareer - a.onceInCareer)[0];
    expect(loud).toBeDefined();
    expect((loud as (typeof sparks)[number]).onceInCareer).toBeGreaterThan(0.7);
    expect((loud as (typeof sparks)[number]).acquisitionChance as number).toBeLessThan(0.4);
  });
});

/**
 * WHEN A SKILL FIRES, READ OFF THE GAME'S OWN FIELD.
 *
 * `skill_data.skill_category` is what the pre-race screen groups by, so these
 * headings are the game's headings rather than this project's reading of a
 * condition string. The first attempt DID parse conditions -- `phase==1` and
 * friends -- and it classified only 119 of 235 white skills, put 116 in an
 * undifferentiated bucket, and needed a rule for skills spanning two legs.
 * The category column answers all of that in one integer, and these pin it.
 */
describe('when a white skill fires', () => {
  const master = extractMaster();

  /*
   * By NAME, via the extract's own text rows.
   *
   * A scan of the factor id space would work and was the first cut, but factor
   * ids are seven digits -- `factor_group_id * 100 + rarity` -- so the loop
   * bound is the kind of thing that is wrong by a factor of ten and still
   * compiles. Asking the database which id carries the name cannot be.
   */
  const db = extractDatabase();
  const factorNamed = (name: string) => {
    const row = db
      .prepare(`SELECT "index" AS id FROM text_data WHERE category = 147 AND text = ? LIMIT 1`)
      .get(name) as { id: number } | undefined;
    return row === undefined ? null : master.factor(row.id);
  };

  it.each([
    // Verified against a screenshot of the game's own pre-race skill list.
    ['Straightaway Recovery', 'mid'],
    ['Tail Held High', 'mid'],
    ['Head-On', 'late'],
    // And against skills named as always firing at the start, no wit check.
    ['Summer Runner ○', 'passive'],
    ['Restraint', 'passive'],
    ['Early Lead', 'early'],
  ])('puts %s under %s', (name, timing) => {
    expect(factorNamed(name)?.timing).toBe(timing);
  });

  it('gives every white skill in a real lineage a timing', () => {
    // The whole point of using the game's field: no skill falls through into a
    // heading that cannot be named.
    const skills = lineage('5531').sparks.filter((row) => row.kind === 'white_skill');
    expect(skills.length).toBeGreaterThan(20);
    for (const row of skills) expect(row.timing).not.toBeNull();
  });

  it('gives every OTHER kind no timing at all', () => {
    // A race spark grants a skill hint too -- February S. hands over Winter
    // Runner -- so the join finds a category for it. Filing it under Passive
    // because of the skill it teaches would put it in a heading that says
    // nothing about the G1 you have to win.
    const others = lineage('5531').sparks.filter((row) => row.kind !== 'white_skill');
    expect(others.length).toBeGreaterThan(10);
    for (const row of others) expect(row.timing).toBeNull();
  });
});
