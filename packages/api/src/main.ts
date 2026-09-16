import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AppModule } from './app.module';
import { ErrorFilter } from './common/error.filter';
import { MasterBootError } from './master/master.errors';

/**
 * The CORS allowlist README warns about. It is explicit, so a Vite dev server
 * that falls back to a different port fails every request with a bare
 * "Failed to fetch" that looks like the API is down. Add the port here.
 */
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function allowedOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS;
  if (!configured) return DEFAULT_ORIGINS;
  return configured
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  // The roster upload is exempt from the body limit. Builder's explicit call.
  //
  // Registered BEFORE the global parser so it wins: body-parser marks the
  // request once parsed and the later parser skips it.
  //
  // MEASURED 2026-09-16, and the measurement argues for revisiting this: the
  // browser now slims the save to three public fields per uma before sending,
  // which takes the builder's own roster from 5,283,444 bytes to 160,495 -- 157
  // KB, comfortably INSIDE the 256 KB global limit. The exemption is kept
  // because a roster around 1.6x the builder's would still cross that line and
  // the instruction was to let it through, but the case for it is now much
  // weaker than when the upload was 5 MB.
  //
  // BEFORE ANY DEPLOY: an unbounded body on an unauthenticated route is a
  // memory-exhaustion vector. A bounded-but-larger limit scoped to this route
  // (say 8 MB) would honour the same intent.
  app.use('/roster/resolve', json({ limit: Infinity }));

  // Explicit, not Express's undocumented 100 KB default. A lineage is six
  // ancestors carrying a card id, a win list and a spark list: the largest
  // fixture is under 8 KB. 256 KB leaves generous headroom and still bounds
  // what an unauthenticated caller can make the server parse.
  app.useBodyParser('json', { limit: '256kb' });
  const origins = allowedOrigins();

  app.enableCors({ origin: origins, methods: ['GET', 'POST'] });
  app.useGlobalFilters(new ErrorFilter());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  new Logger('bootstrap').log(
    `API on http://localhost:${port} | CORS: ${origins.join(', ')}`,
  );
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
