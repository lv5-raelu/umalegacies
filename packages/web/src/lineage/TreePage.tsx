import { useState } from 'react';
import type { ReactNode } from 'react';
import type { LineageResponse, SparkCriterion, SparkSummaryRow } from '@umalegacies/types';
import { AuditTrail } from './AuditTrail';
import {
  LinkProvenance,
  MemberProvenance,
  SparkProvenance,
  TotalProvenance,
} from './Provenance';
import { pairTotalOf, rankGlyph } from './pair-total';
import { resolutionText } from './resolution';
import { Tree, type Selection } from './Tree';
import styles from '../App.module.css';

/**
 * The lineage breakdown, on its own page.
 *
 * The tree is PROVENANCE, not a compare surface, and it lost the fight for
 * horizontal space on the roster screen: it needs 848px at its designed size,
 * and the 380px compare pane would force 120px cards, which cannot hold a
 * 17-character name plus four spark lines. So it gets the full single column,
 * reached by a button, with the browser's own back button to return.
 */
export function TreePage({
  lineage,
  criteria,
  nav,
}: {
  lineage: LineageResponse;
  /** Only to light up the sparks the reader asked for. Nothing here filters. */
  criteria: readonly SparkCriterion[];
  /** Rendered by `App`; see the note on `PairSearch`. */
  nav: ReactNode;
}) {
  const [selection, setSelection] = useState<Selection>({ kind: 'total' });
  // The sparks the reader filtered for, so the audit trail can light them up.
  // A Set because the table asks this once per row, ~50 times.
  const askedGroupIds = new Set(criteria.map((c) => c.groupId));
  const [spark, setSpark] = useState<SparkSummaryRow | null>(null);

  const { total, base, bonus, addendsAgree, traineeUnresolved } = pairTotalOf(lineage);

  return (
    <main className={styles.shell}>
      <header className={styles.top}>
        <h1 className={styles.wordmark}>Uma Legacies</h1>
        {nav}
      </header>

      <h2 className={styles.rubric}>Decision surface</h2>
      {/* Exactly one number on this screen is large. */}
      <div className={styles.headline}>
        <div>
          <div className={styles.total}>
            {traineeUnresolved ? '—' : total}
          </div>
          {/* An aggregate prints its addends beneath it, permanently. */}
          <div className={styles.addends}>
            {traineeUnresolved ? (
              <span className={styles.disagree}>{resolutionText(lineage.trainee.resolution)}</span>
            ) : addendsAgree ? (
              `${base} base + ${bonus} bonus`
            ) : (
              <span className={styles.disagree}>
                addends disagree: {base} base + {bonus} bonus ≠ {total}
              </span>
            )}
          </div>
        </div>
        <div className={styles.who}>{lineage.trainee.name} · pair total</div>
        {/* No verdict from a total that could not be computed. */}
        {!traineeUnresolved && (
          <div className={styles.rank}>
            <div className={styles.rankGlyph}>
              {rankGlyph(lineage.relationRank.value)} rank {lineage.relationRank.value}
            </div>
            <div className={styles.rankBounds}>
              {lineage.rankBounds.min}
              {lineage.rankBounds.max >= 9999 ? '+' : `–${lineage.rankBounds.max}`}
            </div>
          </div>
        )}
      </div>

      <Tree
        lineage={lineage}
        selection={selection}
        onSelect={(next) => {
          setSelection(next);
          setSpark(null);
        }}
      />

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
        asked={askedGroupIds}
        sparks={lineage.sparks}
        selectedGroupId={spark?.groupId ?? null}
        onSelect={(row) => setSpark(row.groupId === spark?.groupId ? null : row)}
      />
    </main>
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
