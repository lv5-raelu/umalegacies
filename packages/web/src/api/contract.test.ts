import { describe, expect, expectTypeOf, it } from 'vitest';
import { POSITION_LABEL as apiPositions } from '../../../api/src/affinity/positions';
import { SPARK_KIND_ORDER as apiOrder } from '../../../api/src/sparks/spark-types';
import type { AncestorIdentity as ApiIdentity, LineageResponse as ApiLineage } from '../../../api/src/affinity/lineage';
import type * as Api from '../../../api/src/affinity/types';
import type * as ApiSparks from '../../../api/src/sparks/spark-types';
import { POSITION_LABEL as webPositions } from '../lineage/positions';
import { SPARK_COLOR, SPARK_GROUP_LABEL, SPARK_KIND_ORDER as webOrder } from '../lineage/sparks';
import type * as Web from './types';

/**
 * The web app hand-mirrors the API's wire types. There is no shared package and
 * no codegen, which is a deliberate call -- but nothing enforced it, so the
 * mirror was correct only by luck: this milestone added `trainee`, `resolution`,
 * `portraitCardId`, `factorIds` and the whole spark block, and every one had to
 * be retyped by hand.
 *
 * `import type` erases at runtime, so this costs no build-order dependency
 * between the two workspaces.
 */
describe('the web mirror matches the API wire types', () => {
  it('is assignable in both directions', () => {
    expectTypeOf<ApiLineage>().toExtend<Web.LineageResponse>();
    expectTypeOf<Web.LineageResponse>().toExtend<ApiLineage>();
    expectTypeOf<Api.ExplainRequest>().toEqualTypeOf<Web.ExplainRequest>();
    expectTypeOf<Api.AncestorRef>().toEqualTypeOf<Web.AncestorRef>();
    expectTypeOf<Api.ExplainNode>().toEqualTypeOf<Web.ExplainNode>();
    expectTypeOf<Api.Resolution>().toEqualTypeOf<Web.Resolution>();
    expectTypeOf<Api.MasterRef>().toEqualTypeOf<Web.MasterRef>();
    expectTypeOf<Api.RuleId>().toEqualTypeOf<Web.RuleId>();
    expectTypeOf<ApiIdentity>().toEqualTypeOf<Web.AncestorIdentity>();
    expectTypeOf<ApiSparks.SparkKind>().toEqualTypeOf<Web.SparkKind>();
    expectTypeOf<ApiSparks.SparkSummaryRow>().toEqualTypeOf<Web.SparkSummaryRow>();
    expectTypeOf<ApiSparks.AncestorSparkSet>().toEqualTypeOf<Web.AncestorSparkSet>();
  });

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
