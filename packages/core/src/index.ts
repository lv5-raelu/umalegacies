/**
 * The engine's public surface.
 *
 * ONE COPY, TWO RUNTIMES. Everything here runs unchanged in the API and in the
 * browser: the M7 pair sweep scores 33,411 lineages client-side, and the same
 * functions answer `/affinity/explain-pair` server-side. A second copy of any
 * of it is how the two start disagreeing about what a number means.
 *
 * Nothing in this package may import a Node API. `tsconfig.json` sets
 * `"types": []` so that a `node:` import is a compile error rather than a
 * surprise in a Vite build.
 */

// `export *` rather than a curated list: a named surface here drifts from what
// the modules actually export, and the first symptom is a consumer being told a
// member does not exist when it plainly does.
export * from './engine.js';
// The two predicates M7 shares between the roster list and the pair sweep. They
// live here so "the list filter and the pair search agree by construction" is a
// fact about the code rather than a hope about two copies.
export * from './filter.js';
export * from './joint.js';
// M7's sweep: the inverse query, composed entirely from the above.
export * from './sweep.js';
export * from './lineage.js';
export * from './pair.js';
export * from './master-data.js';
export * from './sparks.js';
export * from './spark-types.js';
export * from './error-response.js';
export * from './citations.js';
export * from './positions.js';
export * from './types.js';
