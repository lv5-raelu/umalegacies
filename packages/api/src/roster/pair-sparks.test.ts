import { describe, expect, it } from 'vitest';
import type { RosterMemberInput, RosterVeteranInput, VeteranPackage } from '@umalegacies/types';
import { explainLineage, lineageFromPair, pairSparks } from '@umalegacies/core';
import { extractHash, extractMaster } from '../master/master-extract.js';
import { FIXTURE_NAMES, loadFixture } from '../affinity/fixtures.js';
import { resolveRoster } from './roster.js';

const master = extractMaster();
const hash = extractHash();

/** A fixture's package, as the roster upload would have carried it. */
const asInput = (pkg: VeteranPackage): RosterVeteranInput => ({
  score: 0,
  self: pkg.self as RosterMemberInput,
  parents: pkg.parents as [RosterMemberInput | null, RosterMemberInput | null],
});

/*
 * The compare page prints each cell's stars and carriers from the two ROSTER
 * packages, before and regardless of any trainee, and its activation and
 * inherit from the explained LINEAGE. One cell, two sources: this holds them
 * to the same answer on every committed pair fixture.
 */
describe('pairSparks agrees with the explained lineage', () => {
  const pairs = FIXTURE_NAMES.flatMap((name) => {
    const fixture = loadFixture(name);
    return fixture.pair ? [{ name, pair: fixture.pair }] : [];
  });

  it('has pair fixtures to check', () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  for (const { name, pair } of pairs) {
    it(`${name}: same sparks, same stars, same carriers`, () => {
      const { veterans } = resolveRoster([asInput(pair.veteranA), asInput(pair.veteranB)], master);
      const [a, b] = veterans;
      const inventory = pairSparks(a?.sparks ?? [], b?.sparks ?? []);
      const lineage = explainLineage(lineageFromPair(pair), master, hash);

      const fromRoster = Object.fromEntries(
        inventory.map((s) => [s.groupId, { stars: s.stars, carriers: s.carriers }]),
      );
      const fromLineage = Object.fromEntries(
        lineage.sparks.map((s) => [s.groupId, { stars: s.stars, carriers: s.lineageCarriers }]),
      );
      expect(fromRoster).toEqual(fromLineage);
    });
  }
});
