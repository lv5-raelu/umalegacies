/**
 * Writes `dist/package.json` containing exactly `{"type":"module"}`.
 *
 * Node decides a .js file's module format from the NEAREST package.json. A
 * Vercel function bundle flattens this package's compiled output to the lambda
 * root while packages/api/package.json keeps its repository path, so there is
 * nothing beside the handler saying the output is ESM:
 *
 *   /var/task/main.js                     <- packages/api/dist/main.js, the handler
 *   /var/task/master/master-extract.js
 *   /var/task/packages/api/package.json   <- has "type": "module", too far away
 *
 * Without this file Node reads the ESM output as CommonJS and the function dies
 * before any route runs:
 *
 *   SyntaxError: Cannot use import statement outside a module
 *
 * THIS FILE WAS DELETED ONCE, on 2026-09-18, on the reasoning that setting the
 * service `entrypoint` to src/main.ts meant Vercel compiled the API itself and
 * never saw this dist. That is wrong, and it broke production: `entrypoint`
 * names where the server entry SOURCE is, and the function is still built from
 * buildCommand's output. The bundle's own manifest settles it --
 *
 *   handler: main.js  ->  packages/api/dist/main.js
 *
 * -- so the compiled output is the thing that runs, and it needs this marker.
 * Two deploys passed in between because the alias was still serving a warm
 * instance of the previous build; the failure only appeared on a cold start.
 *
 * If you are about to delete it again, check
 * `.vercel/output/services/api/functions/index.func/.vc-config.json` after a
 * `vercel build` and confirm `package.json` is in filePathMap. A passing deploy
 * is not evidence: a cold start is.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
mkdirSync(dist, { recursive: true });
writeFileSync(
  fileURLToPath(new URL('../dist/package.json', import.meta.url)),
  `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
);
