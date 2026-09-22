import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MasterData,
  decodeMasterJson,
  encodeMasterJson,
  type MasterJson,
} from '@umalegacies/core';
import { extractDatabase, extractHash, readTables } from './master-extract.js';

/**
 * THE COMMITTED master.json STILL MATCHES THE COMMITTED EXTRACT.
 *
 * `packages/web/public/master.json` is generated from
 * `packages/api/data/master-extract.sql` and committed, so that the web build
 * stays standalone and a clean clone can `npm run dev` without compiling the
 * API first. The price of a committed generated file is drift, and this is
 * where it is paid: both files are in the repo, so this check runs in CI.
 *
 * Regenerate the extract and forget `npm run build:master-json`, and the build
 * goes red here rather than shipping a browser that sweeps against last patch's
 * game data while the server resolves names from this one.
 */

const here = dirname(fileURLToPath(import.meta.url));
const committedPath = resolve(here, '../../../web/public/master.json');
const committed = JSON.parse(readFileSync(committedPath, 'utf8')) as MasterJson;

const tables = readTables(extractDatabase());
const hash = extractHash();

describe('the committed master.json', () => {
  it('was generated from the extract this build carries', () => {
    expect(committed.hash).toBe(hash);
  });

  it('is byte-identical to regenerating it now', () => {
    // Stronger than comparing the decoded rows: it also catches a change in the
    // ENCODING, which would leave every number right and still break a browser
    // built against the old shape.
    expect(JSON.stringify(committed)).toBe(JSON.stringify(encodeMasterJson(hash, tables)));
  });

  it('carries every table the engine asks for, and no empty ones', () => {
    for (const name of Object.keys(tables)) {
      const table = committed.tables[name];
      expect(table, `missing table '${name}'`).toBeDefined();
      expect(table!.keys.length, `table '${name}' has no columns`).toBeGreaterThan(0);
      expect(table!.cols[0]!.length, `table '${name}' has no rows`).toBeGreaterThan(0);
    }
  });
});

describe('what the browser rebuilds from it', () => {
  const decoded = decodeMasterJson(committed);

  it('recovers the rows the server read out of sqlite', () => {
    expect(decoded.tables).toEqual(tables);
  });

  it('preserves row ORDER, which three queries depend on', () => {
    // `card_data` ascending by id is what makes a character's first card its
    // base costume; both rank tables are scanned for the first row a score
    // falls into. A round trip that sorted or grouped would change a rank
    // without changing a value.
    expect(decoded.tables.cardData.map((r) => r.id)).toEqual(tables.cardData.map((r) => r.id));
    expect(decoded.tables.careerRank.map((r) => r.min_value)).toEqual(
      tables.careerRank.map((r) => r.min_value),
    );
  });

  it('builds a MasterData that answers identically to the server’s', () => {
    // The whole point. Same class, two sources, and the browser must not get a
    // different number than the API for the same question.
    const fromSqlite = new MasterData(tables);
    const fromJson = new MasterData(decoded.tables);

    for (const cardId of [100601, 100602, 100201, 100901, 100501]) {
      expect(fromJson.charaIdFor(cardId)).toBe(fromSqlite.charaIdFor(cardId));
      expect(fromJson.costumeLabel(cardId)).toBe(fromSqlite.costumeLabel(cardId));
      expect(fromJson.baseCardFor(fromSqlite.charaIdFor(cardId) ?? 0)).toBe(
        fromSqlite.baseCardFor(fromSqlite.charaIdFor(cardId) ?? 0),
      );
    }
    for (const factorId of [101, 203, 1101, 2000103, 10010101]) {
      expect(fromJson.factor(factorId)).toEqual(fromSqlite.factor(factorId));
    }
    for (const score of [1, 9_999, 15_000, 18_945, 99_999]) {
      expect(fromJson.rankFor(score)).toEqual(fromSqlite.rankFor(score));
    }
  });
});

describe('the encoding refuses a document it cannot trust', () => {
  it('rejects a table whose columns are ragged', () => {
    const broken: MasterJson = {
      hash,
      tables: { cardData: { keys: ['id', 'chara_id'], cols: [[1, 2, 3], [9]] } },
    };
    expect(() => decodeMasterJson(broken)).toThrow(/column 'chara_id' has 1 rows, expected 3/);
  });

  it('rejects a table with more keys than columns', () => {
    const broken: MasterJson = {
      hash,
      tables: { cardData: { keys: ['id', 'chara_id'], cols: [[1, 2]] } },
    };
    expect(() => decodeMasterJson(broken)).toThrow(/2 keys and 1 columns/);
  });

  it('round-trips an empty table rather than inventing rows for it', () => {
    const empty = encodeMasterJson(hash, { ...tables, winsSaddle: [] } as typeof tables);
    expect(empty.tables.winsSaddle).toEqual({ keys: [], cols: [] });
    expect(decodeMasterJson(empty).tables.winsSaddle).toEqual([]);
  });
});
