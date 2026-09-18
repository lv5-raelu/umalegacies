import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExplainPairRequest,
  LineageResponse,
  RosterResolveResponse,
  RosterVeteranInput,
  SparkCriterion,
  TraineeOption,
  VeteranPackage,
} from '@umalegacies/types';
import {
  ApiError,
  explainPair,
  fetchMasterMeta,
  fetchTrainees,
  resolveRoster,
} from './api/client';
import { TreePage } from './lineage/TreePage';
import { ComparePane } from './roster/ComparePane';
import { DropZone } from './roster/DropZone';
import { SparkFilter } from './roster/SparkFilter';
import { TraineePicker } from './roster/TraineePicker';
import { catalogueOf } from './roster/catalogue';
import { VeteranList } from './roster/VeteranList';
import { filterVeterans, pickBlock } from './roster/filter';
import { SaveError, slimSave, type SkippedEntry } from './roster/save';
import { CACHE_VERSION, explainDiscard, inspectCache } from './roster/cache-policy';
import { clearRoster, readRoster, writeRoster } from './roster/cache';
import styles from './App.module.css';

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
  const [criteria, setCriteria] = useState<SparkCriterion[]>([]);
  /** Request-array indices, oldest first, at most two. */
  const [picks, setPicks] = useState<number[]>([]);
  const [lineage, setLineage] = useState<LineageResponse | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [onTreePage, setOnTreePage] = useState(() => location.hash === '#tree');
  const panes = useRef<HTMLDivElement>(null);
  const [masterChanged, setMasterChanged] = useState(false);
  /**
   * True until the stored roster has been looked for.
   *
   * Without it the drop zone renders for one frame before a restore replaces
   * it, which reads as the app forgetting and then remembering.
   */
  const [restoring, setRestoring] = useState(true);
  // The extract every number on screen was computed from. Echoed on the next
  // request so a rebuilt extract is caught rather than silently mixed in.
  const seenMasterHash = useRef<string | undefined>(undefined);

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
   */
  useEffect(() => {
    const grid = panes.current;
    if (!grid) return;
    let last = -1;
    const measure = (): void => {
      const top = Math.round(grid.getBoundingClientRect().top + window.scrollY);
      // A value taller than the viewport would leave the pane with negative
      // height and clip it to nothing. Nothing legitimate produces one, so
      // refuse it rather than render a sliver: whatever measured wrong, the
      // last good value is a better answer than an empty pane.
      if (top < 0 || top > window.innerHeight) return;
      if (top === last) return;
      last = top;
      grid.style.setProperty('--pane-top', `${top}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      removeEventListener('resize', measure);
    };
  // The ResizeObserver catches every other layout change; the dep is only for
  // the first measure after the roster replaces the drop zone.
  }, [roster]);

  useEffect(() => {
    const sync = (): void => setOnTreePage(location.hash === '#tree');
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);

  /**
   * #tree IS ONLY MEANINGFUL WITH A LINEAGE BEHIND IT, and this is the one rule
   * that says so -- for every way of arriving, not just the one that was
   * reported.
   *
   * The roster lives only in memory, so a reload, a bookmark, a pasted link or a
   * hand-typed `#tree` all reach a hash with nothing to draw. Left alone the
   * flag sat armed and INVISIBLE: the drop zone and the roster looked completely
   * normal, and then the moment a second parent was picked the app jumped
   * straight to the tree, skipping the compare pane the whole screen exists for.
   *
   * Guarding at mount only fixed the reload; typing the hash afterwards fires a
   * hashchange and armed it again. Reacting to the STATE rather than to any one
   * route in covers all of them, including a pick being invalidated while the
   * tree is open -- switching the trainee to one of the picked umas nulls the
   * lineage, and the tree has nothing left to show.
   *
   * replaceState rather than assigning location.hash: no extra history entry to
   * go "back" into, and no leftover bare '#' in the address bar.
   */
  useEffect(() => {
    if (!onTreePage || lineage !== null) return;
    history.replaceState(null, '', location.pathname + location.search);
    setOnTreePage(false);
  }, [onTreePage, lineage]);

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
      const stored = await readRoster();
      const optimistic = inspectCache(stored, null);
      if (cancelled) return;

      if (!optimistic.use) {
        // A version bump or a half-written record leaves rubbish behind; take
        // the chance to remove it rather than re-reading it on every visit.
        if (optimistic.reason !== 'absent') void clearRoster();
        setRestoring(false);
        return;
      }

      const { record } = optimistic;
      setSave({ fileName: record.fileName, veterans: record.veterans, skipped: record.skipped });
      setRoster(record.resolved);
      setTrainees(record.trainees);
      seenMasterHash.current = record.masterHash;
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
      setSave(null);
      setRoster(null);
      setTrainees([]);
      setPicks([]);
      setLineage(null);
      seenMasterHash.current = undefined;
      setSaveError(explainDiscard(checked));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Forget the stored roster and return to the drop zone. */
  const forget = useCallback(() => {
    void clearRoster();
    setSave(null);
    setRoster(null);
    setTrainees([]);
    setTraineeCardId(null);
    setCriteria([]);
    setPicks([]);
    setLineage(null);
    setSaveError(null);
    seenMasterHash.current = undefined;
  }, []);

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
      setLineage(null);

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
  }, []);

  const shown = useMemo(() => {
    if (!roster) return [];
    // Sorted HERE, not on the server: `index` joins a row back to the slimmed
    // package the browser still holds, so the response stays in request order.
    // A PICK NEVER MOVES A CARD. Selecting is not a sort key: the list holds
    // still so the card you just clicked stays under the cursor and the one you
    // were about to compare it against stays where you last saw it. An earlier
    // cut pinned picks to the top and it made the list jump under the pointer.
    return filterVeterans(roster.veterans, criteria).sort(
      (a, b) => b.score - a.score || a.self.name.localeCompare(b.self.name),
    );
  }, [roster, criteria]);

  const trainee = useMemo(
    () => trainees.find((t) => t.cardId === traineeCardId) ?? null,
    [trainees, traineeCardId],
  );

  /**
   * The picked veterans themselves. Kept separate from `shown` because a filter
   * can hide a pick, and the rules that depend on what is already picked --
   * two-is-the-limit, and no two parents of the same uma -- must hold whether or
   * not the picked card is currently on screen.
   */
  const pickedVeterans = useMemo(
    () =>
      picks
        .map((index) => roster?.veterans[index])
        .filter((v): v is NonNullable<typeof v> => v !== undefined),
    [roster, picks],
  );

  /**
   * Picks the filter is currently hiding. Narrow on a spark neither pick
   * carries and both vanish, which makes "unselect one to swap it" advice the
   * reader cannot act on.
   */
  const hiddenPicks = useMemo(
    () => picks.filter((index) => !shown.some((v) => v.index === index)).length,
    [picks, shown],
  );

  const catalogue = useMemo(
    () => catalogueOf(roster?.sparkOptions ?? []),
    [roster],
  );

  const pick = useCallback(
    (index: number) => {
      const veteran = roster?.veterans[index];
      // The rule lives in one place and is enforced here too, not only by the
      // card refusing its own click: a keyboard or a stale render must not be
      // able to compose a pair the game does not allow.
      if (veteran && pickBlock(veteran, pickedVeterans, trainee?.charaId ?? null) !== null)
        return;
      setPicks((current) => {
        if (current.includes(index)) return current.filter((i) => i !== index);
        // TWO IS THE LIMIT, and a third click does nothing rather than
        // silently evicting a pick. Swapping a parent is a deliberate two-step:
        // unselect the one you are replacing, then select its replacement.
        // Auto-replacing the older pick guessed at which of the two the user
        // meant to keep, and it guessed invisibly.
        if (current.length >= 2) return current;
        return [...current, index];
      });
    },
    [roster, pickedVeterans, trainee],
  );

  // Changing the trainee can invalidate a pick that was legal a moment ago: you
  // are not your own parent. Drop those rather than leave the pair in a state
  // the rules forbid and the pick handler would refuse to recreate.
  useEffect(() => {
    if (!roster || trainee === null) return;
    setPicks((current) =>
      current.filter((index) => roster.veterans[index]?.self.charaId !== trainee.charaId),
    );
  }, [roster, trainee]);

  // Explain the pair whenever the trainee or either pick changes.
  useEffect(() => {
    if (!save || !roster || trainee === null || picks.length !== 2) {
      setLineage(null);
      return;
    }

    const request: ExplainPairRequest = {
      traineeCharaId: trainee.charaId,
      traineeCardId: trainee.cardId,
      veteranA: packageAt(save.veterans, picks[0] as number),
      veteranB: packageAt(save.veterans, picks[1] as number),
    };

    let cancelled = false;
    setPairLoading(true);
    setPairError(null);
    explainPair(request, seenMasterHash.current)
      .then((result) => {
        if (cancelled) return;
        seenMasterHash.current = result.masterHash;
        setLineage(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.code === 'STALE_MASTER_HASH') {
          seenMasterHash.current = undefined;
          setMasterChanged(true);
        }
        setPairError(error instanceof ApiError ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setPairLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [save, roster, trainee, picks]);

  if (onTreePage && lineage) {
    return (
      <TreePage
        lineage={lineage}
        onBack={() => {
          location.hash = '';
        }}
      />
    );
  }

  return (
    <main className={`${styles.shell} ${roster ? styles.wide : ''}`}>
      <header className={styles.top}>
        <h1 className={styles.wordmark}>Uma Legacies</h1>
      </header>

      {masterChanged && (
        <p className={styles.notice}>
          The master data changed while this page was open. Anything you noted earlier came
          from a different extract.
        </p>
      )}

      {!roster && (
        <p className={styles.lede}>
          Your trained characters, with the exact affinity the game will not show you and the
          odds each spark has of being passed down.
        </p>
      )}

      <DropZone
        state={parsing || restoring ? 'parsing' : roster ? 'loaded' : 'empty'}
        fileName={save?.fileName ?? null}
        veteranCount={roster?.veterans.length ?? 0}
        error={saveError}
        onFile={(file) => {
          void loadFile(file);
        }}
        onForget={forget}
      />

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
                      {picks.length === 2
                        ? hiddenPicks > 0
                          ? `2 of 2 picked — ${
                              hiddenPicks === 2 ? 'both are' : 'one is'
                            } hidden by the filter`
                          : '2 of 2 picked — unselect one to swap it'
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
                criteria={criteria}
                sparkOptions={roster.sparkOptions}
                pickedCount={picks.length}
                onClearPicks={() => setPicks([])}
                onOpenTree={() => {
                  location.hash = '#tree';
                }}
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/**
 * The slimmed package the browser kept, by request index.
 *
 * `ResolvedVeteran.index` is the position in the array that was SENT, which is
 * why the API preserves request order. The display list is sorted separately.
 */
function packageAt(veterans: readonly RosterVeteranInput[], index: number): VeteranPackage {
  const veteran = veterans[index];
  if (!veteran) throw new Error(`no veteran at index ${index}`);
  return {
    self: veteran.self,
    parents: [veteran.parents[0], veteran.parents[1]],
  };
}

function paneState(
  traineeCardId: number | null,
  picks: readonly number[],
  loading: boolean,
  error: string | null,
  lineage: LineageResponse | null,
): Parameters<typeof ComparePane>[0]['state'] {
  if (traineeCardId === null) return { kind: 'need-trainee' };
  if (picks.length !== 2) return { kind: 'need-picks', picked: picks.length };
  if (error) return { kind: 'error', message: error };
  if (loading || !lineage) return { kind: 'loading' };
  return { kind: 'ok', lineage };
}
