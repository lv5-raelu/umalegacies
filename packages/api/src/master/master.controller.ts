import { Controller, Get } from '@nestjs/common';
import { MasterService, type MasterMeta } from './master.service.js';

@Controller('master')
export class MasterController {
  constructor(private readonly master: MasterService) {}

  /**
   * The identity of the master.mdb this server is serving. Clients echo
   * `masterHash` on later requests so a patch-day mismatch is detectable
   * rather than silently producing numbers from a different game version.
   */
  @Get('meta')
  meta(): MasterMeta {
    return this.master.getMeta();
  }
}
