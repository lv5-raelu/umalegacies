import { useEffect, useState } from 'react';
import {
  ApiError,
  explainLineage,
  fetchFixture,
  fetchFixtureNames,
} from './api/client';
import type { LineageResponse, SparkSummaryRow } from './api/types';
import { AuditTrail } from './lineage/AuditTrail';
import {
  LinkProvenance,
  MemberProvenance,
  SparkProvenance,
  TotalProvenance,
} from './lineage/Provenance';
import { sumByRulePrefix } from './lineage/explain-node';
import { resolutionText } from './lineage/resolution';
import { Tree, type Selection } from './lineage/Tree';
import styles from './App.module.css';

/**
 * M2: one lineage, rendered from the engine, where every number opens.
 *
 * The lineage is a committed fixture rather than the user's own roster, because
 * `data.json` upload is M3. Same endpoint either way: this screen POSTs an
 * ExplainRequest and renders the response, which is exactly what M3's pair
 * selection will do with a different source for the request.
 */
type State =
  | { status: 'loading' }
  | { status: 'ok'; lineage: LineageResponse; description: string }
  | { status: 'error'; error: ApiError };

/** The lineage the builder checks by hand against breeding-optimizer. */
const DEFAULT_FIXTURE = 'verify-oguri';

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [names, setNames] = useState<string[]>([]);
  const [chosen, setChosen] = useState(DEFAULT_FIXTURE);
  const [selection, setSelection] = useState<Selection>({ kind: 'total' });
  const [spark, setSpark] = useState<SparkSummaryRow | null>(null);

  useEffect(() => {
    fetchFixtureNames()
      .then((r) => setNames(r.names))
      .catch(() => setNames([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setSelection({ kind: 'total' });
    setSpark(null);

    fetchFixture(chosen)
      .then(async (fixture) => ({
        description: fixture.description,
        lineage: await explainLineage(fixture.request),
      }))
      .then(({ lineage, description }) => {
        if (!cancelled) setState({ status: 'ok', lineage, description });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          error:
            error instanceof ApiError ? error : new ApiError('UNKNOWN_ERROR', String(error)),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [chosen]);

  return (
    <main className={styles.shell}>
      <header className={styles.top}>
        <h1 className={styles.wordmark}>Uma Legacies</h1>
        {names.length > 0 && (
          <label className={styles.picker}>
            <span className={styles.pickerLabel}>LINEAGE</span>
            <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {state.status === 'loading' && <p className={styles.quiet}>Explaining…</p>}

      {state.status === 'error' && (
        <div className={styles.error}>
          <p>{state.error.message}</p>
          <p className={styles.errorCode}>{state.error.code}</p>
        </div>
      )}

      {state.status === 'ok' && (
        <Lineage
          lineage={state.lineage}
          description={state.description}
          selection={selection}
          onSelect={(next) => {
            setSelection(next);
            setSpark(null);
          }}
          spark={spark}
          onSelectSpark={setSpark}
        />
      )}
    </main>
  );
}

function Lineage({
  lineage,
  description,
  selection,
  onSelect,
  spark,
  onSelectSpark,
}: {
  lineage: LineageResponse;
  description: string;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  spark: SparkSummaryRow | null;
  onSelectSpark: (row: SparkSummaryRow | null) => void;
}) {
  // Both halves are SUMMED, never one subtracted from the total. Subtraction
  // absorbs any discrepancy into bonus: a link child that is neither base.* nor
  // bonus.* would silently inflate the headline's bonus while the panel four
  // lines below showed the true one, which is two numbers for one quantity on
  // one screen. If they ever disagree, say so instead of picking one.
  const base = sumByRulePrefix(lineage.pairTotal, 'base.');
  const bonus = sumByRulePrefix(lineage.pairTotal, 'bonus.');
  const addendsAgree = base + bonus === lineage.pairTotal.value;
  // An unresolvable trainee collapses every base term that touches it -- both
  // trainee-parent links AND all four three-way grandparent terms -- so the
  // total is not merely uncertain, it is wrong by a large margin and silently
  // so. DESIGN.md: unresolved shows an em dash and names itself, never a
  // number, and never a rank verdict derived from one.
  const traineeUnresolved = lineage.trainee.resolution.ok === false;

  return (
    <>
      <p className={styles.lede}>{description}</p>

      <h2 className={styles.rubric}>Decision surface</h2>
      {/* Exactly one number on this screen is large. */}
      <div className={styles.headline}>
        <div>
          <div className={styles.total}>
            {traineeUnresolved ? '—' : lineage.pairTotal.value}
          </div>
          {/* An aggregate prints its addends beneath it, permanently. */}
          <div className={styles.addends}>
            {traineeUnresolved ? (
              <span className={styles.disagree}>{resolutionText(lineage.trainee.resolution)}</span>
            ) : addendsAgree ? (
              `${base} base + ${bonus} bonus`
            ) : (
              <span className={styles.disagree}>
                addends disagree: {base} base + {bonus} bonus ≠ {lineage.pairTotal.value}
              </span>
            )}
          </div>
        </div>
        <div className={styles.who}>{lineage.trainee.name} · pair total</div>
        {/* No verdict from a total that could not be computed. */}
        {!traineeUnresolved && (
          <div className={styles.rank}>
            <div className={styles.rankGlyph}>
              {'◎〇△'[3 - lineage.relationRank.value] ?? '·'} rank {lineage.relationRank.value}
            </div>
            <div className={styles.rankBounds}>
              {lineage.rankBounds.min}
              {lineage.rankBounds.max >= 9999 ? '+' : `–${lineage.rankBounds.max}`}
            </div>
          </div>
        )}
      </div>

      <Tree lineage={lineage} selection={selection} onSelect={onSelect} />

      {spark ? (
        <SparkProvenance row={spark} />
      ) : selection.kind === 'link' ? (
        <LinkProvenance link={selection.node} />
      ) : selection.kind === 'member' && selection.position !== 'T' ? (
        <MemberProvenanceOrEmpty lineage={lineage} position={selection.position} />
      ) : (
        <TotalProvenance lineage={lineage} />
      )}

      <h2 className={styles.rubric}>Audit trail — every spark this lineage can pass down</h2>
      <AuditTrail
        sparks={lineage.sparks}
        selectedGroupId={spark?.groupId ?? null}
        onSelect={(row) => onSelectSpark(row.groupId === spark?.groupId ? null : row)}
      />

      <footer className={styles.footer}>
        master extract <code>{lineage.masterHash.slice(0, 12)}</code>
      </footer>
    </>
  );
}

function MemberProvenanceOrEmpty({
  lineage,
  position,
}: {
  lineage: LineageResponse;
  position: number;
}) {
  const identity = lineage.ancestors[position];
  if (!identity) return <TotalProvenance lineage={lineage} />;
  return (
    <MemberProvenance identity={identity} affinity={lineage.individualAffinity[position]} />
  );
}
