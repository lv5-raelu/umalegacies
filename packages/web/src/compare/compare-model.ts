import type {
  ResolvedVeteran,
  RosterSparkOption,
  SkillTiming,
  SparkCriterion,
  SparkKind,
  SparkSummaryRow,
} from '@umalegacies/types';
import { countsTowardOdds, pairSparks, type PairSpark } from '@umalegacies/core';
import {
  type OddsView,
  cellInherit,
  goldGroupsOf,
  jointFigures,
  sparkExplanation,
  valueFor,
} from '../lineage/odds';
import {
  SPARK_GROUP_ORDER,
  groupKeyOf,
  groupLabelOf,
  percent,
  percentJoint,
  type SparkGroupKey,
} from '../lineage/sparks';
import type { ColumnResult } from './run-columns';
import { samePick, type TrayPair } from './tray';

/**
 * THE COMPARE TABLE, AS DATA. Pure: no async, no React, every rule tested.
 *
 *   rows      union of every pair's sparks, read off the ROSTER packages
 *             (+ the filtered sparks, carried or not)
 *   order     filtered first, in the order asked; then SPARK_GROUP_ORDER, then name
 *   cells     stars and carriers from the roster, at once and for every column;
 *             activation and inherit from the column's lineage, once it is `ok`
 *   identical the PRINTED cells match in every `ok` column -- applied only with
 *             two or more `ok` columns and none still loading
 *   hidden    one ordered rule, `hiddenBy`, so each hidden row has one reason
 *
 * WHY THE ROWS COME FROM THE ROSTER, not from finished columns: a trainee
 * switch puts every column back to loading, and rows built from lineages would
 * blank the table and close every open row each time. Stars and carriers do
 * not depend on the trainee -- they are the six ancestors' -- so they print the
 * moment a pair is added, and `pairSparks` is held to the lineage's own figures
 * by a parity test in the API. Only activation, inherit and the together
 * figures wait for a lineage.
 *
 * NO EMPHASIS IS COMPUTED HERE, by design. Nothing in this model compares one
 * column's value with another's except to decide whether a row is identical,
 * which only ever HIDES a row; it never marks one.
 */

export interface ModelColumn {
  /** The slot position, A-D. A position, never an identity. */
  letter: string;
  pair: TrayPair;
  /** From the roster. Null for a half the roster no longer has. */
  halves: readonly [ResolvedVeteran | null, ResolvedVeteran | null];
  result: ColumnResult;
}

export interface ModelInput {
  columns: readonly ModelColumn[];
  criteria: readonly SparkCriterion[];
  sparkOptions: readonly RosterSparkOption[];
  view: OddsView;
  /** When a white skill fires, from the game data; see `MasterData.skillTiming`. */
  timingOf: (groupId: number) => SkillTiming | null;
  hideIdentical: boolean;
  onlyFiltered: boolean;
  /** Expanded rows, by group. Never hidden. */
  open: ReadonlySet<number>;
}

export interface Cell {
  /** Carried by this pair at all. False prints ONE em dash for the whole cell. */
  carried: boolean;
  /** "5★"; empty when not carried. */
  stars: string;
  /** "2/6"; empty when not carried. */
  carriers: string;
  /**
   * Activation in the selected window. NULL WHILE THE COLUMN HAS NO NUMBERS --
   * loading, blocked or failed -- which the table draws as a skeleton or a
   * blank, never as an old figure.
   */
  act: string | null;
  /**
   * "(11%)" for a white skill. EMPTY where the mechanic does not reach (blue,
   * pink, green, race, scenario): an empty slot, never a dash, because "—" says
   * "not carried" and nothing else. Null while the column has no numbers.
   */
  inh: string | null;
  /** The chip's explanation, in words. Null while the column has no numbers. */
  title: string | null;
  /** This column's lineage row, for the expansion. Null until it is `ok`. */
  detail: SparkSummaryRow | null;
}

export type HiddenBy = 'filter' | 'identical' | null;

export interface Row {
  groupId: number;
  name: string;
  kind: SparkKind;
  timing: SkillTiming | null;
  /** One of the reader's filtered sparks. */
  filtered: boolean;
  cells: Cell[];
  identical: boolean;
  hiddenBy: HiddenBy;
}

export interface TogetherCell {
  /** The figure, or empty when the pair carries none of what it covers. */
  value: string;
  /** "4 of 5 activate", "0 of 2 activate". */
  scope: string;
}

export interface TogetherRow {
  label: string;
  /** Null for a column with no numbers. */
  cells: Array<TogetherCell | null>;
}

export interface CompareModel {
  /** "Together: activate" and "Together: inherited", or nothing below two counted criteria. */
  together: TogetherRow[];
  /** The "Your sparks" band, in the order asked. Never hidden. */
  filtered: Row[];
  /** Every other VISIBLE row, grouped. */
  groups: Array<{ key: SparkGroupKey; label: string; rows: Row[] }>;
  /** Hidden rows, by their one reason. */
  hidden: { identical: number; filter: number };
  /** Two finished columns and none loading: the identical filter can apply. */
  identicalApplies: boolean;
  /** Two or more columns that are not blocked or failed: the toggles are shown. */
  canCompare: boolean;
  /** Per column, per side: "same half as A·P2", or null. */
  sharedHalves: Array<[string | null, string | null]>;
}

const DASH_CELL: Omit<Cell, 'act' | 'inh' | 'title' | 'detail'> = {
  carried: false,
  stars: '',
  carriers: '',
};

/** The four strings a reader sees in one cell, joined, or the dash. For equality only. */
const printed = (cell: Cell): string =>
  cell.carried ? `${cell.stars} ${cell.carriers} ${cell.act ?? ''} ${cell.inh ?? ''}` : '—';

export function compareModel(input: ModelInput): CompareModel {
  const { columns, criteria, sparkOptions, view } = input;
  const gold = goldGroupsOf(criteria);
  const option = new Map(sparkOptions.map((o) => [o.groupId, o]));

  // Per column: the roster inventory, and the lineage's rows once it has one.
  const inventories = columns.map((column): Map<number, PairSpark> => {
    const [a, b] = column.halves;
    return new Map(pairSparks(a?.sparks ?? [], b?.sparks ?? []).map((s) => [s.groupId, s]));
  });
  const lineageRows = columns.map((column) =>
    column.result.kind === 'ok'
      ? new Map(column.result.lineage.sparks.map((s) => [s.groupId, s]))
      : null,
  );

  const okCount = columns.filter((c) => c.result.kind === 'ok').length;
  const loadingCount = columns.filter((c) => c.result.kind === 'loading').length;
  const identicalApplies = okCount >= 2 && loadingCount === 0;

  // Every group any pair carries, plus every filtered one.
  const groupIds = new Set<number>(criteria.map((c) => c.groupId));
  for (const inventory of inventories) for (const id of inventory.keys()) groupIds.add(id);

  const asked = new Set(criteria.map((c) => c.groupId));
  const rows: Row[] = [];
  for (const groupId of groupIds) {
    // Name and kind from the catalogue, which also covers a filtered spark no
    // pair carries -- a criterion is only a groupId. A lineage row is the
    // fallback for a spark the catalogue lacks.
    const known =
      option.get(groupId) ??
      lineageRows.map((m) => m?.get(groupId)).find((r) => r !== undefined) ??
      null;
    if (known === null) continue;

    const cells = columns.map((column, i): Cell => {
      const owned = inventories[i]?.get(groupId);
      const numbers = lineageRows[i] ?? null;
      const detail = numbers?.get(groupId) ?? null;
      if (!owned || owned.carriers === 0) {
        return { ...DASH_CELL, act: numbers ? '' : null, inh: numbers ? '' : null, title: null, detail };
      }
      const base = { carried: true, stars: `${owned.stars}★`, carriers: `${owned.carriers}/6` };
      if (!numbers) return { ...base, act: null, inh: null, title: null, detail: null };
      if (!detail) return { ...base, act: '', inh: '', title: null, detail: null };
      const isGold = gold.has(groupId);
      const inherit = cellInherit(detail, isGold);
      return {
        ...base,
        act: percent(valueFor(detail, view)),
        inh: inherit === null ? '' : `(${percent(inherit)})`,
        title: `${sparkExplanation(detail, view, isGold).replace(/\.$/, '')} · carried by ${owned.carriers} of 6`,
        detail,
      };
    });

    const okCells = cells.filter((_, i) => columns[i]?.result.kind === 'ok').map(printed);
    const identical = identicalApplies && okCells.every((p) => p === okCells[0]);
    const filtered = asked.has(groupId);
    rows.push({
      groupId,
      name: known.name,
      kind: known.kind,
      timing: known.kind === 'white_skill' ? input.timingOf(groupId) : null,
      filtered,
      cells,
      identical,
      hiddenBy: hiddenBy(
        { filtered, identical, open: input.open.has(groupId) },
        { onlyFiltered: input.onlyFiltered && criteria.length > 0, hideIdentical: input.hideIdentical },
      ),
    });
  }

  const filteredRows = criteria
    .map((c) => rows.find((r) => r.groupId === c.groupId))
    .filter((r): r is Row => r !== undefined);

  const groups = SPARK_GROUP_ORDER.map((key) => ({
    key,
    label: groupLabelOf(key),
    rows: rows
      .filter((r) => !r.filtered && r.hiddenBy === null && groupKeyOf(r) === key)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.rows.length > 0);

  return {
    together: togetherRows(input),
    filtered: filteredRows,
    groups,
    hidden: {
      identical: rows.filter((r) => r.hiddenBy === 'identical').length,
      filter: rows.filter((r) => r.hiddenBy === 'filter').length,
    },
    identicalApplies,
    canCompare: columns.filter((c) => c.result.kind === 'ok' || c.result.kind === 'loading').length >= 2,
    sharedHalves: sharedHalvesOf(columns),
  };
}

/**
 * THE ONE ORDERED VISIBILITY RULE, so each hidden row has exactly one reason
 * and the hidden-rows line's parts always add up to its total.
 *
 *   1. a filtered spark, or an open row, is never hidden -- a window switch
 *      that makes an open row identical must not pull it from under the reader
 *   2. "Only my filtered sparks" on: every other row is hidden as 'filter'
 *   3. otherwise "Hide identical" on, and applicable: an identical row is
 *      hidden as 'identical'
 */
export function hiddenBy(
  row: { filtered: boolean; identical: boolean; open: boolean },
  toggles: { onlyFiltered: boolean; hideIdentical: boolean },
): HiddenBy {
  if (row.filtered || row.open) return null;
  if (toggles.onlyFiltered) return 'filter';
  if (toggles.hideIdentical && row.identical) return 'identical';
  return null;
}

/**
 * "Together: activate" and "Together: inherited", exactly the pane's figures.
 *
 * Built by `jointFigures`, the function the roster pane calls, so a column and
 * the pane cannot disagree about one pair. Shown from two counted criteria up,
 * the pane's own rule: with one, "together" IS that requirement. Unlike the
 * pane, a column that carries only one of them still gets a figure -- that
 * spark's own, scoped "1 of 2" -- and one that carries none an empty value
 * scoped "0 of 2", because an empty cell in this row would read "not carried".
 */
function togetherRows(input: ModelInput): TogetherRow[] {
  const counted = input.criteria.filter(countsTowardOdds);
  if (counted.length < 2) return [];
  const figures = input.columns.map((column) =>
    column.result.kind === 'ok'
      ? jointFigures(column.result.lineage.sparks, input.criteria, input.sparkOptions, input.view)
      : null,
  );
  const cell = (f: { value: number | null; scope: string } | undefined): TogetherCell | null =>
    f === undefined ? null : { value: f.value === null ? '' : percentJoint(f.value), scope: f.scope };

  const rows: TogetherRow[] = [
    { label: 'Together: activate', cells: figures.map((f) => cell(f?.act)) },
  ];
  // Only where some counted criterion HAS an inherit figure: a white skill.
  const skills = counted.some(
    (c) => input.sparkOptions.find((o) => o.groupId === c.groupId)?.kind === 'white_skill',
  );
  if (skills) rows.push({ label: 'Together: inherited', cells: figures.map((f) => cell(f?.inh)) });
  return rows;
}

/**
 * "same half as A·P2": a side that is the same pick as any side of an EARLIER
 * column, in either position. Identity, not a rating -- versions of one loop
 * often share a half, and saying so is what lets the reader look at the half
 * that differs.
 */
function sharedHalvesOf(columns: readonly ModelColumn[]): Array<[string | null, string | null]> {
  return columns.map((column, i) => {
    const label = (side: 0 | 1): string | null => {
      for (const earlier of columns.slice(0, i)) {
        for (const t of [0, 1] as const) {
          if (samePick(column.pair[side], earlier.pair[t])) {
            return `same half as ${earlier.letter}·P${t + 1}`;
          }
        }
      }
      return null;
    };
    return [label(0), label(1)];
  });
}
