import { describe, expect, it } from 'vitest';
import { APTITUDE_GRADES, APTITUDE_BY_PINK_GROUP, aptitudeLift, stepsFromStars } from './aptitude.js';

/**
 * THE CAREER-START PINK GRANT, which is a table and not a probability.
 *
 * Reproduces uma.guide's Sparks table: a starting aptitude and a star total
 * give one answer, every time. The worked example a reader gave back unprompted
 * -- Oguri Cap's End Closer is D and reaching A takes 7 stars -- is the row this
 * was checked against first.
 */

const i = (grade: string) => APTITUDE_GRADES.indexOf(grade as never);

describe('how many steps a star total buys', () => {
  it.each([
    [0, 0],
    [1, 1],
    [3, 1],
    [4, 2],
    [6, 2],
    [7, 3],
    [9, 3],
    [10, 4],
    [18, 4],
  ])('%i stars gives %i steps', (stars, steps) => {
    expect(stepsFromStars(stars)).toBe(steps);
  });
});

describe('the published table, row by row', () => {
  it.each([
    // Every cell of uma.guide's grid, read as "start, stars -> open at".
    ['B', 1, 'A'],
    ['C', 1, 'B'],
    ['C', 4, 'A'],
    ['D', 1, 'C'],
    ['D', 4, 'B'],
    ['D', 7, 'A'],
    ['E', 1, 'D'],
    ['E', 4, 'C'],
    ['E', 7, 'B'],
    ['E', 10, 'A'],
    ['F', 10, 'B'],
    ['G', 10, 'C'],
  ])('starting at %s with %i stars opens at %s', (from, stars, to) => {
    expect(aptitudeLift(i(from), stars)?.to).toBe(to);
  });

  it('is the reader’s own worked example', () => {
    // "An End Closer Oguri Cap would need to raise End Closer from D to A,
    // which requires 7 (1 + 3 + 3) sparks."
    const lift = aptitudeLift(i('D'), 7);
    expect(lift).toEqual({ from: 'D', to: 'A', steps: 3, cappedAtA: false });
    expect(aptitudeLift(i('D'), 6)?.to).toBe('B');
  });
});

describe('the A ceiling', () => {
  it('never reaches S, however many stars are behind it', () => {
    // S is what an April inspiration is for; the start grant cannot give it.
    for (const stars of [10, 12, 18, 100]) {
      expect(aptitudeLift(i('A'), stars)?.to).toBe('A');
      expect(aptitudeLift(i('B'), stars)?.to).toBe('A');
    }
  });

  it('says when the ceiling is what stopped it, not the star count', () => {
    // A reader who sees 10 stars buy one step should learn it is the rule
    // rather than their lineage.
    expect(aptitudeLift(i('B'), 10)).toEqual({ from: 'B', to: 'A', steps: 1, cappedAtA: true });
    expect(aptitudeLift(i('D'), 4)).toEqual({ from: 'D', to: 'B', steps: 2, cappedAtA: false });
  });

  it('reports no movement rather than negative movement at the top', () => {
    expect(aptitudeLift(i('A'), 10)).toEqual({ from: 'A', to: 'A', steps: 0, cappedAtA: true });
    expect(aptitudeLift(i('S'), 10)).toEqual({ from: 'S', to: 'S', steps: 0, cappedAtA: true });
  });
});

describe('what it refuses to answer', () => {
  it('has nothing to say without a base grade', () => {
    // A request with no trainee CARD. Aptitudes belong to the costume -- Haru
    // Urara's two cards differ by a step on Mile -- so a character-level guess
    // would print a confident wrong letter.
    expect(aptitudeLift(null, 9)).toBeNull();
  });

  it('refuses a grade outside the ladder rather than indexing past it', () => {
    expect(aptitudeLift(-1, 4)).toBeNull();
    expect(aptitudeLift(8, 4)).toBeNull();
    expect(aptitudeLift(1.5, 4)).toBeNull();
  });
});

describe('which pink raises which aptitude', () => {
  it('covers all ten and nothing else', () => {
    // The ten pink factor groups, from the extract. A missing one would leave
    // that aptitude silently unanswerable.
    expect(Object.keys(APTITUDE_BY_PINK_GROUP)).toHaveLength(10);
    expect(new Set(Object.values(APTITUDE_BY_PINK_GROUP)).size).toBe(10);
    expect(APTITUDE_BY_PINK_GROUP[24]).toBe('endCloser');
    expect(APTITUDE_BY_PINK_GROUP[33]).toBe('medium');
  });
});
