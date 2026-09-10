import { DomainError } from '../common/error-response';
import type { AncestorRef, ExplainRequest, GrandparentTuple } from './types';

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
    if (typeof raw.masterHash !== 'string') {
      throw new DomainError(
        'INVALID_MASTER_HASH',
        'masterHash must be a string when present.',
        400,
        'masterHash',
      );
    }
    request.masterHash = raw.masterHash;
  }

  return request;
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

  return { cardId, winSaddleIds };
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
