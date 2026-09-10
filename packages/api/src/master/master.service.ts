import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import Database from 'better-sqlite3';
import { contentChecks } from './content-checks';
import { MasterData } from './master-data';
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
  /** SHA-256 of the master.mdb file. Clients echo it to detect staleness. */
  masterHash: string;
  /** Row counts for the tables the rules read, as a coarse extraction sanity signal. */
  tables: Record<string, number>;
}

@Injectable()
export class MasterService implements OnModuleInit {
  private readonly logger = new Logger(MasterService.name);
  private readonly path = resolve(
    process.env.MASTER_DB_PATH ?? resolve(process.cwd(), '../../master.mdb'),
  );

  private db!: Database.Database;
  private meta!: MasterMeta;
  private masterData!: MasterData;

  async onModuleInit(): Promise<void> {
    // 1. Open read-only. fileMustExist turns a missing file into an error here
    //    rather than an empty database that fails every later query.
    try {
      this.db = new Database(this.path, {
        readonly: true,
        fileMustExist: true,
      });
    } catch (cause) {
      throw new MasterDbMissing(this.path, cause);
    }

    // 2. Every table the rules read must exist.
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

    // 3. The rows still mean what the rules assume. M1 appends the fixture-5774
    //    check here once the affinity engine exists to run it.
    for (const check of contentChecks) check.run(this.db);

    // 4. Hash the file and cache it. There is no version table in master.mdb
    //    (all 416 table names checked), so the hash plus an extraction date is
    //    the only stable identity a citation can carry.
    const masterHash = await sha256File(this.path);

    this.masterData = new MasterData(this.db);

    this.meta = {
      masterHash,
      tables: Object.fromEntries(
        REQUIRED_TABLES.map((t) => [
          t,
          (
            this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as {
              n: number;
            }
          ).n,
        ]),
      ),
    };

    this.logger.log(
      `master.mdb ok: ${masterHash.slice(0, 12)} (${this.path}), ` +
        `${contentChecks.length} content checks passed`,
    );
  }

  getMeta(): MasterMeta {
    return this.meta;
  }

  /** Every master.mdb lookup the affinity rules need, loaded once. */
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

export function isMasterBootError(e: unknown): e is MasterBootError {
  return (
    e instanceof Error && typeof (e as { code?: unknown }).code === 'string'
  );
}

function sha256File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolvePromise(hash.digest('hex')));
  });
}
