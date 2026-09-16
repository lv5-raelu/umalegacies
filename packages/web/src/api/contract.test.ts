import { describe, expect, it } from 'vitest';
import { POSITION_LABEL as apiPositions } from '../../../api/src/affinity/positions';
import { SPARK_KIND_ORDER as apiOrder } from '../../../api/src/sparks/spark-types';
import { POSITION_LABEL as webPositions } from '../lineage/positions';
import { SPARK_COLOR, SPARK_GROUP_LABEL, SPARK_KIND_ORDER as webOrder } from '../lineage/sparks';

/**
 * What is left to check once the wire types are shared.
 *
 * This file used to assert the web's hand-mirrored copy of every wire type was
 * assignable to the API's, in both directions, and it earned its keep: it caught
 * two real divergences the day it was written. @umalegacies/types deleted the
 * mirror and with it that whole class of drift, so those assertions are gone
 * rather than kept as tautologies -- both sides now name the same declaration.
 *
 * The RUNTIME tables cannot move into a types-only package, so they are still
 * two copies and still the only thing here that can drift.
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
