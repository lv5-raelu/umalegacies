import { createReadStream, openSync } from 'node:fs';
import { resolve } from 'node:path';
import { Controller, Get, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../common/error-response.js';
import { findPortraitDir } from './portrait-lookup.js';

/**
 * Serves the rank-badge atlas.
 *
 * ONE file, at a FIXED name. There is no path parameter here and deliberately
 * so: the portraits route has to validate a user-supplied card id and prove it
 * cannot escape its directory, and none of that applies when the only thing this
 * can ever open is a constant. The simplest version is the safe one.
 *
 * Cached and gitignored like the portraits, for the same reason. A clean clone
 * has no atlas and every card shows its rank as text, which is the designed
 * state rather than a failure.
 */
@Controller('assets')
export class RankAtlasController {
  // Sits beside the portrait cache, one directory up, so a single PORTRAIT_DIR
  // override moves both rather than leaving the atlas pointing somewhere else.
  private readonly path = resolve(findPortraitDir(), '../rank-icons/Rank_tex.webp');

  @Get('rank-atlas.webp')
  atlas(@Res({ passthrough: true }) res: Response) {
    // Open BEFORE writing any header: a failure discovered by StreamableFile
    // reaches Nest's default handler, which puts the ABSOLUTE SERVER PATH in the
    // response body. Opening first makes the open the check.
    let fd: number;
    try {
      fd = openSync(this.path, 'r');
    } catch {
      // no-store, not the success path's day: the moment the cache is warmed a
      // reload has to pick it up, rather than showing text for another 24 hours.
      res.setHeader('Cache-Control', 'no-store');
      throw new DomainError(
        'RANK_ATLAS_NOT_CACHED',
        'No cached rank badge atlas. The cache is optional and gitignored; run ' +
          '`npm run fetch:rank-icons --workspace @umalegacies/api` to fill it. ' +
          'Until then ranks render as text.',
        404,
      );
    }

    res.setHeader('Content-Type', 'image/webp');
    // Immutable in practice: it only changes when the fetch script is re-run
    // against a new game version, and the coordinates that crop it are committed
    // alongside, so the two move together or not at all.
    res.setHeader('Cache-Control', 'public, max-age=86400');

    return new StreamableFile(createReadStream('', { fd, autoClose: true })).setErrorHandler(
      (_error, response) => response.end(),
    );
  }
}
