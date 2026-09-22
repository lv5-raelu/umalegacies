import { describe, expect, it } from 'vitest';
// The web's copies. Both modules import nothing but `import type` from
// @umalegacies/types, so they carry no React or DOM types into a package whose
// tsconfig is `types: ["node"]`.
import { POSITION_LABEL as webPositions } from '../../web/src/lineage/positions.js';
import {
  SPARK_COLOR,
  SPARK_GROUP_LABEL,
  SPARK_KIND_ORDER as webOrder,
} from '../../web/src/lineage/sparks.js';
import { POSITION_LABEL as apiPositions, SPARK_KIND_ORDER as apiOrder } from '@umalegacies/core';

/**
 * What is left to check once the wire types are shared.
 *
 * This used to assert the web's hand-mirrored copy of every wire type was
 * assignable to the API's, in both directions, and it earned its keep: it caught
 * two real divergences the day it was written. @umalegacies/types deleted the
 * mirror and with it that whole class of drift, so those assertions are gone
 * rather than kept as tautologies -- both sides now name the same declaration.
 *
 * The RUNTIME tables cannot move into a types-only package, so they are still
 * two copies and still the only thing here that can drift.
 *
 * WHY IT LIVES IN packages/api RATHER THAN BESIDE THE WEB CODE
 *
 * The dependency only points one way now:
 *
 *     packages/api  tests ──may import──►  packages/web  source
 *     packages/web  tests ──NEVER────────►  packages/api  source
 *
 * because the two packages' builds are not symmetrical. `packages/api`'s
 * tsconfig excludes `**\/*.test.ts`, so nothing an api TEST imports can reach
 * the api build. `packages/web`'s tsconfig includes its tests, so a web test
 * importing api source put api source -- and api's devDependencies -- inside the
 * web BUILD's typecheck graph.
 *
 * That resolved locally, because npm hoists dependencies to the repository root,
 * and failed on Vercel, which installs each service in isolation:
 *
 *     ../api/src/master/master-data.ts(1,31): error TS2307:
 *       Cannot find module 'better-sqlite3'
 *
 * `no-api-imports.test.ts` enforces the rule so it cannot quietly come back.
 */
describe('the runtime tables the two workspaces each keep a copy of', () => {
  it('names every slot the same way the engine does', () => {
    // The engine bakes these labels into every link label ("Oguri Cap (Trainee)
    // <-> Mejiro Dober (P1)"), and the tree prints them beside the cards. If
    // the two copies drift, a node is labelled one thing and the provenance
    // line beside it another.
    expect(webPositions).toEqual(apiPositions);
  });

  it('renders every spark kind the API can emit', () => {
    // Not inert data: AuditTrail groups rows with the web's copy of this order,
    // so a kind the API emits and the web does not list is dropped from a table
    // headed "every spark this lineage can pass down" -- no row, no count, no
    // note. The API's own comment anticipates a patch adding a seventh type.
    expect([...webOrder]).toEqual([...apiOrder]);
    for (const kind of apiOrder) {
      expect(SPARK_COLOR[kind], `no colour for ${kind}`).toBeDefined();
      expect(SPARK_GROUP_LABEL[kind], `no label for ${kind}`).toBeDefined();
    }
  });
});
