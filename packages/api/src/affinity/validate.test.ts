import { describe, expect, it } from 'vitest';
import { DomainError } from '../common/error-response';
import { loadFixture } from './fixtures';
import { parseExplainRequest } from './validate';

const valid = () => JSON.parse(JSON.stringify(loadFixture('5531').request));

describe('parseExplainRequest', () => {
  it('accepts a well-formed request', () => {
    const parsed = parseExplainRequest(valid());
    expect(parsed.parents).toHaveLength(2);
    expect(parsed.grandparents).toHaveLength(4);
  });

  it('drops unknown top-level keys rather than passing them through', () => {
    const parsed = parseExplainRequest({ ...valid(), somethingElse: 'ignored' });
    expect(Object.keys(parsed).sort()).toEqual([
      'grandparents',
      'parents',
      'traineeCharaId',
    ]);
  });

  // README: "A malformed request should be a 400 with a message naming the
  // problem, never a 500 from a destructured `undefined`."
  const badBodies: Array<[string, unknown, string]> = [
    ['a non-object body', 'nope', 'INVALID_BODY'],
    ['an array body', [], 'INVALID_BODY'],
    ['a missing traineeCharaId', { parents: [], grandparents: [] }, 'INVALID_FIELD'],
    [
      'a non-integer traineeCharaId',
      { ...valid(), traineeCharaId: 1007.5 },
      'INVALID_FIELD',
    ],
    ['one parent instead of two', { ...valid(), parents: [null] }, 'INVALID_PARENTS'],
    [
      'three grandparents instead of four',
      { ...valid(), grandparents: [null, null, null] },
      'INVALID_GRANDPARENTS',
    ],
    [
      'a null parent',
      { ...valid(), parents: [null, valid().parents[1]] },
      'MISSING_ANCESTOR',
    ],
    [
      'an ancestor with no cardId',
      { ...valid(), parents: [{ winSaddleIds: [] }, valid().parents[1]] },
      'INVALID_FIELD',
    ],
    [
      'winSaddleIds that is not an array',
      {
        ...valid(),
        parents: [{ cardId: 101401, winSaddleIds: 'all of them' }, valid().parents[1]],
      },
      'INVALID_WIN_SADDLES',
    ],
    [
      'a non-integer inside winSaddleIds',
      {
        ...valid(),
        parents: [{ cardId: 101401, winSaddleIds: [1, 'two'] }, valid().parents[1]],
      },
      'INVALID_FIELD',
    ],
    ['a non-string masterHash', { ...valid(), masterHash: 12 }, 'INVALID_MASTER_HASH'],
  ];

  it.each(badBodies)('rejects %s with a 400 naming the problem', (_label, body, code) => {
    let thrown: unknown;
    try {
      parseExplainRequest(body);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DomainError);
    const error = thrown as DomainError;
    expect(error.code).toBe(code);
    expect(error.status).toBe(400);
    expect(error.message.length).toBeGreaterThan(10);
  });

  it('names the offending field on ancestor errors, so the UI can point at it', () => {
    try {
      parseExplainRequest({
        ...valid(),
        grandparents: [{ cardId: 'x', winSaddleIds: [] }, null, null, null],
      });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as DomainError).field).toBe('grandparents[0].cardId');
    }
  });

  it('accepts null grandparents, since the game permits an empty slot', () => {
    const parsed = parseExplainRequest({
      ...valid(),
      grandparents: [null, null, null, null],
    });
    expect(parsed.grandparents).toEqual([null, null, null, null]);
  });
});
