import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AppModule } from './app.module.js';
import { ErrorFilter } from './common/error.filter.js';
import { MasterBootError } from './master/master.errors.js';

/**
 * Every route lives under /api, and nothing here configures CORS.
 *
 * The app and the API are ONE Vercel project on ONE origin: a rewrite sends
 * /api/* to this function and everything else to the static build. Same origin
 * means the browser's cross-origin rules never fire, so the allowlist this file
 * used to carry -- and the preview-URL problem it would have grown -- are gone
 * rather than configured.
 *
 * Measured 2026-09-17: the rewrite does NOT strip the prefix, so this function
 * really does receive /api/roster/resolve and setGlobalPrefix matches it.
 *
 * The prefix is not decoration. On one origin the API and the Vite build share
 * a namespace, and they collided: rank-atlas.controller.ts serves /assets and
 * `vite build` emits dist/assets/index-*.js. Under /api the two namespaces are
 * disjoint by construction rather than by vigilance.
 */
const API_PREFIX = 'api';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  app.setGlobalPrefix(API_PREFIX);

  // The roster upload gets its own, larger body limit.
  //
  // MOUNTED AT THE PREFIXED PATH, and that is not cosmetic. setGlobalPrefix
  // moves NEST ROUTES; it does not move Express middleware mounted with
  // app.use(path, ...). Left at '/roster/resolve' this stops matching entirely
  // and the 256 KB parser below silently wins -- a roster upload would fail at
  // 256 KB while every comment here promised megabytes, and no test in this
  // suite touches an HTTP route, so it would ship green.
  //
  // Registered BEFORE the global parser so it wins: body-parser marks the
  // request once parsed and the later parser skips it.
  //
  // 4 MB, DOWN from 20 MB, because Vercel rejects a request body over 4.5 MB at
  // the platform edge with its own error page -- before this process runs, so
  // error.filter.ts never sees it and the client gets HTML where every other
  // failure is an ErrorResponse. A limit below theirs keeps the contract ours:
  // an oversized upload is PAYLOAD_TOO_LARGE in the shape the client parses.
  //
  // Still far above anything real. The browser slims the save to three public
  // fields per uma before sending, which takes the builder's 259-veteran roster
  // to 160,495 bytes -- so 4 MB is roughly 26x the real payload, around 6,500
  // veterans, a bound nobody legitimately reaches.
  app.use(`/${API_PREFIX}/roster/resolve`, json({ limit: '4mb' }));

  // Explicit, not Express's undocumented 100 KB default. A lineage is six
  // ancestors carrying a card id, a win list and a spark list: the largest
  // fixture is under 8 KB. 256 KB leaves generous headroom and still bounds
  // what an unauthenticated caller can make the server parse.
  app.useBodyParser('json', { limit: '256kb' });
  app.useGlobalFilters(new ErrorFilter());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  new Logger('bootstrap').log(`API on http://localhost:${port}/${API_PREFIX}`);
}

bootstrap().catch((error: unknown) => {
  // Refuse to start dirty. A master.mdb problem is a startup failure with a
  // named cause, not a 500 on every subsequent request.
  if (error instanceof MasterBootError) {
    new Logger('bootstrap').error(`${error.code}: ${error.message}`);
    process.exit(1);
  }
  throw error;
});
