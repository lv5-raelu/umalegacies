import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import Database from 'better-sqlite3';
import { contentChecks } from './content-checks';
import { MasterData } from './master-data';
import { extractHeader, findExtract } from './master-extract';
import {
  MasterDbMissing,
  MasterSchemaError,
  type MasterBootError,
} from './master.errors';

/**
 * Tables the affinity rules read. Presence is asserted at boot so a drifted
 * schema fails startup by name instead of surfacing as a 500 per request.
 */
const REQUIRED_TABLES = [
  'succession_relation',
  'succession_relation_member',
  'succession_relation_rank',
  'single_mode_wins_saddle',
  'card_data',
  'text_data',
] as const;

export interface MasterMeta {
  /** SHA-256 of the source actually loaded. Clients echo it to detect staleness. */
  masterHash: string;
  /** Which source produced the data being served. */
  source: 'extract' | 'master.mdb';
  /** SHA-256 of the game's master.mdb the extract was generated from. */
  sourceMasterHash: string | null;
  /** Extraction date recorded in the extract header. */
  extractedAt: string | null;
  /** Row counts for the tables the rules read, as a coarse sanity signal. */
  tables: Record<string, number>;
}

@Injectable()
export class MasterService implements OnModuleInit {
  private readonly logger = new Logger(MasterService.name);

  private db!: Database.Database;
  private meta!: MasterMeta;
  private masterData!: MasterData;

  async onModuleInit(): Promise<void> {
    const loaded = this.load();

    // Every table the rules read must exist.
    const present = new Set(
      (
        this.db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>
      ).map((r) => r.name),
    );
    for (const table of REQUIRED_TABLES) {
      if (!present.has(table)) throw new MasterSchemaError(table);
    }

    // The rows still mean what the rules assume, up to and including running
    // a real lineage through the real engine.
    for (const check of contentChecks) check.run(this.db);

    this.masterData = new MasterData(this.db);
    this.meta = {
      ...loaded,
      tables: Object.fromEntries(
        REQUIRED_TABLES.map((t) => [
          t,
          (
            this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }
          ).n,
        ]),
      ),
    };

    this.logger.log(
      `master data ok: ${loaded.source} ${loaded.masterHash.slice(0, 12)}` +
        (loaded.extractedAt ? ` (extracted ${loaded.extractedAt})` : '') +
        `, ${contentChecks.length} content checks passed`,
    );
  }

  /**
   * Default source is the committed extract: 6 of master.mdb's 416 tables as
   * SQL text, so a clone can run the API with no 16 MB user file. Set
   * MASTER_DB_PATH to serve a real master.mdb instead, which is what you want
   * when checking whether a game patch moved anything.
   */
  private load(): Omit<MasterMeta, 'tables'> {
    const override = process.env.MASTER_DB_PATH;
    if (override) {
      const path = resolve(override);
      try {
        this.db = new Database(path, { readonly: true, fileMustExist: true });
      } catch (cause) {
        throw new MasterDbMissing(path, cause);
      }
      return {
        masterHash: sha256(readFileSync(path)),
        source: 'master.mdb',
        sourceMasterHash: null,
        extractedAt: null,
      };
    }

    const path = findExtract();
    const sql = readFileSync(path, 'utf8');
    this.db = new Database(':memory:');
    this.db.exec(sql);
    return {
      masterHash: sha256(Buffer.from(sql)),
      source: 'extract',
      sourceMasterHash: extractHeader(sql, 'source master.mdb sha256'),
      extractedAt: extractHeader(sql, 'extracted'),
    };
  }

  getMeta(): MasterMeta {
    return this.meta;
  }

  /** Every master lookup the affinity rules need, loaded once. */
  get data(): MasterData {
    return this.masterData;
  }

  get database(): Database.Database {
    return this.db;
  }

  /** Delegates to MasterData. See the note there: join card_data, never divide. */
  charaIdFor(cardId: number): number | null {
    return this.masterData.charaIdFor(cardId);
  }
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function isMasterBootError(e: unknown): e is MasterBootError {
  return e instanceof Error && typeof (e as { code?: unknown }).code === 'string';
}
