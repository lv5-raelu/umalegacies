import type { Position, ResolvedMember } from '@umalegacies/types';
import { percent } from '../lineage/sparks';
import type { Cell, ModelColumn } from './compare-model';
import styles from './CarrierSlots.module.css';

/**
 * WHO CARRIES IT: one spark, opened into the six ancestor slots of one column.
 *
 * Every line NAMED, because which grandparent carries it is the half of the
 * answer a looper acts on -- "C's own Oguri Cap lost it" is read here and
 * nowhere else. Stars and the per-inspiration rate only: NOT Individual
 * Affinity (design review D20). DESIGN.md requires a sum to show its addends,
 * the rate already carries IA's effect, and IA with its four links stays on
 * the breakdown.
 *
 * The slots follow the lineage's own mapping (`core/src/pair.ts`): P1 at 10
 * with its parents at 11 and 12, P2 at 20 with 21 and 22.
 */
const SLOTS: ReadonlyArray<{ position: Position; side: 0 | 1; parent: 0 | 1 | null }> = [
  { position: 10, side: 0, parent: null },
  { position: 11, side: 0, parent: 0 },
  { position: 12, side: 0, parent: 1 },
  { position: 20, side: 1, parent: null },
  { position: 21, side: 1, parent: 0 },
  { position: 22, side: 1, parent: 1 },
];

export function CarrierSlots({ column, cell }: { column: ModelColumn; cell: Cell }) {
  const loading = column.result.kind === 'loading';
  return (
    <ul className={styles.slots}>
      {SLOTS.map(({ position, side, parent }) => {
        const half = column.halves[side];
        const member: ResolvedMember | null | undefined =
          parent === null ? half?.self : half?.parents[parent];
        const carrier = cell.detail?.carriers.find((c) => c.position === position) ?? null;
        return (
          <li key={position} className={parent === null ? styles.parent : styles.grandparent}>
            <span className={styles.name}>
              {parent === null && <span className={styles.tag}>{side === 0 ? 'P1' : 'P2'} </span>}
              {member?.name ?? '—'}
            </span>
            {loading ? (
              <span className={styles.skeleton} />
            ) : carrier !== null ? (
              <span className={styles.figures}>
                <span className={styles.stars}>{carrier.stars}★</span>
                <span className={styles.rate}>{percent(carrier.perInspiration)}</span>
              </span>
            ) : column.result.kind === 'ok' ? (
              <span className={styles.none}>—</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
