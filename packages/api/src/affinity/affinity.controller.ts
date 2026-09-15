import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DomainError } from '../common/error-response';
import { MasterService } from '../master/master.service';
import { FIXTURE_NAMES, loadFixture } from './fixtures';
import { explainLineage, type LineageResponse } from './lineage';
import type { ExplainRequest } from './types';
import { parseExplainRequest } from './validate';

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
    return explainLineage(request, this.master.data, this.master.getMeta().masterHash);
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
