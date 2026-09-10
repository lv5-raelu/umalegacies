import type Database from 'better-sqlite3';
import { sliceDatabase } from '../affinity/fixtures';

/**
 * An in-memory master.mdb stand-in, built from the committed text slice at
 * packages/api/fixtures/master-slice.sql.
 *
 * The slice carries the rows every boot check asserts on AND the two golden
 * lineages, so the whole startup path can be exercised in CI with no 16 MB
 * user file present. Callers may mutate the returned database freely to
 * simulate a drifted extraction; each call builds a fresh one.
 */
export function fixtureDb(): Database.Database {
  return sliceDatabase();
}
