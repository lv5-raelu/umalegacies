import { Body, Controller, Post } from '@nestjs/common';
import { MasterService } from '../master/master.service';
import { explain } from './engine';
import type { ExplainResponse } from './types';
import { parseExplainRequest } from './validate';

@Controller('affinity')
export class AffinityController {
  constructor(private readonly master: MasterService) {}

  /**
   * Every number in the response opens onto the master rows that produced it.
   * The request carries the whole lineage because ancestors have no stable
   * public id: they are card_id plus a win list, nothing more.
   */
  @Post('explain')
  explain(@Body() body: unknown): ExplainResponse {
    const request = parseExplainRequest(body);
    return explain(request, this.master.data, this.master.getMeta().masterHash);
  }
}
