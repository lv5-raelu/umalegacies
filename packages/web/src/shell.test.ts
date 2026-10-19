import { describe, expect, it } from 'vitest';
import { COMPARE, ROOT, ROSTER, SEARCH, TREE } from './route';
import { shellView, treeShouldRedirect, type ShellState } from './shell';

const state = (over: Partial<ShellState>): ShellState => ({
  path: ROOT,
  restoring: false,
  hasRoster: true,
  hasLineage: false,
  lineageCanCome: false,
  ...over,
});

describe('shellView', () => {
  it('draws nothing but the header while restoring, on every route', () => {
    for (const path of [ROOT, SEARCH, ROSTER, TREE, COMPARE]) {
      expect(shellView(state({ path, restoring: true, hasLineage: true }))).toBe('restoring');
    }
  });

  it('is the search at /search and at the root once a roster exists', () => {
    expect(shellView(state({ path: SEARCH }))).toBe('search');
    expect(shellView(state({ path: ROOT }))).toBe('search');
  });

  it('is the landing at /search with no roster', () => {
    expect(shellView(state({ path: SEARCH, hasRoster: false }))).toBe('main');
  });

  it('draws the tree with a lineage, and waits while one is coming', () => {
    expect(shellView(state({ path: TREE, hasLineage: true }))).toBe('tree');
    expect(shellView(state({ path: TREE, lineageCanCome: true }))).toBe('tree-waiting');
  });

  it('is the compare page with a roster, and the landing without', () => {
    expect(shellView(state({ path: COMPARE }))).toBe('compare');
    expect(shellView(state({ path: COMPARE, hasRoster: false }))).toBe('main');
  });

  it('is the roster screen at /roster', () => {
    expect(shellView(state({ path: ROSTER }))).toBe('main');
  });
});

/*
 * Regression test 2 (eng review 1A), written before the guard changed. The guard
 * asked whether a lineage HAD arrived, in the same commit as the effect that
 * explains a restored pair, so every reload of /tree bounced to the search.
 */
describe('treeShouldRedirect', () => {
  it('never redirects while restoring', () => {
    expect(treeShouldRedirect(state({ path: TREE, restoring: true, hasRoster: false }))).toBe(false);
  });

  it('does not redirect when a trainee and a full pair exist but the lineage has not arrived', () => {
    expect(treeShouldRedirect(state({ path: TREE, lineageCanCome: true }))).toBe(false);
  });

  it('redirects when no pair is possible', () => {
    expect(treeShouldRedirect(state({ path: TREE }))).toBe(true);
    expect(treeShouldRedirect(state({ path: TREE, hasRoster: false }))).toBe(true);
  });

  it('does not redirect with a lineage, or away from /tree', () => {
    expect(treeShouldRedirect(state({ path: TREE, hasLineage: true }))).toBe(false);
    expect(treeShouldRedirect(state({ path: SEARCH }))).toBe(false);
  });
});
