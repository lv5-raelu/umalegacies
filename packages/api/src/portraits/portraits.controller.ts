import { createReadStream } from 'node:fs';
import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../common/error-response';
import { findPortraitDir, lookupPortrait } from './portrait-lookup';

/**
 * Serves the portrait cache.
 *
 * The cache is gitignored and optional. A clean clone has nothing here and
 * every tree node shows initials, which is the designed missing-image state
 * rather than a failure: a newly-patched uma looks exactly the same until
 * `npm run fetch:portraits` is run again. So a miss is a 404, not an error
 * worth logging, and the client already handles it.
 */
@Controller('portraits')
export class PortraitsController {
  private readonly dir = findPortraitDir();

  @Get(':charaId.png')
  portrait(@Param('charaId') charaId: string, @Res({ passthrough: true }) res: Response) {
    const found = lookupPortrait(this.dir, charaId);

    if (!found.ok) {
      // The cache header is set ONLY on the success path, deliberately. A
      // @Header() decorator applies before the handler throws, so a miss would
      // be cached for a day: the user runs `fetch:portraits`, reloads, and
      // still sees initials with nothing to explain it. A miss has to expire
      // the moment the cache is warmed.
      res.setHeader('Cache-Control', 'no-store');
      if (found.reason === 'invalid_id') {
        throw new DomainError(
          'INVALID_CHARA_ID',
          'charaId must be a number, e.g. /portraits/1006.png.',
          400,
          'charaId',
        );
      }
      throw new DomainError(
        'PORTRAIT_NOT_CACHED',
        `No cached portrait for chara ${charaId}. The cache is optional and ` +
          'gitignored; run `npm run fetch:portraits --workspace @umalegacies/api` ' +
          'to fill it. Until then this character renders as initials.',
        404,
        'charaId',
      );
    }

    // Keyed by chara_id and only ever refilled by re-running the fetch script,
    // so a day is safe and keeps the tree off the network on every navigation.
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return new StreamableFile(createReadStream(found.path));
  }
}
