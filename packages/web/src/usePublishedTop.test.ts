import { describe, expect, it } from 'vitest';
import { nextTop } from './usePublishedTop';

/*
 * Regression 8 (eng re-review): the measuring rules, lifted out of App's effect
 * into the shared hook, as a pure function. The roster pane's real height is a
 * QA check; jsdom does no layout.
 */
describe('nextTop', () => {
  it('publishes the in-flow top, rounded', () => {
    expect(nextTop(79.6, 0, 900, -1)).toBe(80);
    expect(nextTop(-4920, 5000, 900, -1)).toBe(80);
  });

  it('refuses a value taller than the viewport', () => {
    expect(nextTop(24, 5000, 900, 80)).toBeNull();
  });

  it('refuses a value below 0', () => {
    expect(nextTop(-200, 0, 900, 80)).toBeNull();
  });

  it('skips an unchanged value', () => {
    expect(nextTop(80, 0, 900, 80)).toBeNull();
  });
});
