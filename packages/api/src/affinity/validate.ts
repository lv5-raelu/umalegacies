import { DomainError } from '../common/error-response';
import type { AncestorRef, ExplainRequest, GrandparentTuple } from './types';

/**
 * Generous against the observed maximum of 26. A cap at all exists because the
 * spark summary is O(n^2) in the carrier count and the body is user-supplied.
 */
const MAX_FACTORS_PER_ANCESTOR = 64;

/**
 * Generous against the observed maximum of 45. Same reasoning as the factor cap:
 * the body is user-supplied and the engine builds a Set per link from it. Milder
 * than the factor case because the work stays linear, but the asymmetry of
 * bounding one user-supplied array and not the other is the actual bug.
 */
const MAX_WIN_SADDLES_PER_ANCESTOR = 128;

/**
 * Shape-check at the boundary. README: "A malformed request should be a 400
 * with a message naming the problem, never a 500 from a destructured
 * `undefined`." Every throw here names the offending field.
 */
export function parseExplainRequest(body: unknown): ExplainRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new DomainError('INVALID_BODY', 'Request body must be a JSON object.');
  }
  const raw = body as Record<string, unknown>;

  const traineeCharaId = intField(raw.traineeCharaId, 'traineeCharaId');

  if (!Array.isArray(raw.parents) || raw.parents.length !== 2) {
    throw new DomainError(
      'INVALID_PARENTS',
      'parents must be an array of exactly 2 ancestors (slots 10 and 20).',
      400,
      'parents',
    );
  }
  const parents = raw.parents.map((p, i) =>
    parseAncestor(p, `parents[${i}]`, false),
  ) as [AncestorRef, AncestorRef];

  if (!Array.isArray(raw.grandparents) || raw.grandparents.length !== 4) {
    throw new DomainError(
      'INVALID_GRANDPARENTS',
      'grandparents must be an array of exactly 4 entries (slots 11, 12, 21, 22); ' +
        'use null for an empty slot.',
      400,
      'grandparents',
    );
  }
  const grandparents = raw.grandparents.map((g, i) =>
    parseAncestor(g, `grandparents[${i}]`, true),
  ) as GrandparentTuple;

  const request: ExplainRequest = { traineeCharaId, parents, grandparents };

  if (raw.masterHash !== undefined) {
    // Bounded: it is a SHA-256 hex digest or it is not one. Accepting an
    // arbitrary string capped only by the body limit, for a value whose whole
    // job is to be compared against a digest, is not validation.
    if (typeof raw.masterHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.masterHash)) {
      throw new DomainError(
        'INVALID_MASTER_HASH',
        'masterHash must be a 64-character lowercase SHA-256 hex digest when present.',
        400,
        'masterHash',
      );
    }
    request.masterHash = raw.masterHash;
  }

  return request;
}

/**
 * Refuses to answer a request pinned to different game data.
 *
 * `ExplainRequest.masterHash` was documented as "an optional echo of GET
 * /master/meta, for staleness detection" and was then read by nothing: the
 * server validated it, copied it onto the request, and computed against its own
 * hash regardless. A client that dutifully echoed a stale digest got a
 * confident answer from a different version of the game with no way to tell.
 *
 * This matters because a patch really does move the numbers: the last one added
 * 23 succession_relation_member rows and three characters, so base affinity
 * between two EXISTING characters can shift. A cached answer is only true
 * against the extract it came from.
 *
 * 409 rather than 400: the request is well-formed, it just disagrees with the
 * server's current state, and the fix is to re-read GET /master/meta.
 */
export function assertMasterHashCurrent(
  echoed: string | undefined,
  current: string,
): void {
  if (echoed === undefined || echoed === current) return;
  throw new DomainError(
    'STALE_MASTER_HASH',
    `This request is pinned to master data ${echoed.slice(0, 12)}, but the server is ` +
      `serving ${current.slice(0, 12)}. A game patch moves affinity between existing ` +
      'characters, so answering would mean returning numbers from a different version. ' +
      'Re-read GET /master/meta and discard anything cached against the old hash.',
    409,
    'masterHash',
  );
}

function parseAncestor(
  value: unknown,
  field: string,
  nullable: boolean,
): AncestorRef | null {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new DomainError(
      'MISSING_ANCESTOR',
      `${field} is required; a parent slot cannot be empty.`,
      400,
      field,
    );
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError(
      'INVALID_ANCESTOR',
      `${field} must be an object with cardId and winSaddleIds.`,
      400,
      field,
    );
  }
  const raw = value as Record<string, unknown>;
  const cardId = intField(raw.cardId, `${field}.cardId`);

  if (!Array.isArray(raw.winSaddleIds)) {
    throw new DomainError(
      'INVALID_WIN_SADDLES',
      `${field}.winSaddleIds must be an array of integers (use [] for none).`,
      400,
      `${field}.winSaddleIds`,
    );
  }
  const winSaddleIds = raw.winSaddleIds.map((id, i) =>
    intField(id, `${field}.winSaddleIds[${i}]`),
  );
  if (winSaddleIds.length > MAX_WIN_SADDLES_PER_ANCESTOR) {
    throw new DomainError(
      'TOO_MANY_WIN_SADDLES',
      `${field}.winSaddleIds has ${winSaddleIds.length} entries; the most any ` +
        `ancestor carries is ${MAX_WIN_SADDLES_PER_ANCESTOR}.`,
      400,
      `${field}.winSaddleIds`,
    );
  }
  if (new Set(winSaddleIds).size !== winSaddleIds.length) {
    throw new DomainError(
      'DUPLICATE_WIN_SADDLE_ID',
      `${field}.winSaddleIds repeats an id. A veteran wins each race at most once, ` +
        'and a repeat would misstate which G1s two members actually share.',
      400,
      `${field}.winSaddleIds`,
    );
  }

  const ancestor: AncestorRef = { cardId, winSaddleIds };

  // Optional because no affinity rule reads it: a request without sparks still
  // gets every number in the affinity tree, just no summary rows from that slot.
  if (raw.factorIds !== undefined) {
    if (!Array.isArray(raw.factorIds)) {
      throw new DomainError(
        'INVALID_FACTOR_IDS',
        `${field}.factorIds must be an array of integers when present.`,
        400,
        `${field}.factorIds`,
      );
    }
    const factorIds = raw.factorIds.map((id, i) =>
      intField(id, `${field}.factorIds[${i}]`),
    );

    // An ancestor's sparks are a SET. Measured across all 1,554 ancestor slots
    // and 259 veterans in a real roster: zero repeats, and at most 26 factors on
    // any one ancestor. A repeat is therefore never legitimate save data, and
    // accepting one is not harmless: summariseSparks counts each occurrence as
    // an independent carrier, so 50 copies of one id turns a 6-star 43% spark
    // into a 104-star 99.99% spark. Those are audited numbers. It is also
    // quadratic work, since careerOdds runs a DP whose distribution grows by one
    // slot per carrier.
    if (factorIds.length > MAX_FACTORS_PER_ANCESTOR) {
      throw new DomainError(
        'TOO_MANY_FACTORS',
        `${field}.factorIds has ${factorIds.length} entries; the most any ancestor ` +
          `carries is ${MAX_FACTORS_PER_ANCESTOR}.`,
        400,
        `${field}.factorIds`,
      );
    }
    const seen = new Set<number>();
    for (const id of factorIds) {
      if (seen.has(id)) {
        throw new DomainError(
          'DUPLICATE_FACTOR_ID',
          `${field}.factorIds repeats ${id}. An ancestor carries each spark at ` +
            'most once, and counting a repeat would inflate its star total and odds.',
          400,
          `${field}.factorIds`,
        );
      }
      seen.add(id);
    }
    ancestor.factorIds = factorIds;
  }

  return ancestor;
}

function intField(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DomainError(
      'INVALID_FIELD',
      `${field} must be an integer.`,
      400,
      field,
    );
  }
  return value;
}
