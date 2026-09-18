import { Controller, Get, Header } from '@nestjs/common';
import { MasterService, type MasterMeta } from './master.service.js';

@Controller('master')
export class MasterController {
  constructor(private readonly master: MasterService) {}

  /**
   * The identity of the master.mdb this server is serving. Clients echo
   * `masterHash` on later requests so a patch-day mismatch is detectable
   * rather than silently producing numbers from a different game version.
   */
  // s-maxage, not max-age: the CDN may answer, the browser still revalidates.
  //
  // DELIBERATELY SHORT. This is the staleness signal -- clients echo masterHash
  // back and the server answers 409 STALE_MASTER_HASH when a deployment moved
  // under an open tab. Caching it for a day would mean a tab holding a hash the
  // deployment no longer serves, and being told so only after the cache expired.
  // A minute is enough to take the first-paint burst off the function without
  // blunting the check it exists to feed.
  //
  // A @Header() decorator is safe HERE and not on the artwork routes that used
  // to live in this API: it applies before the handler runs, so a throw would
  // inherit the lifetime. getMeta() throws 503 when the master data failed to
  // load -- see the no-store note below.
  @Header('Cache-Control', 'public, s-maxage=60')
  @Get('meta')
  meta(): MasterMeta {
    return this.master.getMeta();
  }
}
