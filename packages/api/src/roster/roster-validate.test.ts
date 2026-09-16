import { describe, expect, it } from 'vitest';
import { DomainError } from '../common/error-response';
import { parseRosterResolveRequest } from './roster-validate';

const member = (over: Record<string, unknown> = {}) => ({
  cardId: 100201,
  winSaddleIds: [],
  factorIds: [101],
  ...over,
});
const veteran = (over: Record<string, unknown> = {}) => ({
  score: 1000,
  self: member(),
  parents: [null, null],
  ...over,
});

const codeOf = (body: unknown): string => {
  try {
    parseRosterResolveRequest(body);
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return 'NO_ERROR';
};

/**
 * Every throw names the offending field. README: "A malformed request should be
 * a 400 with a message naming the problem, never a 500 from a destructured
 * undefined."
 */
describe('parseRosterResolveRequest rejects malformed uploads by name', () => {
  it.each([
    ['a non-object body', 'null', null, 'INVALID_BODY'],
    ['an array body', '[]', [], 'INVALID_BODY'],
    ['a missing veterans array', '{}', {}, 'INVALID_VETERANS'],
    ['a veterans entry that is not an object', 'veterans[0]', { veterans: [1] }, 'INVALID_VETERAN'],
    [
      'a non-numeric score',
      'veterans[0].score',
      { veterans: [veteran({ score: 'high' })] },
      'INVALID_SCORE',
    ],
    [
      'a NaN score',
      'veterans[0].score',
      { veterans: [veteran({ score: Number.NaN })] },
      'INVALID_SCORE',
    ],
    [
      'a parents array of the wrong length',
      'veterans[0].parents',
      { veterans: [veteran({ parents: [null] })] },
      'INVALID_VETERAN_PARENTS',
    ],
    [
      'a missing self',
      'veterans[0].self',
      { veterans: [veteran({ self: null })] },
      'MISSING_ANCESTOR',
    ],
    [
      'a non-integer cardId',
      'veterans[0].self.cardId',
      { veterans: [veteran({ self: member({ cardId: 1.5 }) })] },
      'INVALID_FIELD',
    ],
    [
      'a repeated factor id',
      'veterans[0].self.factorIds',
      { veterans: [veteran({ self: member({ factorIds: [101, 101] }) })] },
      'DUPLICATE_FACTOR_ID',
    ],
    [
      'a repeated win saddle id',
      'veterans[0].self.winSaddleIds',
      { veterans: [veteran({ self: member({ winSaddleIds: [10, 10] }) })] },
      'DUPLICATE_WIN_SADDLE_ID',
    ],
    [
      'a masterHash that is not a digest',
      'masterHash',
      { veterans: [], masterHash: 'nope' },
      'INVALID_MASTER_HASH',
    ],
  ])('rejects %s', (_label, _field, body, code) => {
    expect(codeOf(body)).toBe(code);
  });

  it('requires factorIds on a roster member even though an ancestor may omit them', () => {
    // An affinity request legitimately omits sparks: every affinity number is
    // computed without them. A roster request cannot, because the whole point is
    // learning what a veteran passes down, and an omitted list would render as
    // "no sparks" -- a claim about the uma rather than a gap in the request.
    const body = { veterans: [veteran({ self: { cardId: 100201, winSaddleIds: [] } })] };
    expect(codeOf(body)).toBe('MISSING_FACTOR_IDS');
  });

  it('accepts an empty roster rather than treating it as malformed', () => {
    expect(parseRosterResolveRequest({ veterans: [] }).veterans).toEqual([]);
  });

  it('accepts a veteran with empty parent slots', () => {
    const parsed = parseRosterResolveRequest({ veterans: [veteran()] });
    expect(parsed.veterans[0]!.parents).toEqual([null, null]);
  });

  it('accepts a roster far larger than the builder has, since the route is uncapped', () => {
    // The builder's call: no size restriction on this route. 2,000 veterans is
    // roughly 8x the real roster and must parse rather than 413.
    const many = { veterans: Array.from({ length: 2000 }, () => veteran()) };
    expect(parseRosterResolveRequest(many).veterans.length).toBe(2000);
  });
});
