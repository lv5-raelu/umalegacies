import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LineageResponse,
  ParentPick,
  RosterResolveResponse,
  RosterVeteranInput,
  SparkCriterion,
  TraineeOption,
} from '@umalegacies/types';
import {
  ApiError,
  fetchMasterMeta,
  fetchTrainees,
  resolveRoster,
} from './api/client';
import { TreePage } from './lineage/TreePage';
import { ComparePane, paneState } from './roster/ComparePane';
import { SiteNav, navTargets } from './SiteNav';
import { DropZone } from './roster/DropZone';
import { SparkFilter } from './roster/SparkFilter';
import { TraineePicker } from './roster/TraineePicker';
import { catalogueOf } from './roster/catalogue';
import { VeteranList } from './roster/VeteranList';
import { filterVeterans, pickBlock } from '@umalegacies/core';
import { explainPairRequest, isOwnPickOf, ownPick, ownVeterans } from './roster/picks';
import { explainFailure, explainPairLocally } from './lineage/explain-local';
import { SaveError, slimSave, type SkippedEntry } from './roster/save';
import { CACHE_VERSION, explainDiscard, inspectCache } from './roster/cache-policy';
import {
  clearRoster,
  clearSelection,
  readRoster,
  readSelection,
  writeRoster,
  writeSelection,
} from './roster/cache';
import { picksToCache, restoreSelection, restoreTray, trayToCache } from './roster/selection';
import { ComparePage, FRESH_COMPARE, type CompareMemory } from './compare/ComparePage';
import type { ColumnResult } from './compare/run-columns';
import { CompareToggle, type CompareStatus } from './compare/CompareToggle';
import { TRAY_CAP, addToTray, dedupeKey, trayIndexOf, LETTERS, type TrayPair } from './compare/tray';
import type { OddsView } from './lineage/odds';
import { PairSearch, PAGE } from './search/PairSearch';
import { COMPARE, ROOT, SEARCH, TREE, navigate, usePath } from './route';
import { shellView, treeShouldRedirect } from './shell';
import { usePublishedTop } from './usePublishedTop';
import styles from './App.module.css';

/**
 * THE ROOT IS ONLY THE LANDING: the drop zone before a roster exists, and
 * Optimize Parents once one does.
 *
 * The roster list used to BE the root, so every upload landed on it -- while
 * most readers went straight on to the pair search. The search is now where an
 * upload goes and what the root shows, and the list has a path of its own.
 *
 * `replace`, so "back" skips a root that would only redirect again.
 */
const toSearch = (): void => navigate(SEARCH, { replace: true });

/**
 * M3: your own roster, on screen, with two veterans compared.
 *
 * Upload -> pick a trainee -> pick two veterans -> the odds, and the tree behind
 * them on its own page. The save is read in the browser and slimmed to three
 * public fields per uma before anything is sent; see roster/save.ts, which is
 * where the privacy promise actually lives.
 */
type Save = { fileName: string; veterans: RosterVeteranInput[]; skipped: SkippedEntry[] };

export function App() {
  const [save, setSave] = useState<Save | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterResolveResponse | null>(null);
  const [trainees, setTrainees] = useState<TraineeOption[]>([]);
  const [traineeCardId, setTraineeCardId] = useState<number | null>(null);
  /**
   * TWO REQUIREMENT LISTS, NOT ONE, and the separation is load-bearing.
   *
   * `criteria` belongs to the roster LIST, where a row is one veteran and
   * `matchesCriterion` asks whether that veteran meets the whole requirement.
   * `searchCriteria` belongs to the pair SEARCH, where `matchesPair` asks what
   * six ancestors carry between them.
   *
   * They were briefly one list. A requirement authored for a pair then landed
   * on the roster list as if a single veteran had to satisfy it: on the
   * builder's roster, "End Closer >= 7 across the lineage" found 103 pairs
   * while the list behind it showed 0 of 259, because the best pair held 8
   * stars as 3 + 5 and neither half cleared 7 on its own. Picking that pair and
   * going back left a populated compare pane over an empty roster.
   */
  const [criteria, setCriteria] = useState<SparkCriterion[]>([]);
  const [searchCriteria, setSearchCriteria] = useState<SparkCriterion[]>([]);
  /**
   * WHICH LIST PRODUCED THE PAIR ON SCREEN.
   *
   * The two lists were separated because a pair-scoped requirement applied to
   * single veterans emptied the roster list. That fixed the list and left the
   * screens that EXPLAIN a pair reading the wrong one: the tree, reached by
   * "Show breakdown" straight out of a search, highlighted the roster's
   * requirements rather than the ones that found the pair.
   *
   * A discriminator rather than a third copy of the criteria. The highlight
   * then follows the list it names, so editing the search's requirements
   * updates a pair found by searching -- which is right, because the highlight
   * says "what you are looking for", and the reader has just changed it.
   */
  const [pairFrom, setPairFrom] = useState<'list' | 'search'>('list');
  /** The pair, oldest first, at most two. See `ParentPick`. */
  const [picks, setPicks] = useState<ParentPick[]>([]);
  const [lineage, setLineage] = useState<LineageResponse | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const path = usePath();
  const [masterChanged, setMasterChanged] = useState(false);
  /** How many result rows are rendered. The sweep is complete; the LIST is paged. */
  const [shownResults, setShownResults] = useState(PAGE);
  /**
   * True until the stored roster has been looked for.
   *
   * While it is, every route draws the header and "Restoring your roster…" and
   * nothing else (`shellView`). The drop zone used to stand in for that wait,
   * in its parsing state, which read as the app forgetting and then
   * remembering -- for as long as several MB took to read on a phone.
   */
  const [restoring, setRestoring] = useState(true);
  /**
   * THE COMPARE TRAY, beside the picks and separate from them: the picks are
   * the one pair being built, the tray the pairs being read. A trainee change
   * drops an illegal pick and leaves the tray alone -- an illegal pair keeps
   * its column on /compare and says why.
   */
  const [tray, setTray] = useState<TrayPair[]>([]);
  const trayNow = useRef(tray);
  trayNow.current = tray;
  /** The tray was emptied because the roster changed; /compare says so once. */
  const [trayCleared, setTrayCleared] = useState(false);
  /**
   * THE ODDS WINDOW, one for every surface that prints odds: the roster pane,
   * the search's detail and /compare. It lived in the pane, which kept it across
   * a re-explain; it lives here now so the three can never show one pair in two
   * windows. A reload starts at "at least once".
   */
  const [oddsView, setOddsView] = useState<OddsView>('once');
  /** /compare's place for the round trip, in memory only. */
  const [compareMemory, setCompareMemory] = useState<CompareMemory>(FRESH_COMPARE);
  /** The pair "In compare · C" asked to see, until /compare has shown it. */
  const [compareTarget, setCompareTarget] = useState<string | null>(null);
  /** /compare's explained pairs, keyed; outlives the page. See `useCompareColumns`. */
  const [compareResults] = useState(() => new Map<string, ColumnResult>());
  // The extract every number on screen was computed from. Echoed on the next
  // request so a rebuilt extract is caught rather than silently mixed in.
  const seenMasterHash = useRef<string | undefined>(undefined);
  /** The game data moved under this tab: drop the pin and raise the one banner. */
  const markMasterStale = useCallback(() => {
    seenMasterHash.current = undefined;
    setMasterChanged(true);
  }, []);

  /**
   * Publishes where the two-pane grid starts, as `--pane-top`, so the compare
   * pane can be sized "everything from here down".
   *
   * MEASURED ON THE GRID, NOT ON THE PANE. The pane is `position: sticky`, and a
   * stuck element's `getBoundingClientRect().top` reports where it is PINNED,
   * not where it sits in flow -- so `rect.top + scrollY` returned 80 at the top
   * of the page and 5,024 once scrolled to 5,000. `offsetTop` is no better; it
   * reported 5,024 too. Either one collapsed the pane to a sliver showing only
   * the headline number, and it was certain to happen rather than unlucky: 259
   * lazily-loaded portraits resize the document constantly while you scroll, and
   * every one of them re-fires this.
   *
   * The grid container is not sticky, so its offset is genuinely constant. The
   * pane column is its only child in that row, so the two share a top edge.
   * The rules, and why it is a callback ref, are `usePublishedTop`'s.
   */
  const panes = usePublishedTop('--pane-top');

  /**
   * NO GUARD LIKE /tree's for /search or /roster. The tree is meaningless
   * without a lineage and has to disarm itself; these only need a ROSTER, and
   * arriving at one with none is a state the app already handles well -- the
   * drop zone renders, and the upload carries on to the search.
   *
   * The root with a roster behind it is the search; say so in the address bar.
   * Covers a reload restoring a roster, a bookmark of the bare URL, and the
   * tree guard below dropping back to the root.
   */
  useEffect(() => {
    if (path === ROOT && roster !== null) toSearch();
  }, [path, roster]);

  /**
   * Bring back the roster this browser already has, if it is still true.
   *
   * Two steps, and the order is the point. The record is restored FIRST, on the
   * strength of its own shape, so a reload costs no request before the list is
   * back. Only then is the extract it was computed from compared with the one
   * the server is serving now -- because that answer needs the network, and
   * blocking the restore on it would trade the whole benefit for a check that
   * almost always passes.
   *
   * When it does not pass, the roster is dropped rather than shown. A restore
   * against a rebuilt extract would put stale numbers on screen with nothing to
   * indicate it, and the numbers are the entire product.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, storedSelection] = await Promise.all([readRoster(), readSelection()]);
      const optimistic = inspectCache(stored, null);
      if (cancelled) return;

      if (!optimistic.use) {
        // A version bump or a half-written record leaves rubbish behind; take
        // the chance to remove it rather than re-reading it on every visit.
        // The selection goes with it: it is indices into a list that is gone.
        if (optimistic.reason !== 'absent') {
          void clearRoster();
          void clearSelection();
        }
        setRestoring(false);
        return;
      }

      const { record } = optimistic;
      setSave({ fileName: record.fileName, veterans: record.veterans, skipped: record.skipped });
      setRoster(record.resolved);
      setTrainees(record.trainees);
      seenMasterHash.current = record.masterHash;

      // Whatever of the last session's choices still holds. Setting all three
      // before `restoring` drops means the pair is explained on the first pass,
      // rather than the screen showing an empty pane and then filling in.
      const selection = restoreSelection(storedSelection, record.resolved, record.trainees);
      setTraineeCardId(selection.traineeCardId);
      setCriteria(selection.criteria);
      setSearchCriteria(selection.searchCriteria);
      setPairFrom(selection.pairFrom);
      setPicks(selection.picks);
      setTray(restoreTray(storedSelection, record.resolved));
      setRestoring(false);

      // Now confirm the game data has not moved. A failure here is not worth
      // reporting: the roster on screen is the one that was stored, and the
      // next request will catch a stale extract through STALE_MASTER_HASH.
      let current: string;
      try {
        current = (await fetchMasterMeta()).masterHash;
      } catch {
        return;
      }
      if (cancelled) return;

      const checked = inspectCache(record, current);
      if (checked.use) return;

      void clearRoster();
      void clearSelection();
      setSave(null);
      setRoster(null);
      setTrainees([]);
      setTraineeCardId(null);
      setCriteria([]);
      setPicks([]);
      dropTray();
      setLineage(null);
      seenMasterHash.current = undefined;
      setSaveError(explainDiscard(checked));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The tray holds indices into ONE roster, so it goes wherever the roster
   * goes: forgotten, replaced, or found stale. Cleared in memory as well as in
   * the record, or the selection write puts the old tray straight back.
   */
  const dropTray = useCallback(() => {
    if (trayNow.current.length > 0) setTrayCleared(true);
    setTray([]);
    setCompareMemory(FRESH_COMPARE);
    compareResults.clear();
  }, [compareResults]);

  /** Forget the stored roster and return to the drop zone. */
  const forget = useCallback(() => {
    void clearRoster();
    void clearSelection();
    setSave(null);
    setRoster(null);
    setTrainees([]);
    setTraineeCardId(null);
    setCriteria([]);
    setPicks([]);
    dropTray();
    setLineage(null);
    setSaveError(null);
    seenMasterHash.current = undefined;
    // Back to the landing: with nothing loaded, the root is the drop zone.
    navigate(ROOT, { replace: true });
  }, [dropTray]);

  const loadFile = useCallback(async (file: File) => {
    setParsing(true);
    setSaveError(null);
    try {
      const { veterans, skipped } = slimSave(await file.text());
      // Everything appears together after parsing: the picker and the list are
      // absent until there is something for them to show.
      const [resolved, traineeList] = await Promise.all([
        resolveRoster(veterans, seenMasterHash.current),
        fetchTrainees(),
      ]);
      seenMasterHash.current = resolved.masterHash;
      setSave({ fileName: file.name, veterans, skipped });
      setRoster(resolved);
      setTrainees(traineeList.trainees);
      setPicks([]);
      dropTray();
      setLineage(null);
      // Wherever the file was dropped, the next step is finding a pair.
      toSearch();

      // After the state, never before: a write that fails must not stop the
      // roster reaching the screen. writeRoster swallows its own errors.
      void writeRoster({
        version: CACHE_VERSION,
        masterHash: resolved.masterHash,
        fileName: file.name,
        savedAt: Date.now(),
        veterans,
        skipped,
        resolved,
        trainees: traineeList.trainees,
      });
    } catch (error) {
      if (error instanceof SaveError) setSaveError(error.message);
      else if (error instanceof ApiError && error.code === 'STALE_MASTER_HASH') {
        // The server rebuilt its extract while this tab was open. Drop the pin
        // and say out loud that the game data moved, rather than showing an
        // error for something recoverable.
        seenMasterHash.current = undefined;
        setMasterChanged(true);
        setSaveError('The game data changed while this page was open. Load the file again.');
      } else if (error instanceof ApiError) setSaveError(error.message);
      else setSaveError(String(error));
    } finally {
      setParsing(false);
    }
  }, [dropTray]);

  /**
   * The requirements a pair is EXPLAINED against, wherever it is explained.
   *
   * The roster list keeps using `criteria` directly: it filters veterans, and
   * that is the only list whose scope is a single package. Everything that
   * shows a PAIR -- the compare pane, the tree -- reads this instead.
   */
  const pairCriteria = pairFrom === 'search' ? searchCriteria : criteria;

  const shown = useMemo(() => {
    if (!roster) return [];
    /*
     * Sorted HERE, not on the server: `index` joins a row back to the slimmed
     * package the browser still holds, so the response stays in request order.
     *
     * A PICK GOES TO THE TOP, REINSTATED ON THE BUILDER'S CALL.
     *
     * This was tried once and taken out, because clicking a card in the middle
     * of 259 made the list jump and left a different card under the pointer.
     * That reasoning still holds for a click and is knowingly re-accepted,
     * because it never applied to the case that brought it back: arriving from
     * the pair search, the two picks are ALREADY set, nothing moves under
     * anyone's cursor, and without this they sit wherever their scores put them
     * in a list of 259 with nothing to say where.
     *
     * Picked first, then the existing order among themselves, so the pair reads
     * in the same order the compare pane names it rather than in click order.
     */
    const pinned = new Set(
      picks.flatMap((pick) => (pick.kind === 'own' ? [pick.index] : [])),
    );
    return filterVeterans(roster.veterans, criteria).sort(
      (a, b) =>
        Number(pinned.has(b.index)) - Number(pinned.has(a.index)) ||
        b.score - a.score ||
        a.self.name.localeCompare(b.self.name),
    );
  }, [roster, criteria, picks]);

  const trainee = useMemo(
    () => trainees.find((t) => t.cardId === traineeCardId) ?? null,
    [trainees, traineeCardId],
  );

  /**
   * WHICH SCREEN, decided by `shellView` (shell.ts), where each rule is tested.
   *
   * The root counts as the search the moment there is a roster, so the screen
   * is right on the first render and the effect above only fixes the address.
   */
  const shell = {
    path,
    restoring,
    hasRoster: roster !== null && save !== null,
    hasLineage: lineage !== null,
    // A lineage CAN come: the explain effect below will produce one. Asked
    // instead of "has one arrived", which a reload never had in time.
    lineageCanCome:
      roster !== null && save !== null && trainee !== null && picks.length === 2 && pairError === null,
  };
  const view = shellView(shell);

  /**
   * /tree IS ONLY MEANINGFUL WITH A LINEAGE BEHIND IT, or one on its way; the
   * rule is `treeShouldRedirect`. Reacting to the STATE rather than to any one
   * way of arriving covers all of them -- a reload, a bookmark, a hand-typed
   * `/tree`, and a pick invalidated while the tree is open (switching the
   * trainee to one of the picked umas drops that pick, and nothing can come).
   *
   * A reload is now the ordinary case rather than the broken one: the roster
   * and the pair come back from IndexedDB, so the guard waits out the restore
   * and then the explain instead of sending the reader to the search.
   *
   * Replaced rather than pushed: no extra history entry to go "back" into.
   */
  const redirectTree = treeShouldRedirect(shell);
  useEffect(() => {
    if (redirectTree) navigate(ROOT, { replace: true });
  }, [redirectTree]);

  /**
   * The picked veterans themselves. Kept separate from `shown` because a filter
   * can hide a pick, and the rules that depend on what is already picked --
   * two-is-the-limit, and no two parents of the same uma -- must hold whether or
   * not the picked card is currently on screen.
   */
  const pickedVeterans = useMemo(() => ownVeterans(picks, roster), [roster, picks]);

  /**
   * Picks the filter is currently hiding. Narrow on a spark neither pick
   * carries and both vanish, leaving a full pair with nothing on screen that
   * looks picked -- the one state the counter has to spell out.
   */
  const hiddenPicks = useMemo(
    () => picks.filter((p) => p.kind === 'own' && !shown.some((v) => v.index === p.index)).length,
    [picks, shown],
  );

  const catalogue = useMemo(
    () => catalogueOf(roster?.sparkOptions ?? []),
    [roster],
  );

  const pick = useCallback(
    (index: number) => {
      const veteran = roster?.veterans[index];
      // No row, no pick. The index always comes from a rendered card, so this
      // cannot fire -- but a pick now CARRIES the card it was made against, and
      // there is nowhere to read that from if the row is not there.
      if (!veteran) return;
      // The rule lives in one place and is enforced here too, not only by the
      // card refusing its own click: a keyboard or a stale render must not be
      // able to compose a pair the game does not allow.
      if (pickBlock(veteran, pickedVeterans, trainee?.charaId ?? null) !== null) return;
      setPairFrom('list');
      setPicks((current) => {
        if (current.some((p) => isOwnPickOf(p, index)))
          return current.filter((p) => !isOwnPickOf(p, index));
        // TWO IS THE LIMIT, and a third click does nothing rather than
        // silently evicting a pick. Swapping a parent is a deliberate two-step:
        // unselect the one you are replacing, then select its replacement.
        // Auto-replacing the older pick guessed at which of the two the user
        // meant to keep, and it guessed invisibly.
        if (current.length >= 2) return current;
        return [...current, ownPick(veteran)];
      });
    },
    [roster, pickedVeterans, trainee],
  );

  // Changing the trainee can invalidate a pick that was legal a moment ago: you
  // are not your own parent. Drop those rather than leave the pair in a state
  // the rules forbid and the pick handler would refuse to recreate.
  //
  // Own picks only, because the test is on `charaId` and that is a resolved
  // field: a borrowed package carries card ids and nothing else, so the borrow
  // release has to resolve one before it can ask this question at all.
  useEffect(() => {
    if (!roster || trainee === null) return;
    setPicks((current) => {
      const kept = current.filter(
        (p) => p.kind !== 'own' || roster.veterans[p.index]?.self.charaId !== trainee.charaId,
      );
      // Same array when nothing was dropped. `filter` always returns a new one,
      // and a new identity here re-fires the pair request and the selection
      // write on every trainee change that invalidated nothing.
      return kept.length === current.length ? current : kept;
    });
  }, [roster, trainee]);

  /**
   * Remember the three choices, so a reload does not cost them.
   *
   * NOT WHILE RESTORING. This effect runs on the first render too, when all
   * three are still at their defaults -- writing then would overwrite the very
   * record the restore is about to read, and the bug would look like "it
   * forgets sometimes" rather than like a race. `restoring` stays true until
   * the lookup has finished either way, so there is no window where an empty
   * selection can be written over a real one.
   *
   * `roster` is the second guard: with nothing loaded there is nothing for an
   * index to point into, and the drop zone is the whole screen anyway.
   */
  useEffect(() => {
    if (restoring || !roster) return;
    void writeSelection({
      version: CACHE_VERSION,
      traineeCardId,
      criteria: [...criteria],
      searchCriteria: [...searchCriteria],
      pairFrom,
      picks: picksToCache(picks, roster),
      tray: trayToCache(tray, roster),
    });
  }, [restoring, roster, traineeCardId, criteria, searchCriteria, pairFrom, picks, tray]);

  /**
   * "Show breakdown" for a pair the reader did not build on the roster: from a
   * search result or a /compare column. ONE handoff for both.
   *
   * The pair becomes the roster's pair -- which is what "show me this pair"
   * means, and /tree draws App's single lineage -- and the lineage arrives WITH
   * it. The explain effect below would otherwise leave `lineage` on the old
   * pair for a moment, and /tree would open the roster's pair, not this one.
   * `pairFrom` is the caller's: /compare leaves it, so the tree highlights the
   * criteria /compare showed.
   */
  const takePair = useCallback((pair: TrayPair, explained: LineageResponse | null) => {
    setPicks([pair[0], pair[1]]);
    if (explained !== null) setLineage(explained);
    navigate(TREE);
  }, []);

  /** Where a pair stands in the tray, for the control that adds it. */
  const compareState = useCallback(
    (pair: TrayPair): CompareStatus => {
      const at = trayIndexOf(tray, pair);
      if (at !== -1) return { kind: 'in' as const, letter: LETTERS[at] ?? '?' };
      if (tray.length >= TRAY_CAP) return { kind: 'full' as const };
      return { kind: 'add' as const };
    },
    [tray],
  );
  const addToCompare = useCallback((pair: TrayPair) => {
    setTray((current) => {
      const added = addToTray(current, pair);
      return added.ok ? added.tray : current;
    });
  }, []);
  /** Open /compare at this pair: the target wins over the saved scroll. */
  const openCompare = useCallback((pair: TrayPair | null) => {
    setCompareTarget(pair === null ? null : dedupeKey(pair));
    navigate(COMPARE);
  }, []);

  /*
   * The same three, by roster row, for the search -- whose rows are memoised,
   * so these must keep their identity while the tray changes.
   */
  const pairAt = useCallback(
    (a: number, b: number): TrayPair | null => {
      const first = roster?.veterans[a];
      const second = roster?.veterans[b];
      return first && second ? [ownPick(first), ownPick(second)] : null;
    },
    [roster],
  );
  const compareStatusAt = useCallback(
    (a: number, b: number): CompareStatus => {
      const pair = pairAt(a, b);
      return pair === null ? { kind: 'add' } : compareState(pair);
    },
    [pairAt, compareState],
  );
  const addToCompareAt = useCallback(
    (a: number, b: number) => {
      const pair = pairAt(a, b);
      if (pair !== null) addToCompare(pair);
    },
    [pairAt, addToCompare],
  );
  const openCompareAt = useCallback((a: number, b: number) => openCompare(pairAt(a, b)), [pairAt, openCompare]);

  // Explain the pair whenever the trainee or either pick changes.
  useEffect(() => {
    if (!save || !roster || trainee === null) {
      setLineage(null);
      return;
    }

    const request = explainPairRequest(trainee, picks, save.veterans);
    // Null until the pair is two. Nothing to explain, and nothing to show.
    if (!request) {
      setLineage(null);
      return;
    }

    let cancelled = false;
    setPairLoading(true);
    setPairError(null);
    // LOCALLY, since T16. The same `packages/core` functions the route runs,
    // over the game data this page already downloaded for the search, at 0.375
    // ms against the route's measured 35.3 ms -- and byte-identical output.
    // `explain-pair` still exists as the tested reference; nothing calls it
    // from here any more.
    explainPairLocally(request, roster.masterHash)
      .then((result) => {
        if (cancelled) return;
        seenMasterHash.current = result.masterHash;
        setLineage(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Same banner, different messenger: the server used to answer 409
        // STALE_MASTER_HASH, and now the page notices the disagreement itself.
        const failure = explainFailure(error);
        if (failure.stale) markMasterStale();
        setPairError(failure.message);
      })
      .finally(() => {
        if (!cancelled) setPairLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [save, roster, trainee, picks]);

  /*
   * THE PAIR SEARCH, a whole-screen route like the tree.
   *
   * It shares this component's trainee and criteria rather than holding its
   * own, which is what makes a filter set here still set when the user goes
   * back, and what makes the pair it returns the pair the compare pane
   * explains. The wireframe it grew out of deliberately kept its own copies,
   * because a throwaway surface must not rewrite a persisted selection.
   */
  if (view === 'search' && roster && save) {
    return (
      <PairSearch
        roster={roster}
        packages={save.veterans}
        trainees={trainees}
        traineeCardId={traineeCardId}
        criteria={searchCriteria}
        shown={shownResults}
        onTrainee={setTraineeCardId}
        onCriteria={(next) => {
          setSearchCriteria(next);
          setShownResults(PAGE);
        }}
        onShowMore={() => setShownResults((n) => n + PAGE)}
        oddsView={oddsView}
        onOddsView={setOddsView}
        compareStatus={compareStatusAt}
        onCompareAdd={addToCompareAt}
        onCompareOpen={openCompareAt}
        onStale={markMasterStale}
        onPick={(a, b, explained) => {
          // Both halves at once, because a search result IS a pair -- unlike a
          // click in the roster list, which can only ever add one. `ownPick`
          // stamps each with the card it was made against, exactly as a click
          // does, so a restore checks them the same way.
          const picked = [roster.veterans[a], roster.veterans[b]];
          if (picked[0] === undefined || picked[1] === undefined) return;
          setPairFrom('search');
          /*
           * THE LINEAGE ARRIVES WITH THE PICK, which matters for the tree.
           *
           * The effect below explains a new pair asynchronously, so `lineage`
           * is null for a moment after the picks change -- and the tree guard
           * bounces anyone who lands on `#tree` with no lineage to draw. A
           * first-ever "Show breakdown" would therefore have come out on the
           * roster, which is the symptom this arrived as. The detail already
           * explained this exact pair locally, so handing it over closes the
           * window rather than racing it.
           */
          takePair([ownPick(picked[0]), ownPick(picked[1])], explained);
        }}
        nav={
          <SiteNav
            current={SEARCH}
            targets={navTargets({ hasRoster: true, hasLineage: lineage !== null, trayCount: tray.length })}
          />
        }
      />
    );
  }

  if (view === 'compare' && roster && save) {
    return (
      <ComparePage
        roster={roster}
        veterans={save.veterans}
        trainees={trainees}
        traineeCardId={traineeCardId}
        onTrainee={setTraineeCardId}
        tray={tray}
        onTray={setTray}
        criteria={pairCriteria}
        view={oddsView}
        onView={setOddsView}
        memory={compareMemory}
        onMemory={setCompareMemory}
        results={compareResults}
        onStale={markMasterStale}
        onShowBreakdown={takePair}
        trayCleared={trayCleared}
        onTrayClearedSeen={() => setTrayCleared(false)}
        target={compareTarget}
        onTargetUsed={() => setCompareTarget(null)}
        nav={
          <SiteNav
            current={COMPARE}
            targets={navTargets({ hasRoster: true, hasLineage: lineage !== null, trayCount: tray.length })}
          />
        }
      />
    );
  }

  if (view === 'tree' && lineage) {
    return (
      <TreePage
        lineage={lineage}
        criteria={pairCriteria}
        nav={<SiteNav current={TREE} targets={navTargets({ hasRoster: true, hasLineage: true, trayCount: tray.length })} />}
      />
    );
  }

  const header = (
    <header className={styles.top}>
      <h1 className={styles.wordmark}>Uma Legacies</h1>
      <SiteNav current={path} targets={navTargets({ hasRoster: roster !== null, hasLineage: lineage !== null, trayCount: tray.length })} />
    </header>
  );

  /*
   * A WAITING SURFACE SAYS WHAT IT IS WAITING FOR (DESIGN.md), at once, with no
   * delay: the header and one muted line, and nothing that is about to be
   * replaced. The drop zone used to stand in for this on every reload.
   */
  if (view === 'restoring' || view === 'tree-waiting') {
    return (
      <main className={`${styles.shell} ${styles.wide}`}>
        {header}
        <p className={styles.waiting} role="status">
          {view === 'restoring' ? 'Restoring your roster…' : 'Explaining…'}
        </p>
      </main>
    );
  }

  // The same control in both states, so it is built once and placed twice. On
  // the first run it is the ONLY thing to do and gets the middle of the screen;
  // once a roster is loaded it collapses to a one-line summary naming the file
  // and belongs at the top, above the list.
  const dropZone = (
    <DropZone
      state={parsing ? 'parsing' : roster ? 'loaded' : 'empty'}
      fileName={save?.fileName ?? null}
      veteranCount={roster?.veterans.length ?? 0}
      error={saveError}
      onFile={(file) => {
        void loadFile(file);
      }}
      onForget={forget}
    />
  );

  return (
    <main className={`${styles.shell} ${roster ? styles.wide : styles.landing}`}>
      {header}

      {masterChanged && (
        <p className={styles.notice}>
          The master data changed while this page was open. Anything you noted earlier came
          from a different extract.
        </p>
      )}

      {roster ? (
        dropZone
      ) : (
        <div className={styles.welcome}>
          <p className={styles.lede}>
            Load your veteran data to read your trained umas. Filter by the sparks you want,
            pick two parents, and see the pair&rsquo;s affinity, relation rank, and each
            spark&rsquo;s chance of activating. Or search the roster for the pair that
            fits your requirements best.
          </p>
          {dropZone}
        </div>
      )}

      {roster && (
        <>
          {save && save.skipped.length > 0 && (
            <p className={styles.noticeUnresolved}>
              {save.skipped.length} entr{save.skipped.length === 1 ? 'y' : 'ies'} in that file
              could not be read and {save.skipped.length === 1 ? 'was' : 'were'} left out.{' '}
              {save.skipped[0]?.reason} The other {roster.veterans.length} loaded normally.
            </p>
          )}

          {roster.unresolvedCount > 0 && (
            <p className={styles.noticeUnresolved}>
              {roster.unresolvedCount} veteran{roster.unresolvedCount === 1 ? '' : 's'} could not
              be identified, most likely because a game patch added an uma since the master
              extract was built. They are greyed below; everything else is usable. Rebuild the
              extract to fix them.
            </p>
          )}

          <div className={styles.panes} ref={panes}>
            <div>
              <TraineePicker
                trainees={trainees}
                chosen={traineeCardId}
                onChoose={setTraineeCardId}
              />
              {/*
                THE TRAINEE COMES FIRST, and the roster is simply absent until it
                is chosen -- no placeholder, no explanation. Who you are training
                decides which veterans are legal parents, so showing 259 cards
                first means showing cards about to become unpickable. The empty
                space under a picker nobody has used yet says that on its own.
              */}
              {trainee !== null && (
                <>
                  <SparkFilter
                    options={roster.sparkOptions}
                    criteria={criteria}
                    matching={shown.length}
                    total={roster.veterans.length}
                    onChange={setCriteria}
                  />
                  <div className={styles.listHead}>
                    <h2 className={styles.rubric}>Parents for {trainee.name}</h2>
                    <span className={styles.pickNote}>
                      {/* The hidden-by-filter case is the only one worth more
                          than a count: it is the one thing on this screen the
                          reader cannot see for themselves. */}
                      {picks.length === 2 && hiddenPicks > 0
                        ? `2 of 2 picked — ${
                            hiddenPicks === 2 ? 'both are' : 'one is'
                          } hidden by the filter`
                        : `${picks.length} of 2 picked`}
                    </span>
                  </div>
                  <VeteranList
                    veterans={shown}
                    pickedVeterans={pickedVeterans}
                    catalogue={catalogue}
                    picked={picks}
                    traineeCharaId={trainee.charaId}
                    onPick={pick}
                    onClearFilter={() => setCriteria([])}
                  />
                </>
              )}
            </div>

            <div className={styles.paneColumn}>
              <ComparePane
                state={paneState(traineeCardId, picks, pairLoading, pairError, lineage)}
                criteria={pairCriteria}
                sparkOptions={roster.sparkOptions}
                pickedCount={picks.length}
                view={oddsView}
                onView={setOddsView}
                compare={
                  picks.length === 2 && picks[0] && picks[1] ? (
                    <CompareToggle
                      status={compareState([picks[0], picks[1]])}
                      onAdd={() => picks[0] && picks[1] && addToCompare([picks[0], picks[1]])}
                      onOpen={() => openCompare(picks[0] && picks[1] ? [picks[0], picks[1]] : null)}
                    />
                  ) : null
                }
                onClearPicks={() => setPicks([])}
                onOpenTree={() => {
                  navigate(TREE);
                }}
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
