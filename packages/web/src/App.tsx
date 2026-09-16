import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExplainPairRequest,
  LineageResponse,
  ResolvedVeteran,
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
import { catalogueOf, VeteranList } from './roster/VeteranList';
import { filterVeterans } from './roster/filter';
import { SaveError, slimSave } from './roster/save';
import styles from './App.module.css';

/**
 * M3: your own roster, on screen, with two veterans compared.
 *
 * Upload -> pick a trainee -> pick two veterans -> the odds, and the tree behind
 * them on its own page. The save is read in the browser and slimmed to three
 * public fields per uma before anything is sent; see roster/save.ts, which is
 * where the privacy promise actually lives.
 */
type Save = { fileName: string; veterans: RosterVeteranInput[] };

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
  const [onTreePage, setOnTreePage] = useState(() => location.hash === '#tree');
  const [masterChanged, setMasterChanged] = useState(false);
  // The extract every number on screen was computed from. Echoed on the next
  // request so a rebuilt extract is caught rather than silently mixed in.
  const seenMasterHash = useRef<string | undefined>(undefined);

  useEffect(() => {
    const sync = (): void => setOnTreePage(location.hash === '#tree');
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    setParsing(true);
    setSaveError(null);
    try {
      const veterans = slimSave(await file.text());
      // Everything appears together after parsing: the picker and the list are
      // absent until there is something for them to show.
      const [resolved, traineeList] = await Promise.all([
        resolveRoster(veterans, seenMasterHash.current),
        fetchTrainees(),
      ]);
      seenMasterHash.current = resolved.masterHash;
      setSave({ fileName: file.name, veterans });
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
    const matching = filterVeterans(roster.veterans, criterion).sort(
      (a, b) => b.score - a.score || a.self.name.localeCompare(b.self.name),
    );
    // PICKED ROWS ARE PINNED TO THE TOP, whether or not they match.
    //
    // Narrowing the filter after picking one veteran used to hide it, which left
    // the compare pane naming a parent that was nowhere on screen -- and a third
    // pick replaces the OLDER of the two, which was exactly the invisible one.
    // Comparing is the job, so the two things being compared stay visible and
    // adjacent. The filter's own count still reports the match, not this list.
    const pinned = picks
      .map((index) => roster.veterans[index])
      .filter((v): v is ResolvedVeteran => v !== undefined);
    const pinnedIds = new Set(pinned.map((v) => v.index));
    return [...pinned, ...matching.filter((v) => !pinnedIds.has(v.index))];
  }, [roster, criterion, picks]);

  const catalogue = useMemo(
    () => catalogueOf(roster?.sparkOptions ?? []),
    [roster],
  );

  const pick = useCallback((index: number) => {
    setPicks((current) => {
      if (current.includes(index)) return current.filter((i) => i !== index);
      // A third pick replaces the OLDER of the two, which is what makes
      // comparing feel like swapping one side rather than starting over.
      return current.length < 2 ? [...current, index] : [current[1] as number, index];
    });
  }, []);

  // Explain the pair whenever the trainee or either pick changes.
  useEffect(() => {
    if (!save || !roster || traineeCardId === null || picks.length !== 2) {
      setLineage(null);
      return;
    }
    const trainee = trainees.find((t) => t.cardId === traineeCardId);
    if (!trainee) return;

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
  }, [save, roster, trainees, traineeCardId, picks]);

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
          {roster.unresolvedCount > 0 && (
            <p className={styles.notice}>
              {roster.unresolvedCount} veteran{roster.unresolvedCount === 1 ? '' : 's'} could not
              be identified, most likely because a game patch added an uma since the master
              extract was built. They are greyed below; everything else is usable. Rebuild the
              extract to fix them.
            </p>
          )}

          <div className={styles.panes}>
            <div>
              <TraineePicker
                trainees={trainees}
                chosen={traineeCardId}
                onChoose={setTraineeCardId}
              />
              <SparkFilter
                options={roster.sparkOptions}
                criterion={criterion}
                matching={shown.length}
                total={roster.veterans.length}
                onChange={setCriterion}
              />
              <div className={styles.listHead}>
                <h2 className={styles.rubric}>Your veterans</h2>
                <span className={styles.pickNote}>
                  {picks.length === 2
                    ? '2 of 2 picked — a third replaces the older one'
                    : `${picks.length} of 2 picked`}
                </span>
              </div>
              <VeteranList
                veterans={shown}
                catalogue={catalogue}
                picked={picks}
                onPick={pick}
                onClearFilter={() => setCriterion(null)}
              />
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

/** Kept so the type is referenced where it reads naturally. */
export type { ResolvedVeteran };
