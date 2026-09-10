/**
 * Boot-time failures. `master.mdb` is a single point of failure for every
 * number this product exists to produce, so a missing file, a drifted schema
 * and a subtly wrong extraction must be three distinguishable named errors at
 * startup rather than three identical 500s on every later request.
 */
export abstract class MasterBootError extends Error {
  abstract readonly code: string;
}

export class MasterDbMissing extends MasterBootError {
  readonly code = 'MASTER_DB_MISSING';
  constructor(readonly path: string, cause?: unknown) {
    super(
      `master.mdb not readable at ${path}. Extract it from your game install ` +
        `and place it at the repository root, or set MASTER_DB_PATH.`,
    );
    this.name = 'MasterDbMissing';
    if (cause !== undefined) this.cause = cause;
  }
}

export class MasterSchemaError extends MasterBootError {
  readonly code = 'MASTER_SCHEMA_ERROR';
  constructor(readonly table: string) {
    super(
      `master.mdb is missing the table '${table}'. This is not the game's ` +
        `master database, or a patch changed its schema.`,
    );
    this.name = 'MasterSchemaError';
  }
}

export class MasterContentError extends MasterBootError {
  readonly code = 'MASTER_CONTENT_ERROR';
  constructor(readonly check: string, detail: string) {
    super(`master.mdb failed the content check '${check}': ${detail}`);
    this.name = 'MasterContentError';
  }
}
