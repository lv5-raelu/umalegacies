import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { DomainError } from '../common/error-response.js';
import { contentChecks } from './content-checks.js';
import { MasterData } from './master-data.js';
import { extractHeader, findExtract } from './master-extract.js';
import { MasterBootError, MasterDbMissing, MasterSchemaError } from './master.errors.js';

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
  // Sparks (factor_type = colour, rarity = star count) and per-character
  // metadata. No affinity rule reads these yet; they are asserted because the
  // extract now ships them and M2 renders sparks on every tree node, so an
  // extract without them is a broken extract, not a lean one.
  'succession_factor',
  'chara_data',
  'text_data',
  // The 98 career rank bands. Queried by MasterData.careerRankTier, which is
  // what binds the web app's rank ladder to data with a committed source.
  'single_mode_rank',
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

  private db!: DatabaseSync;
  private meta!: MasterMeta;
  private masterData!: MasterData;

  /**
   * Why the master data is unusable, when it is.
   *
   * Set instead of thrown, because onModuleInit runs INSIDE
   * `NestFactory.create`. A throw there means no application and no request to
   * answer, and on a serverless platform that is not a named startup failure --
   * it is the whole function dying before any route exists. The deployment
   * showed exactly that: every request returned FUNCTION_INVOCATION_FAILED with
   * nothing in the body, and the cause was only visible in the platform log.
   *
   * The intent of `master.errors.ts` -- "three distinguishable named errors
   * rather than three identical 500s" -- survives, and arrives somewhere the
   * caller can read it. Nothing serves numbers from bad data either way,
   * because both accessors below refuse.
   */
  private bootFailure: MasterBootError | null = null;

  async onModuleInit(): Promise<void> {
    try {
      await this.boot();
    } catch (error) {
      if (!(error instanceof MasterBootError)) throw error;
      this.bootFailure = error;
      // Loud, and with the code, because this is still a broken deployment --
      // it just reports itself per request instead of by exiting.
      this.logger.error(`${error.code}: ${error.message}`);
    }
  }

  private async boot(): Promise<void> {
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
        this.db = new DatabaseSync(path, { readOnly: true });
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
    this.db = new DatabaseSync(':memory:');
    this.db.exec(sql);
    return {
      masterHash: sha256(Buffer.from(sql)),
      source: 'extract',
      sourceMasterHash: extractHeader(sql, 'source master.mdb sha256'),
      extractedAt: extractHeader(sql, 'extracted'),
    };
  }

  /**
   * The two doors into the master data, and the only two. Every controller
   * reaches it through one of them, so guarding here is enough: there is no
   * path to a number computed from data that failed its checks.
   *
   * 503 rather than 500: the request is fine and the server is not, which is
   * what "the extract is missing" actually means. The code is the boot error's
   * own, so `error.filter.ts` returns MASTER_DB_MISSING / MASTER_SCHEMA_ERROR /
   * MASTER_CONTENT_ERROR in the ErrorResponse shape every other failure uses,
   * and the message keeps the instructions for fixing it.
   */
  private ready(): void {
    if (!this.bootFailure) return;
    throw new DomainError(this.bootFailure.code, this.bootFailure.message, 503);
  }

  getMeta(): MasterMeta {
    this.ready();
    return this.meta;
  }

  /** Every master lookup the affinity rules need, loaded once. */
  get data(): MasterData {
    this.ready();
    return this.masterData;
  }
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
