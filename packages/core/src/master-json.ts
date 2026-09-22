import type { MasterTables } from './master-data.js';

/**
 * THE GAME DATA, IN A SHAPE A BROWSER CAN DOWNLOAD.
 *
 * `MasterData` takes plain rows rather than a database handle (T14) precisely so
 * it can be built on either side of the network. The server reads those rows out
 * of `node:sqlite`; the browser reads them out of this. Same class, same
 * numbers, one implementation.
 *
 * COLUMNAR, AND MEASURED BEFORE CHOOSING. A dump of rows-as-objects repeats
 * every key on every row -- `relation_type` appears 1,616 times in one table
 * alone. Storing the keys once and the values in parallel arrays costs about
 * fifteen lines each way and was worth it on both axes:
 *
 * ```
 *   rows as objects    390,307 bytes    42,134 gzipped
 *   columnar           120,641 bytes    28,264 gzipped
 * ```
 *
 * A third off the wire and a THIRD of the bytes to parse, which is the half
 * that gzip cannot help with: the browser still has to JSON.parse whatever
 * arrives, and 121 KB is 3.2x less work than 390 KB.
 *
 * ROW ORDER IS PRESERVED AND THAT IS LOAD-BEARING. Three of the queries behind
 * these tables carry an `ORDER BY` that `MasterTables` documents as
 * significant: `card_data` ascending by id is what makes the first card seen
 * for a character its base costume, and both rank tables are scanned for the
 * first row a score falls into. Parallel arrays keep row order by construction;
 * anything that sorted or grouped here would silently change a rank.
 */

/** One table, as a key list and one value array per key. */
export interface ColumnarTable {
  keys: string[];
  /** `cols[k][r]` is row `r`'s value for `keys[k]`. Every column has equal length. */
  cols: unknown[][];
}

export interface MasterJson {
  /**
   * The SHA-256 of the SQL extract these rows came from.
   *
   * The browser resolves its roster against the server's copy of the extract
   * and then sweeps against this one. If the two ever differ, every number the
   * search reports is computed from different game data than the names beside
   * it, and nothing on screen would say so.
   */
  hash: string;
  tables: Record<string, ColumnarTable>;
}

export function encodeMasterJson(hash: string, tables: MasterTables): MasterJson {
  const out: Record<string, ColumnarTable> = {};
  for (const [name, rows] of Object.entries(tables)) {
    const list = rows as ReadonlyArray<Record<string, unknown>>;
    // An empty table has no first row to take keys from. It round-trips to an
    // empty table, which is the only honest answer; `MasterData` is what decides
    // whether an empty table is survivable.
    const keys = list.length === 0 ? [] : Object.keys(list[0] as Record<string, unknown>);
    out[name] = { keys, cols: keys.map((k) => list.map((row) => row[k])) };
  }
  return { hash, tables: out };
}

export function decodeMasterJson(doc: MasterJson): { hash: string; tables: MasterTables } {
  const tables: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(doc.tables)) {
    const { keys, cols } = table;
    const height = cols[0]?.length ?? 0;
    // A ragged document would produce rows with holes in them, and a hole in a
    // `relation_point` is a wrong affinity rather than a crash. Cheaper to
    // refuse it here than to find it in a number later.
    for (const [k, column] of cols.entries()) {
      if (column.length !== height) {
        throw new Error(
          `master json: table '${name}' column '${keys[k]}' has ${column.length} rows, expected ${height}`,
        );
      }
    }
    if (cols.length !== keys.length) {
      throw new Error(
        `master json: table '${name}' has ${keys.length} keys and ${cols.length} columns`,
      );
    }
    const rows: unknown[] = new Array(height);
    for (let r = 0; r < height; r++) {
      const row: Record<string, unknown> = {};
      for (let k = 0; k < keys.length; k++) row[keys[k] as string] = (cols[k] as unknown[])[r];
      rows[r] = row;
    }
    tables[name] = rows;
  }
  return { hash: doc.hash, tables: tables as unknown as MasterTables };
}
