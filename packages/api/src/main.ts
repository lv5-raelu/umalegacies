import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
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
