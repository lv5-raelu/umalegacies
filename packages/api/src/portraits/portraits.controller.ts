import { createReadStream, openSync } from 'node:fs';
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

  @Get(':cardId.png')
  portrait(@Param('cardId') cardId: string, @Res({ passthrough: true }) res: Response) {
    const found = lookupPortrait(this.dir, cardId);

    if (!found.ok) {
      // The cache header is set ONLY on the success path, deliberately. A
      // @Header() decorator applies before the handler throws, so a miss would
      // be cached for a day: the user runs `fetch:portraits`, reloads, and
      // still sees initials with nothing to explain it. A miss has to expire
      // the moment the cache is warmed.
      res.setHeader('Cache-Control', 'no-store');
      if (found.reason === 'invalid_id') {
        throw new DomainError(
          'INVALID_CARD_ID',
          'cardId must be a number, e.g. /portraits/100601.png.',
          400,
          'cardId',
        );
      }
      throw new DomainError(
        'PORTRAIT_NOT_CACHED',
        `No cached portrait for card ${cardId}. The cache is optional and ` +
          'gitignored; run `npm run fetch:portraits --workspace @umalegacies/api` ' +
          'to fill it. Until then this costume renders as initials.',
        404,
        'cardId',
      );
    }

    // Open BEFORE writing any header, and stream from the descriptor.
    //
    // lookupPortrait checked the file a moment ago but the open happens later,
    // so it can be gone, replaced or unreadable by then: a concurrent
    // `fetch:portraits --force`, a permission change, EMFILE under load. Letting
    // StreamableFile discover that answers with Nest's default handler, which
    // does `res.send(err.message)` -- putting the ABSOLUTE SERVER PATH in the
    // body, leaving a day-long Cache-Control in place, and returning plain text
    // where every other endpoint returns ErrorResponse. All three are what
    // common/error.filter.ts exists to prevent.
    //
    // Opening first makes the open itself the check, so a failure is an ordinary
    // DomainError with no headers written yet.
    let fd: number;
    try {
      fd = openSync(found.path, 'r');
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      throw new DomainError(
        'PORTRAIT_NOT_CACHED',
        `The cached portrait for card ${cardId} could not be read. It may have been ` +
          'removed while this request was in flight; re-run ' +
          '`npm run fetch:portraits --workspace @umalegacies/api`.',
        404,
        'cardId',
      );
    }

    // Keyed by card_id (a costume) and only ever refilled by re-running the
    // fetch script, so a day is safe and keeps the tree off the network.
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // A failure now is mid-stream, after headers: nothing useful can be said to
    // the client, so close the connection rather than appending an error to a
    // half-sent PNG.
    return new StreamableFile(createReadStream('', { fd, autoClose: true })).setErrorHandler(
      (_error, response) => response.end(),
    );
  }
}
