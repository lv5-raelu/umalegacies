/**
 * Writes `dist/package.json` containing exactly `{"type":"module"}`.
 *
 * Node decides a .js file's module format from the NEAREST package.json, and a
 * Vercel function bundle flattens the compiled output to the lambda root while
 * this package's own package.json keeps its repository path:
 *
 *   /var/task/main.js                     <- packages/api/dist/main.js
 *   /var/task/master/master-extract.js
 *   /var/task/packages/api/package.json   <- has "type": "module", too far away
 *
 * With nothing beside main.js, Node reads ESM output as CommonJS and the
 * function dies before any route runs:
 *
 *   SyntaxError: Cannot use import statement outside a module
 *
 * Measured 2026-09-17. This file is emitted into dist/ so it lands at the
 * lambda root as `package.json`, which is the nearest one to main.js.
 *
 * It deliberately carries ONLY the type field. A copy of the real package.json
 * would put dependencies and scripts into the bundle and invite the two to
 * drift.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
mkdirSync(dist, { recursive: true });
writeFileSync(
  fileURLToPath(new URL('../dist/package.json', import.meta.url)),
  `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
);
