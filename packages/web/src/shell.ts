import { COMPARE, ROOT, SEARCH, TREE } from './route';

/**
 * WHICH SCREEN THE APP DRAWS, decided in one pure function.
 *
 * These rules were inline in `App`'s render and its effects, where a wrong
 * order can only be seen by reloading a browser. Two of them were wrong in
 * exactly that way: every reload drew the landing and the drop zone for as long
 * as the stored roster took to read, and a reload of `/tree` bounced to the
 * search because the guard ran before the restored pair could be explained.
 * Here each rule is a line with a test.
 *
 *   restoring            -> header + "Restoring your roster…", on EVERY route
 *   /search, or / with a roster -> the pair search
 *   /tree + a lineage    -> the tree
 *   /tree + one coming   -> header + "Explaining…"
 *   /compare + a roster  -> the compare page
 *   anything else        -> the shell: the landing, or the roster screen
 */
export type ShellView = 'restoring' | 'search' | 'tree' | 'tree-waiting' | 'compare' | 'main';

export interface ShellState {
  path: string;
  /** The stored roster has not been looked for yet. */
  restoring: boolean;
  hasRoster: boolean;
  hasLineage: boolean;
  /** A trainee and a full pair exist, and the last explain did not fail. */
  lineageCanCome: boolean;
}

export function shellView(state: ShellState): ShellView {
  // NOTHING BUT THE HEADER UNTIL THE RESTORE ANSWERS. `roster` is null while
  // IndexedDB is read, so without this every route drew the landing and the
  // drop zone in its "parsing" state for that long -- the builder's call was
  // that no reload may show a glimpse of it.
  if (state.restoring) return 'restoring';
  if (state.hasRoster && (state.path === SEARCH || state.path === ROOT)) return 'search';
  if (state.path === TREE) {
    if (state.hasLineage) return 'tree';
    if (state.lineageCanCome) return 'tree-waiting';
  }
  if (state.path === COMPARE && state.hasRoster) return 'compare';
  return 'main';
}

/**
 * /tree IS ONLY MEANINGFUL WITH A LINEAGE BEHIND IT -- or one on its way.
 *
 * It used to ask whether a lineage HAD arrived. The guard runs in the same
 * commit as the effect that explains the restored pair, so on a reload it
 * always saw null and sent the reader to the search before the tree could be
 * drawn. "Can one come" is the question that holds for every way of arriving:
 * a reload, a bookmark, a pasted link, and a trainee change that makes a pick
 * illegal while the tree is open (the pick is dropped, so no lineage can come).
 * Never while restoring: nothing is known yet.
 */
export function treeShouldRedirect(state: ShellState): boolean {
  return (
    state.path === TREE && !state.restoring && !state.hasLineage && !state.lineageCanCome
  );
}
