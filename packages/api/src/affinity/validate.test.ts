import { describe, expect, it } from 'vitest';
import { DomainError } from '../common/error-response';
import { loadFixture } from './fixtures';
import { assertMasterHashCurrent, parseExplainRequest } from './validate';

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

  describe('factorIds', () => {
    const withFactors = (factorIds: unknown) => {
      const request = valid();
      request.parents[0].factorIds = factorIds;
      return request;
    };

    it('accepts a normal spark list', () => {
      const parsed = parseExplainRequest(withFactors([101, 1102, 2000101]));
      expect(parsed.parents[0].factorIds).toEqual([101, 1102, 2000101]);
    });

    it('rejects a repeated factor id', () => {
      // Never legitimate: across 1,554 ancestor slots in a real roster there is
      // not one repeat. Accepting one is not harmless, because each occurrence
      // becomes an independent carrier -- 50 copies took a 6-star 43% spark to
      // 104 stars and 99.99%, and those are numbers this product audits.
      try {
        parseExplainRequest(withFactors([101, 1102, 101]));
        throw new Error('should have thrown');
      } catch (error) {
        expect((error as DomainError).code).toBe('DUPLICATE_FACTOR_ID');
        expect((error as DomainError).field).toBe('parents[0].factorIds');
      }
    });

    it('rejects a list longer than any ancestor can carry', () => {
      // The summary is O(n^2) in the carrier count and the body is user-supplied.
      try {
        parseExplainRequest(withFactors(Array.from({ length: 65 }, (_, i) => 100000 + i)));
        throw new Error('should have thrown');
      } catch (error) {
        expect((error as DomainError).code).toBe('TOO_MANY_FACTORS');
      }
    });

    it('rejects a non-array', () => {
      try {
        parseExplainRequest(withFactors(101));
        throw new Error('should have thrown');
      } catch (error) {
        expect((error as DomainError).code).toBe('INVALID_FACTOR_IDS');
      }
    });
  });

  describe('winSaddleIds', () => {
    const withSaddles = (winSaddleIds: unknown) => {
      const request = valid();
      request.parents[0].winSaddleIds = winSaddleIds;
      return request;
    };

    it('rejects a repeated saddle id', () => {
      // A veteran wins each race at most once, and a repeat would misstate
      // which G1s two members actually share.
      try {
        parseExplainRequest(withSaddles([10, 11, 10]));
        throw new Error('should have thrown');
      } catch (error) {
        expect((error as DomainError).code).toBe('DUPLICATE_WIN_SADDLE_ID');
      }
    });

    it('rejects a list longer than any ancestor can carry', () => {
      try {
        parseExplainRequest(withSaddles(Array.from({ length: 129 }, (_, i) => i + 1)));
        throw new Error('should have thrown');
      } catch (error) {
        expect((error as DomainError).code).toBe('TOO_MANY_WIN_SADDLES');
      }
    });
  });

  describe('masterHash', () => {
    const digest = 'a'.repeat(64);

    it('accepts a sha256 hex digest', () => {
      expect(parseExplainRequest({ ...valid(), masterHash: digest }).masterHash).toBe(digest);
    });

    it('refuses anything that is not one', () => {
      // The field exists to be compared against a digest, so an arbitrary
      // string bounded only by the body limit is not validation.
      for (const bad of ['', 'not-a-hash', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 12345]) {
        try {
          parseExplainRequest({ ...valid(), masterHash: bad });
          throw new Error('should have thrown');
        } catch (error) {
          expect((error as DomainError).code, String(bad)).toBe('INVALID_MASTER_HASH');
        }
      }
    });
  });

  describe('assertMasterHashCurrent', () => {
    const current = 'b'.repeat(64);

    it('answers a request that pins the extract actually being served', () => {
      expect(() => assertMasterHashCurrent(current, current)).not.toThrow();
    });

    it('answers a request that pins nothing', () => {
      // The field is optional; omitting it means "whatever you have".
      expect(() => assertMasterHashCurrent(undefined, current)).not.toThrow();
    });

    it('refuses a request pinned to a different extract, with 409', () => {
      // A game patch moves affinity between EXISTING characters, so answering
      // would mean returning numbers from a different version of the game.
      const stale = 'c'.repeat(64);
      try {
        assertMasterHashCurrent(stale, current);
        throw new Error('should have thrown');
      } catch (error) {
        const domain = error as DomainError;
        expect(domain.code).toBe('STALE_MASTER_HASH');
        expect(domain.status).toBe(409);
        expect(domain.field).toBe('masterHash');
        // Names both digests so the client can see which is which.
        expect(domain.message).toContain(stale.slice(0, 12));
        expect(domain.message).toContain(current.slice(0, 12));
      }
    });
  });
});
