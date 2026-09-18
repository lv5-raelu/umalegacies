import type { RosterMemberInput, RosterResolveRequest, RosterVeteranInput } from '@umalegacies/types';
import { DomainError } from '../common/error-response.js';
import { parseAncestor, parseMasterHash } from '../affinity/validate.js';

/**
 * Shape-check the slimmed roster.
 *
 * NO LIMIT ON THE NUMBER OF VETERANS, and none on the body size either. That is
 * the builder's explicit call: the raw save is 5,283,444 bytes against a 256kb
 * global JSON limit, and even slimmed to what this endpoint reads it does not
 * fit under any round number worth picking. Recorded here rather than silently,
 * because an unbounded body on an unauthenticated route is a memory-exhaustion
 * vector and this must be revisited BEFORE any deploy.
 *
 * The PER-ANCESTOR caps still apply, and they are a different thing: they exist
 * because the spark summary is quadratic in the carrier count, so they protect
 * the numbers rather than the process. See parseAncestor.
 */
export function parseRosterResolveRequest(body: unknown): RosterResolveRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new DomainError('INVALID_BODY', 'Request body must be a JSON object.');
  }
  const raw = body as Record<string, unknown>;

  if (!Array.isArray(raw.veterans)) {
    throw new DomainError(
      'INVALID_VETERANS',
      'veterans must be an array (use [] for an empty roster).',
      400,
      'veterans',
    );
  }

  const request: RosterResolveRequest = {
    veterans: raw.veterans.map((v, i) => parseVeteranInput(v, `veterans[${i}]`)),
  };
  if (raw.masterHash !== undefined) request.masterHash = parseMasterHash(raw.masterHash);
  return request;
}

function parseVeteranInput(value: unknown, field: string): RosterVeteranInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DomainError(
      'INVALID_VETERAN',
      `${field} must be an object with score, self and parents.`,
      400,
      field,
    );
  }
  const raw = value as Record<string, unknown>;

  if (typeof raw.score !== 'number' || !Number.isFinite(raw.score)) {
    throw new DomainError(
      'INVALID_SCORE',
      `${field}.score must be a finite number (the save's rank_score).`,
      400,
      `${field}.score`,
    );
  }

  if (!Array.isArray(raw.parents) || raw.parents.length !== 2) {
    throw new DomainError(
      'INVALID_VETERAN_PARENTS',
      `${field}.parents must be an array of exactly 2 entries (the veteran's own ` +
        'slots 10 and 20); use null for an empty slot.',
      400,
      `${field}.parents`,
    );
  }

  return {
    score: raw.score,
    self: parseMember(raw.self, `${field}.self`, false) as RosterMemberInput,
    parents: [
      parseMember(raw.parents[0], `${field}.parents[0]`, true),
      parseMember(raw.parents[1], `${field}.parents[1]`, true),
    ],
  };
}

/**
 * One member, on the same rules as an affinity ancestor plus one difference:
 * `factorIds` is required rather than optional here.
 *
 * An affinity request legitimately omits sparks -- every affinity number is
 * computed without them. A roster request cannot: the whole point of resolving
 * a roster is to learn what each veteran passes down, and a member with no
 * factorIds would silently become a veteran with no sparks, which reads on
 * screen as a fact about the uma rather than a gap in the request.
 */
function parseMember(
  value: unknown,
  field: string,
  nullable: boolean,
): RosterMemberInput | null {
  const ancestor = parseAncestor(value, field, nullable);
  if (ancestor === null) return null;
  if (ancestor.factorIds === undefined) {
    throw new DomainError(
      'MISSING_FACTOR_IDS',
      `${field}.factorIds is required on a roster member (use [] for an uma with ` +
        'no sparks). Omitting it would show as "no sparks" rather than as a gap.',
      400,
      `${field}.factorIds`,
    );
  }
  return {
    cardId: ancestor.cardId,
    winSaddleIds: ancestor.winSaddleIds,
    factorIds: ancestor.factorIds,
  };
}
