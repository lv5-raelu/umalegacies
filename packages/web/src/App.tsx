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
  const [criterion, setCriterion] = useState<SparkCriterion | null>(null);
  /** Request-array indices, oldest first, at most two. */
  const [picks, setPicks] = useState<number[]>([]);
  const [lineage, setLineage] = useState<LineageResponse | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [onTreePage, setOnTreePage] = useState(false);
  const panes = useRef<HTMLDivElement>(null);
  const [masterChanged, setMasterChanged] = useState(false);
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
    // A FRESH LOAD CAN NEVER BE ON THE TREE PAGE. The roster lives only in
    // memory, so there is no lineage to draw one from -- and landing on /#tree
    // from a reload, a bookmark or a pasted link used to leave the flag armed
    // and invisible: the drop zone and the roster looked normal, and then the
    // moment a second parent was picked the app jumped straight to the tree,
    // skipping the compare pane the whole screen exists for.
    //
    // replaceState rather than assigning location.hash: no extra history entry
    // to go "back" into, and no leftover bare '#' in the address bar.
    if (location.hash === '#tree') {
      history.replaceState(null, '', location.pathname + location.search);
    }
    const sync = (): void => setOnTreePage(location.hash === '#tree');
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
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
    return filterVeterans(roster.veterans, criterion).sort(
      (a, b) => b.score - a.score || a.self.name.localeCompare(b.self.name),
    );
  }, [roster, criterion]);

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
        state={parsing ? 'parsing' : roster ? 'loaded' : 'empty'}
        fileName={save?.fileName ?? null}
        veteranCount={roster?.veterans.length ?? 0}
        error={saveError}
        onFile={(file) => {
          void loadFile(file);
        }}
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
                    criterion={criterion}
                    matching={shown.length}
                    total={roster.veterans.length}
                    onChange={setCriterion}
                  />
                  <div className={styles.listHead}>
                    <h2 className={styles.rubric}>Parents for {trainee.name}</h2>
                    <span className={styles.pickNote}>
                      {picks.length === 2
                        ? '2 of 2 picked — unselect one to swap it'
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
                    onClearFilter={() => setCriterion(null)}
                  />
                </>
              )}
            </div>

            <div className={styles.paneColumn}>
              <ComparePane
                state={paneState(traineeCardId, picks, pairLoading, pairError, lineage)}
                criterion={criterion}
                onOpenTree={() => {
                  location.hash = '#tree';
                }}
              />
            </div>
          </div>

          <footer className={styles.footer}>
            master extract <code>{roster.masterHash.slice(0, 12)}</code>
          </footer>
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
