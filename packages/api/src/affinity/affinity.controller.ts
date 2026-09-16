import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DomainError } from '../common/error-response';
import { MasterService } from '../master/master.service';
import { FIXTURE_NAMES, loadFixture } from './fixtures';
import { explainLineage, type LineageResponse } from './lineage';
import type { ExplainRequest } from './types';
import { lineageFromPair } from './pair';
import {
  assertMasterHashCurrent,
  parseExplainPairRequest,
  parseExplainRequest,
} from './validate';

@Controller('affinity')
export class AffinityController {
  constructor(private readonly master: MasterService) {}

  /**
   * Every number in the response opens onto the master rows that produced it.
   * The request carries the whole lineage because ancestors have no stable
   * public id: they are card_id plus a win list and a spark list, nothing more.
   */
  @Post('explain')
  explain(@Body() body: unknown): LineageResponse {
    const request = parseExplainRequest(body);
    const masterHash = this.master.getMeta().masterHash;
    // A client that pins its request to an extract we are no longer serving is
    // told so, rather than handed numbers from a different version of the game.
    assertMasterHashCurrent(request.masterHash, masterHash);
    return explainLineage(request, this.master.data, masterHash);
  }

  /**
   * The roster screen's endpoint: two chosen veterans, explained as one lineage.
   *
   * The client sends two three-uma PACKAGES and the server composes them into
   * six positioned slots.
   *
   * The reason is slot mapping, and only slot mapping. Which grandparent sits
   * under which parent stops being something the UI can get wrong: a mis-composed
   * request is still a well-formed request, and it returns a confident, plausible
   * and wrong total that nothing downstream can detect. Keeping that one step
   * server-side puts it under `pair.test.ts` instead of inside a React component.
   *
   * NOT for wire size, though the plan claimed it. Measured 2026-09-16 on both
   * pair fixtures: the pair form is 1,680 B against the composed 1,645 B for
   * verify-oguri, and 1,272 against 1,237 for pair-asymmetric -- 35 bytes LARGER
   * each time, not smaller. Both shapes carry exactly six AncestorRefs, because a
   * veteran's two parents ARE two of the four grandparents; the pair form just
   * adds a level of nesting around them. The plan's "772 bytes against 5,745" is
   * wrong and the design doc has been corrected.
   */
  @Post('explain-pair')
  explainPair(@Body() body: unknown): LineageResponse {
    const pair = parseExplainPairRequest(body);
    const masterHash = this.master.getMeta().masterHash;
    assertMasterHashCurrent(pair.masterHash, masterHash);
    return explainLineage(lineageFromPair(pair), this.master.data, masterHash);
  }

  /**
   * The committed fixtures, as ExplainRequests.
   *
   * M3 is what puts a real roster on screen. Until it exists the web app has
   * nothing to render, and a screen built against hand-typed data drifts from
   * the engine within one edit. So the fixtures the golden tests assert on are
   * also the lineages the UI develops against: one source, and a UI bug and a
   * test failure cannot disagree about what the data is.
   */
  @Get('fixtures')
  fixtures(): { names: string[] } {
    return { names: [...FIXTURE_NAMES] };
  }

  @Get('fixtures/:name')
  fixture(@Param('name') name: string): {
    name: string;
    description: string;
    request: ExplainRequest;
  } {
    if (!(FIXTURE_NAMES as readonly string[]).includes(name)) {
      throw new DomainError(
        'UNKNOWN_FIXTURE',
        `No fixture named "${name}". Known fixtures: ${FIXTURE_NAMES.join(', ')}.`,
        404,
        'name',
      );
    }
    const fixture = loadFixture(name);
    return {
      name: fixture.name,
      description: fixture.description,
      request: fixture.request,
    };
  }
}
