import { describe, expect, it } from 'vitest';
import { explain, findSumViolations } from './engine.js';
import { extractHash, extractMaster } from '../master/master-extract.js';
import { loadFixture } from './fixtures.js';
import type { ExplainNode, ExplainResponse } from './types.js';

const master = extractMaster();
const run = (name: string): { fixture: ReturnType<typeof loadFixture>; result: ExplainResponse } => {
  const fixture = loadFixture(name);
  return { fixture, result: explain(fixture.request, master, extractHash()) };
};

function walk(node: ExplainNode, visit: (n: ExplainNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function collect(node: ExplainNode, predicate: (n: ExplainNode) => boolean): ExplainNode[] {
  const out: ExplainNode[] = [];
  walk(node, (n) => {
    if (predicate(n)) out.push(n);
  });
  return out;
}

describe('golden fixture 5531 (Gold Ship, the plain path)', () => {
  const { fixture, result } = run('5531');
  const expected = fixture.expected as {
    pairTotal: number;
    baseTotal: number;
    bonusTotal: number;
    relationRank: number;
    individualAffinity: Record<string, number>;
  };

  it('produces the externally verified pair total', () => {
    expect(result.pairTotal.value).toBe(expected.pairTotal);
  });

  it('splits into the verified base and bonus totals', () => {
    const base = collect(result.pairTotal, (n) => n.ruleId.startsWith('base.'))
      .reduce((t, n) => t + n.value, 0);
    const bonus = collect(result.pairTotal, (n) => n.ruleId.startsWith('bonus.'))
      .reduce((t, n) => t + n.value, 0);
    expect({ base, bonus }).toEqual({
      base: expected.baseTotal,
      bonus: expected.bonusTotal,
    });
  });

  it('produces the verified individual affinity for all six slots', () => {
    const actual = Object.fromEntries(
      Object.entries(result.individualAffinity).map(([k, v]) => [k, v.value]),
    );
    expect(actual).toEqual(
      Object.fromEntries(
        Object.entries(expected.individualAffinity).map(([k, v]) => [k, v]),
      ),
    );
  });

  it('lands in the ◎ bucket', () => {
    expect(result.relationRank.value).toBe(expected.relationRank);
    expect(result.rankBounds.min).toBe(151);
  });

  it('has no suppressed base terms', () => {
    expect(collect(result.pairTotal, (n) => n.ruleId === 'base.self_link')).toHaveLength(0);
  });
});

describe('golden fixture 5774 (Oguri Cap, the self-link signature)', () => {
  const { fixture, result } = run('5774');
  const expected = fixture.expected as {
    pairTotal: number;
    baseTotal: number;
    bonusTotal: number;
    individualAffinity: Record<string, number>;
    selfLinkSlots: number[];
  };

  it('produces the externally verified pair total', () => {
    expect(result.pairTotal.value).toBe(expected.pairTotal);
  });

  it('produces the verified individual affinity for all six slots', () => {
    const actual = Object.fromEntries(
      Object.entries(result.individualAffinity).map(([k, v]) => [k, v.value]),
    );
    expect(actual).toEqual(
      Object.fromEntries(
        Object.entries(expected.individualAffinity).map(([k, v]) => [k, v]),
      ),
    );
  });

  it('suppresses exactly two base terms, at slots 12 and 22', () => {
    const suppressed = collect(result.pairTotal, (n) => n.ruleId === 'base.self_link');
    expect(suppressed).toHaveLength(expected.selfLinkSlots.length);
    for (const node of suppressed) expect(node.value).toBe(0);
  });

  it('keeps the bonus on the self-linked slots: base zeroes, bonus survives', () => {
    // This is the whole discriminator. Zeroing the entire link instead of only
    // its base would drop the bonus too and the total would fall below 410.
    for (const slot of expected.selfLinkSlots) {
      const member = result.individualAffinity[slot] as ExplainNode;
      const bonus = collect(member, (n) => n.ruleId === 'bonus.shared_g1');
      expect(bonus.length, `slot ${slot} should still have a bonus node`).toBe(1);
      expect((bonus[0] as ExplainNode).value, `slot ${slot} bonus`).toBeGreaterThan(0);
      const base = collect(member, (n) => n.ruleId === 'base.self_link');
      expect(base.length, `slot ${slot} should have a suppressed base`).toBe(1);
    }
  });

  it('carries the same bonus total as 5531, since only base is suppressed', () => {
    const bonus = collect(result.pairTotal, (n) => n.ruleId.startsWith('bonus.'))
      .reduce((t, n) => t + n.value, 0);
    expect(bonus).toBe(expected.bonusTotal);
    expect(bonus).toBe(312);
  });

  it('scores strictly below 5531 over the identical ancestor set', () => {
    const other = run('5531').result;
    expect(result.pairTotal.value).toBeLessThan(other.pairTotal.value);
  });
});

describe('synthetic: group_id is not a matching key', () => {
  const { fixture, result } = run('synthetic-group-id');
  const expected = fixture.expected as {
    bonusTotal: number;
    forbiddenSaddleIds: number[];
  };

  it('scores 0 shared G1 for the same race at two racecourses', () => {
    const bonus = collect(result.pairTotal, (n) => n.ruleId.startsWith('bonus.'))
      .reduce((t, n) => t + n.value, 0);
    expect(bonus).toBe(expected.bonusTotal);
    expect(bonus).toBe(0);
  });

  it('cites neither Takarazuka Kinen id as a shared win', () => {
    // A group_id-normalising engine would emit one row.saddle here worth +3.
    const saddleRows = collect(result.pairTotal, (n) => n.ruleId === 'row.saddle');
    expect(saddleRows).toHaveLength(0);
  });

  it('proves both ids ARE in the extract, so the 0 is a rule and not a gap', () => {
    for (const id of expected.forbiddenSaddleIds) {
      expect(master.knowsSaddle(id), `saddle ${id}`).toBe(true);
      expect(master.isG1(id), `saddle ${id} is G1`).toBe(true);
    }
    // Same group, different ids: exactly the trap.
    const [a, b] = expected.forbiddenSaddleIds as [number, number];
    expect(master.groupIdOf(a)).toBe(master.groupIdOf(b));
    expect(a).not.toBe(b);
  });
});

describe('synthetic: absent ancestors', () => {
  const { fixture, result } = run('synthetic-absent-ancestor');
  const expected = fixture.expected as { absentSlots: number[] };

  it('emits every grandparent slot with value 0 rather than omitting it', () => {
    for (const slot of expected.absentSlots) {
      const node = result.individualAffinity[slot];
      expect(node, `slot ${slot} must be present`).toBeDefined();
      expect((node as ExplainNode).value).toBe(0);
    }
  });

  it('contributes two zero nodes per absent slot, so the invariant holds', () => {
    const base = collect(result.pairTotal, (n) => n.ruleId === 'base.absent_ancestor');
    const bonus = collect(result.pairTotal, (n) => n.ruleId === 'bonus.absent_ancestor');
    expect(base).toHaveLength(expected.absentSlots.length);
    expect(bonus).toHaveLength(expected.absentSlots.length);
    expect(findSumViolations(result.pairTotal)).toEqual([]);
  });
});

describe('synthetic: unresolved ids never look like a plain zero', () => {
  const { fixture, result } = run('synthetic-unresolved');
  const expected = fixture.expected as {
    unknownCardId: number;
    unknownSaddleId: number;
  };

  it('reports an unknown card as a resolution failure, not a 0', () => {
    const failed = collect(
      result.pairTotal,
      (n) => n.resolution?.ok === false && n.resolution.reason === 'unknown_card',
    );
    expect(failed.length).toBeGreaterThan(0);
    for (const node of failed) {
      expect(node.value).toBe(0);
      expect(node.children).toHaveLength(0);
      if (node.resolution?.ok === false) {
        expect(node.resolution.id).toBe(expected.unknownCardId);
      }
    }
  });

  it('reports a shared win master.mdb does not know as a resolution failure', () => {
    const failed = collect(
      result.pairTotal,
      (n) => n.resolution?.ok === false && n.resolution.reason === 'unknown_saddle',
    );
    expect(failed.length).toBeGreaterThan(0);
    for (const node of failed) {
      expect(node.value).toBe(0);
      if (node.resolution?.ok === false) {
        expect(node.resolution.id).toBe(expected.unknownSaddleId);
      }
    }
  });

  it('still counts the shared win it DOES know', () => {
    const known = collect(
      result.pairTotal,
      (n) => n.ruleId === 'row.saddle' && n.resolution?.ok === true,
    );
    expect(known.length).toBeGreaterThan(0);
    for (const node of known) expect(node.value).toBe(3);
  });

  it('does not pay a bonus for a shared EPITHET', () => {
    // Both parents hold saddle 1, Classic Triple Crown: win_saddle_type 0, an
    // award for a set of G1 wins rather than a race. Counting it would pay +3
    // for an achievement the individual G1 wins have already been paid for.
    const expectedIds = fixture.expected as {
      sharedEpithetId: number;
      expectedBonusBetweenParents: number;
    };
    expect(master.knowsSaddle(expectedIds.sharedEpithetId)).toBe(true);
    expect(master.isG1(expectedIds.sharedEpithetId)).toBe(false);

    const bonus = collect(result.pairTotal, (n) => n.ruleId.startsWith('bonus.'))
      .reduce((t, n) => t + n.value, 0);
    expect(bonus).toBe(expectedIds.expectedBonusBetweenParents);
  });
});

describe('tree invariants, across every fixture', () => {
  const names = ['5531', '5774', 'synthetic-group-id', 'synthetic-absent-ancestor', 'synthetic-unresolved'];

  it.each(names)('%s: every node value equals the sum of its children', (name) => {
    const { result } = run(name);
    expect(findSumViolations(result.pairTotal)).toEqual([]);
    for (const [slot, node] of Object.entries(result.individualAffinity)) {
      expect(findSumViolations(node, `IA[${slot}]`)).toEqual([]);
    }
  });

  it.each(names)('%s: reconciles pairTotal against the six individual affinities', (name) => {
    // sum(IA) === 2*pairTotal - base(T,10) - base(T,20), because every link is
    // counted by both its members EXCEPT the two trainee-parent links, whose
    // trainee end has no individualAffinity entry.
    //
    // This is an accounting tautology, not a correctness test: both sides
    // derive from the same twelve link values. It catches endpoint mis-wiring
    // and nothing about whether a rule is right.
    const { result } = run(name);
    const sumIA = Object.values(result.individualAffinity).reduce((t, n) => t + n.value, 0);
    const traineeLinks = result.pairTotal.children.slice(0, 2);
    const traineeBase = traineeLinks.reduce((t, link) => t + link.value, 0);
    expect(sumIA).toBe(2 * result.pairTotal.value - traineeBase);
  });

  it.each(names)('%s: every leaf that did a lookup reports whether it resolved', (name) => {
    const { result } = run(name);
    const rows = collect(result.pairTotal, (n) => n.ruleId.startsWith('row.'));
    for (const row of rows) {
      expect(row.resolution, `${row.ruleId} "${row.label}"`).toBeDefined();
    }
  });

  it('serialises to JSON without cycles, since links are shared by two trees', () => {
    const { result } = run('5531');
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
