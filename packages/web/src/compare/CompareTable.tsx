import { Fragment, type Ref } from 'react';
import { VIEW_LABEL, type OddsView } from '../lineage/odds';
import { SPARK_COLOR, isWhite } from '../lineage/sparks';
import type { Catalogue } from '../roster/catalogue';
import { SEARCH, followLink } from '../route';
import { CarrierSlots } from './CarrierSlots';
import type { Cell, CompareModel, ModelColumn, Row, TogetherCell } from './compare-model';
import { PairHeader, PairStrip } from './PairHeader';
import styles from './CompareTable.module.css';

/** One slot of the page, left to right: a live pair, or one removed this visit. */
export type Slot =
  | { kind: 'live'; letter: string; column: ModelColumn; key: string }
  | { kind: 'removed'; letter: string; onUndo: () => void };

/**
 * THE RULED TABLE. Renders the model; decides nothing.
 *
 * A real <table>, so a screen reader announces "Pair B, Uma Stan" moving
 * through the cells: each pair's header is a `th scope="col"` and each spark
 * name a `th scope="row"` (design review 6B). Cells are read as printed.
 *
 * Columns are never re-sorted and nothing in a cell is marked: the model never
 * compares one column with another except to hide a row, never to mark one.
 */
export function CompareTable({
  traineeName,
  slots,
  model,
  catalogue,
  view,
  open,
  rowsReady,
  showAddSlot,
  boxRef,
  onToggle,
  onRemove,
  onShowBreakdown,
  onRetry,
  onShowAll,
}: {
  traineeName: string;
  slots: readonly Slot[];
  model: CompareModel;
  catalogue: Catalogue;
  view: OddsView;
  open: ReadonlySet<number>;
  /** False until the game data says which heading each white skill goes under. */
  rowsReady: boolean;
  showAddSlot: boolean;
  boxRef: Ref<HTMLDivElement>;
  onToggle: (groupId: number) => void;
  onRemove: (slot: number) => void;
  onShowBreakdown: (column: ModelColumn) => void;
  onRetry: (column: ModelColumn) => void;
  onShowAll: () => void;
}) {
  const live = slots.flatMap((slot, i) => (slot.kind === 'live' ? [{ slot, i }] : []));
  const modelIndex = (slotIndex: number): number =>
    live.findIndex(({ i }) => i === slotIndex);
  const width = slots.length + (showAddSlot ? 1 : 0) + 1;

  /** One cell per slot, plus the add slot's empty body column. */
  const across = (render: (column: ModelColumn, index: number) => React.ReactNode, className?: string) => (
    <>
      {slots.map((slot, i) =>
        slot.kind === 'live' ? (
          <td key={slot.key} className={className}>
            {render(slot.column, modelIndex(i))}
          </td>
        ) : (
          <td key={`removed-${i}`} className={styles.removedBody} />
        ),
      )}
      {showAddSlot && <td className={styles.addBody} />}
    </>
  );

  const anyStatus = live.some(({ slot }) => slot.kind === 'live' && slot.column.result.kind !== 'ok');
  const nothing = model.filtered.length === 0 && model.together.length === 0 && model.groups.length === 0;

  return (
    <div className={styles.box} ref={boxRef}>
      <table className={styles.table} style={{ ['--pairs' as string]: slots.length }}>
        <caption className={styles.caption}>Compare pairs for {traineeName}</caption>
        <colgroup>
          <col className={styles.nameCol} />
          {slots.map((slot, i) => (
            <col key={i} className={slot.kind === 'live' ? styles.pairCol : styles.removedCol} />
          ))}
          {showAddSlot && <col className={styles.addCol} />}
        </colgroup>

        <thead>
          <tr className={styles.identityRow}>
            <td className={styles.corner}>
              <span className={styles.legend}>★ · carriers of 6 · activate · (inherit, career)</span>
              <span className={styles.legendView}>{VIEW_LABEL[view]}</span>
            </td>
            {slots.map((slot, i) =>
              slot.kind === 'live' ? (
                <th
                  key={slot.key}
                  scope="col"
                  className={styles.pairHead}
                  data-pair={slot.key}
                  tabIndex={-1}
                  aria-label={`Pair ${slot.letter}`}
                >
                  <PairHeader
                    column={slot.column}
                    shared={model.sharedHalves[modelIndex(i)] ?? [null, null]}
                    catalogue={catalogue}
                    onRemove={() => onRemove(i)}
                    onShowBreakdown={
                      slot.column.result.kind === 'ok' ? () => onShowBreakdown(slot.column) : null
                    }
                  />
                </th>
              ) : (
                <th key={`removed-${i}`} scope="col" className={styles.removedHead}>
                  <span className={styles.removedNote}>
                    Removed ·{' '}
                    <button type="button" className={styles.undo} onClick={slot.onUndo}>
                      undo
                    </button>
                  </span>
                </th>
              ),
            )}
            {showAddSlot && (
              <th scope="col" className={styles.addHead}>
                <a className={styles.add} href={SEARCH} onClick={(e) => followLink(e, SEARCH)}>
                  Add a pair
                  <span className={styles.addFrom}>
                    from Optimize Parents, a pair&rsquo;s detail, or the roster
                  </span>
                </a>
              </th>
            )}
          </tr>
          {/* Below 600px this pins instead of the identity row above. */}
          <tr className={styles.stripRow} aria-hidden="true">
            <td className={styles.corner}>
              <span className={styles.legend}>★ · of 6 · act · (inh)</span>
            </td>
            {slots.map((slot, i) => (
              <td key={i} className={styles.stripCell}>
                {slot.kind === 'live' ? <PairStrip column={slot.column} /> : null}
              </td>
            ))}
            {showAddSlot && <td className={styles.stripCell} />}
          </tr>
        </thead>

        <tbody>
          {anyStatus && (
            <tr className={styles.status}>
              <th scope="row" className={styles.name} />
              {across((column) => <Status column={column} onRetry={() => onRetry(column)} />)}
            </tr>
          )}

          {rowsReady && (model.together.length > 0 || model.filtered.length > 0) && (
            <tr className={styles.band}>
              <th scope="rowgroup" colSpan={width}>
                Your sparks ({model.filtered.length})
              </th>
            </tr>
          )}
          {rowsReady &&
            model.together.map((row) => (
              <tr key={row.label} className={styles.row}>
                <th scope="row" className={styles.name}>
                  <span className={styles.label}>{row.label}</span>
                </th>
                {across((column, index) => (
                  <Together cell={row.cells[index] ?? null} loading={column.result.kind === 'loading'} />
                ), styles.figures)}
              </tr>
            ))}
          {rowsReady &&
            model.filtered.map((row) => (
              <SparkRow key={row.groupId} row={row} open={open.has(row.groupId)} onToggle={onToggle} across={across} />
            ))}

          {rowsReady &&
            model.groups.map((group) => (
              <Fragment key={group.key}>
                <tr className={styles.band}>
                  <th scope="rowgroup" colSpan={width}>
                    {group.label} ({group.rows.length})
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <SparkRow
                    key={row.groupId}
                    row={row}
                    open={open.has(row.groupId)}
                    onToggle={onToggle}
                    across={across}
                  />
                ))}
              </Fragment>
            ))}

          {rowsReady && nothing && (
            <tr>
              <td colSpan={width} className={styles.nothing}>
                No sparks differ between these pairs ·{' '}
                <button type="button" className={styles.link} onClick={onShowAll}>
                  show all
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

type Across = (
  render: (column: ModelColumn, index: number) => React.ReactNode,
  className?: string,
) => React.ReactNode;

function SparkRow({
  row,
  open,
  onToggle,
  across,
}: {
  row: Row;
  open: boolean;
  onToggle: (groupId: number) => void;
  across: Across;
}) {
  const expansion = `compare-exp-${row.groupId}`;
  return (
    <>
      <tr className={open ? `${styles.row} ${styles.rowOpen}` : styles.row}>
        <th scope="row" className={styles.name}>
          <span
            className={styles.tick}
            style={
              isWhite(row.kind)
                ? { boxShadow: `inset 0 0 0 1px ${SPARK_COLOR[row.kind]}` }
                : { background: SPARK_COLOR[row.kind] }
            }
          />
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={expansion}
            onClick={() => onToggle(row.groupId)}
          >
            <span className={styles.caret} aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
            {row.name}
          </button>
        </th>
        {across((column, index) => <Figures cell={row.cells[index]} column={column} />, styles.figures)}
      </tr>
      {open && (
        <tr id={expansion} className={styles.expansion}>
          <th scope="row" className={styles.expansionLabel}>
            who carries it · stars · per inspiration
          </th>
          {across((column, index) => {
            const cell = row.cells[index];
            return cell ? <CarrierSlots column={column} cell={cell} /> : null;
          })}
        </tr>
      )}
    </>
  );
}

/**
 * "5★ 2/6 43% (11%)", right-aligned in fixed `ch` slots so a column of them
 * aligns. "—" means one thing: this pair does not carry it.
 */
function Figures({ cell, column }: { cell: Cell | undefined; column: ModelColumn }) {
  if (!cell) return null;
  if (!cell.carried) return <span className={styles.dash}>—</span>;
  const pending = column.result.kind === 'loading';
  const slot = (value: string | null, className: string | undefined) =>
    value === null ? (
      pending ? <span className={`${className} ${styles.skeleton}`} /> : <span className={className} />
    ) : (
      <span className={className}>{value}</span>
    );
  return (
    <span className={styles.cell} title={cell.title ?? undefined}>
      <span className={styles.stars}>{cell.stars}</span>
      <span className={styles.carriers}>{cell.carriers}</span>
      {slot(cell.act, styles.act)}
      {slot(cell.inh, styles.inh)}
    </span>
  );
}

function Together({ cell, loading }: { cell: TogetherCell | null; loading: boolean }) {
  if (cell === null) return loading ? <span className={`${styles.togetherValue} ${styles.skeleton}`} /> : null;
  return (
    <span className={styles.together}>
      <span className={styles.togetherValue}>{cell.value}</span>
      <span className={styles.scope}>{cell.scope}</span>
    </span>
  );
}

/** What a column without numbers is doing, in words, in its first body cell. */
function Status({ column, onRetry }: { column: ModelColumn; onRetry: () => void }) {
  switch (column.result.kind) {
    case 'loading':
      return <span className={styles.explaining}>Explaining…</span>;
    case 'blocked':
      return <span className={styles.blocked}>{column.result.reason}</span>;
    case 'error':
      // Muted, NOT red: inside a table red means unresolved.
      return (
        <span className={styles.failed}>
          {column.result.message}{' '}
          <button type="button" className={styles.link} onClick={onRetry}>
            retry
          </button>
        </span>
      );
    default:
      return null;
  }
}
