import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import type { RosterResolveResponse, TraineeOption } from '@umalegacies/types';
import { assertMasterHashCurrent } from '../affinity/validate.js';
import { MasterService } from '../master/master.service.js';
import { resolveRoster, traineeOptions } from './roster.js';
import { parseRosterResolveRequest } from './roster-validate.js';

@Controller('roster')
export class RosterController {
  constructor(private readonly master: MasterService) {}

  /**
   * Turns a slimmed save into names, costumes and sparks.
   *
   * PARSED AND DISCARDED. Nothing derived from this request outlives it: there
   * is no store, no cache and no log of it, and the response is the only copy
   * that exists when the handler returns. The request shape is what makes that
   * claim checkable rather than a promise -- the browser drops every personal
   * field before sending, so there is no trainer id, nickname or timestamp here
   * to retain even by accident.
   */
  @Post('resolve')
  resolve(@Body() body: unknown): RosterResolveResponse {
    const request = parseRosterResolveRequest(body);
    const masterHash = this.master.getMeta().masterHash;
    assertMasterHashCurrent(request.masterHash, masterHash);
    return { ...resolveRoster(request.veterans, this.master.data), masterHash };
  }

  /**
   * Every trainable card, for the trainee picker.
   *
   * From master.mdb, not from the save: you can train a character you have never
   * trained before, so sourcing this from the roster would hide most of the game.
   */
  // Immutable for the life of a deployment: it is computed from the committed
  // extract and nothing else, so every visitor gets identical bytes until the
  // next deploy, which serves them from a new URL anyway. 10,443 bytes (2,314
  // gzipped) that fired on every first paint and woke the function in Singapore
  // to recompute an answer that was already correct.
  //
  // stale-while-revalidate so the deploy after a game patch does not make one
  // unlucky visitor wait for the recompute.
  @Header('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  @Get('trainees')
  trainees(): { trainees: TraineeOption[]; masterHash: string } {
    return {
      trainees: traineeOptions(this.master.data),
      masterHash: this.master.getMeta().masterHash,
    };
  }
}
