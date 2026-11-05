import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { explain, findSumViolations, type ExplainRequest } from '@umalegacies/core';
import type { AncestorRef } from '@umalegacies/types';
import { extractDatabase, extractHash, extractMaster } from '../master/master-extract.js';
import { HakurakuOracle, type OracleAncestor, type OracleParent } from './hakuraku-oracle.js';

/**
 * EVERY INDIVIDUAL AFFINITY, AGAINST AN INDEPENDENT IMPLEMENTATION, IN CI.
 *
 * Our engine and a transcription of hakuraku's affinity functions score the
 * same lineages, and must agree on all six slots. This used to run only on the
 * builder's machine (scripts/check-roster.mjs), because the lineages came from
 * their data.json. Here they come from two places that need no personal file:
 *
 *   - a committed corpus of 120 real veterans from uma.moe, listed publicly to
 *     be borrowed, kept to card ids and race wins (fixtures/oracle-corpus.json)
 *   - seeded synthetic lineages, built to reach what real players rarely build:
 *     absent grandparents, the trainee sitting as a grandparent, and parents
 *     that share many G1 wins
 *
 * BOTH SIDES SCORE AGAINST THE CURRENT GAME DATA, which is the point. A patch
 * that changes a relation's points moves both together, so this keeps working
 * after every patch, unattended. It fails only when the implementations
 * disagree. The golden fixtures, whose values were confirmed against the game,
 * stay the anchor; this is the breadth they cannot have.
 *
 * First run, against the builder's own 259 lineages as well: all six slots
 * agreed everywhere, including the two parent slots, which the old harness
 * never compared.
 */

const master = extractMaster();
const hash = extractHash();
const db = extractDatabase();
const rows = <T>(sql: string): T[] => db.prepare(sql).all() as T[];

const oracle = new HakurakuOracle({
  succession_relation: rows('SELECT relation_type, relation_point FROM succession_relation'),
  succession_relation_member: rows('SELECT relation_type, chara_id FROM succession_relation_member'),
  single_mode_wins_saddle: rows('SELECT id, win_saddle_type FROM single_mode_wins_saddle'),
  card_data: rows('SELECT id, chara_id FROM card_data'),
});

const playable = rows<{ id: number; chara_id: number }>(
  'SELECT id, chara_id FROM card_data WHERE default_rarity > 0 ORDER BY id',
);
const charaOf = new Map(playable.map((c) => [c.id, c.chara_id]));
const g1Saddles = rows<{ id: number }>('SELECT id FROM single_mode_wins_saddle WHERE win_saddle_type = 3').map((r) => r.id);
const otherSaddles = rows<{ id: number }>('SELECT id FROM single_mode_wins_saddle WHERE win_saddle_type <> 3').map((r) => r.id);

interface Package {
  self: OracleAncestor;
  parents: [OracleAncestor | null, OracleAncestor | null];
}

const corpus = JSON.parse(
  readFileSync(new URL('../../fixtures/oracle-corpus.json', import.meta.url), 'utf8'),
) as { packages: Package[] };

/** One lineage: a trainee and two packages, exactly as a pair is composed. */
interface Lineage {
  traineeCharaId: number;
  a: Package;
  b: Package;
  label: string;
}

const SLOTS = [10, 11, 12, 20, 21, 22] as const;

const ref = (x: OracleAncestor | null): AncestorRef | null =>
  x ? { cardId: x.cardId, winSaddleIds: [...x.winSaddleIds] } : null;

/** The same composition lineageFromPair performs: a's parents under 10, b's under 20. */
function request({ traineeCharaId, a, b }: Lineage): ExplainRequest {
  return {
    traineeCharaId,
    parents: [ref(a.self) as AncestorRef, ref(b.self) as AncestorRef],
    grandparents: [ref(a.parents[0]), ref(a.parents[1]), ref(b.parents[0]), ref(b.parents[1])],
  };
}

const asParent = (p: Package): OracleParent => ({ ...p.self, parents: p.parents });

/**
 * Compares all six slots on every lineage. Returns the mismatches rather than
 * asserting inside the loop, so one failure reports every disagreement with
 * the lineage that produced it, not just the first.
 */
function compare(lineages: readonly Lineage[]) {
  const mismatches: string[] = [];
  for (const l of lineages) {
    const ours = explain(request(l), master, hash).individualAffinity;
    const theirs = oracle.individualAffinities(l.traineeCharaId, asParent(l.a), asParent(l.b));
    for (const slot of SLOTS) {
      const got = ours[slot]?.value ?? 0;
      if (got !== theirs[slot]) mismatches.push(`${l.label} slot ${slot}: ours ${got}, hakuraku ${theirs[slot]}`);
    }
  }
  return mismatches;
}

/** The game's pair rules: no parent is the trainee, and the parents differ. */
function legal(traineeCharaId: number, a: Package, b: Package): boolean {
  const ca = charaOf.get(a.self.cardId);
  const cb = charaOf.get(b.self.cardId);
  return ca !== traineeCharaId && cb !== traineeCharaId && ca !== cb;
}

// ------------------------------------------------------------------ corpus

/**
 * Every unordered pair of corpus packages, each with a trainee rotating through
 * the playable cards -- and, where legal, a second trainee chosen to BE one of
 * the grandparents, so the self-link rule is exercised on real lineages too.
 */
function corpusLineages(): Lineage[] {
  const out: Lineage[] = [];
  const pkgs = corpus.packages;
  let turn = 0;
  for (let i = 0; i < pkgs.length; i++) {
    for (let j = i + 1; j < pkgs.length; j++) {
      const a = pkgs[i] as Package;
      const b = pkgs[j] as Package;
      const rotating = playable[turn++ % playable.length]?.chara_id as number;
      if (legal(rotating, a, b)) out.push({ traineeCharaId: rotating, a, b, label: `corpus ${i}x${j}` });
      const gp = a.parents[(i + j) % 2];
      const selfLink = gp ? charaOf.get(gp.cardId) : undefined;
      if (selfLink !== undefined && legal(selfLink, a, b)) {
        out.push({ traineeCharaId: selfLink, a, b, label: `corpus ${i}x${j} self-link` });
      }
    }
  }
  return out;
}

// --------------------------------------------------------------- synthetic

/** mulberry32: small, seeded, and the same sequence on every machine. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lineages real players rarely build. Win lists draw from a SMALL pool of G1s
 * so ancestors share many of them, which drives the race bonuses hard; one
 * grandparent in ten is absent; one lineage in five makes the trainee a
 * grandparent. Only real cards: an unresolvable card is a resolution question
 * with its own tests, not an affinity one.
 */
function syntheticLineages(count: number, seed: number): Lineage[] {
  const rand = prng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const g1Pool = Array.from({ length: 8 }, () => pick(g1Saddles));
  const wins = () => {
    const out = new Set<number>();
    const n = Math.floor(rand() * 10);
    for (let k = 0; k < n; k++) out.add(rand() < 0.75 ? pick(g1Pool) : pick(otherSaddles));
    return [...out];
  };
  const ancestor = (): OracleAncestor => ({ cardId: pick(playable).id, winSaddleIds: wins() });
  const maybe = () => (rand() < 0.1 ? null : ancestor());
  const pkg = (): Package => ({ self: ancestor(), parents: [maybe(), maybe()] });

  const out: Lineage[] = [];
  while (out.length < count) {
    const a = pkg();
    const b = pkg();
    let trainee = pick(playable).chara_id;
    if (rand() < 0.2) {
      const gp = [...a.parents, ...b.parents].find((x) => x !== null);
      if (gp) trainee = charaOf.get(gp.cardId) as number;
    }
    if (legal(trainee, a, b)) out.push({ traineeCharaId: trainee, a, b, label: `synthetic #${out.length} (seed ${seed})` });
  }
  return out;
}

// ------------------------------------------------------------------- tests

const fromCorpus = corpusLineages();
const synthetic = syntheticLineages(3000, 20261103);

describe('the corpus is what it claims to be', () => {
  it('holds real packages, and enough of them to mean something', () => {
    expect(corpus.packages.length).toBeGreaterThanOrEqual(100);
    expect(fromCorpus.length).toBeGreaterThan(5000);
  });

  it('carries only the two fields affinity reads -- no person, no sparks', () => {
    // The corpus is other players' public veterans. Anything beyond card ids
    // and race wins has no business in a committed file.
    const keys = new Set<string>();
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    walk(corpus.packages);
    expect([...keys].sort()).toEqual(['cardId', 'parents', 'self', 'winSaddleIds']);
  });
});

describe('our engine agrees with hakuraku on every slot', () => {
  it('on real lineages from the uma.moe corpus', () => {
    const mismatches = compare(fromCorpus);
    expect(mismatches.slice(0, 10), `${mismatches.length} disagreements`).toEqual([]);
  });

  it('on synthetic lineages built to reach the edge cases', () => {
    const mismatches = compare(synthetic);
    expect(mismatches.slice(0, 10), `${mismatches.length} disagreements`).toEqual([]);
  });
});

describe('the search actually reaches the cases it claims to', () => {
  /*
   * A comparison that never meets a self-link or a race bonus would pass while
   * proving nothing about either. These pin that the inputs exercise them.
   */
  const all = [...fromCorpus, ...synthetic];

  it('includes lineages where the trainee is a grandparent', () => {
    const selfLinks = all.filter((l) =>
      [...l.a.parents, ...l.b.parents].some((gp) => gp && charaOf.get(gp.cardId) === l.traineeCharaId),
    );
    expect(selfLinks.length).toBeGreaterThan(500);
  });

  it('includes absent grandparents', () => {
    expect(all.filter((l) => [...l.a.parents, ...l.b.parents].includes(null)).length).toBeGreaterThan(100);
  });

  it('includes parents that share G1 wins, so the race bonus is non-zero', () => {
    const g1 = new Set(g1Saddles);
    const sharing = all.filter((l) => l.a.self.winSaddleIds.some((w) => g1.has(w) && l.b.self.winSaddleIds.includes(w)));
    expect(sharing.length).toBeGreaterThan(500);
  });
});

describe('the accounting holds on every lineage', () => {
  // Carried over from check-roster.mjs, where they also only ran locally.
  // Tautologies rather than correctness tests -- both sides share link values --
  // but they catch wiring mistakes no oracle comparison would.
  const results = fromCorpus.map((l) => ({ l, r: explain(request(l), master, hash) }));

  it('sum(IA) === 2 * pairTotal - the trainee base terms', () => {
    const failures = results.filter(({ r }) => {
      const sumIA = Object.values(r.individualAffinity).reduce((t, n) => t + n.value, 0);
      const traineeBase = r.pairTotal.children.slice(0, 2).reduce((t, n) => t + n.value, 0);
      return sumIA !== 2 * r.pairTotal.value - traineeBase;
    });
    expect(failures.map(({ l }) => l.label).slice(0, 10)).toEqual([]);
  });

  it('every node equals the sum of its children', () => {
    const failures = results.filter(({ r }) => findSumViolations(r.pairTotal).length > 0);
    expect(failures.map(({ l }) => l.label).slice(0, 10)).toEqual([]);
  });
});
