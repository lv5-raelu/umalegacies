import { describe, expect, it } from 'vitest';
import { DomainError } from '../common/error-response.js';
import { extractHash, extractMaster } from '../master/master-extract.js';
import { explainLineage } from './lineage.js';
import { parseExplainPairRequest, parseExplainRequest } from './validate.js';

const master = extractMaster();
const hash = extractHash();
const ancestor = { cardId: 100201, winSaddleIds: [] };
const pkg = { self: ancestor, parents: [null, null] };
const body = (over: Record<string, unknown> = {}) => ({
  traineeCharaId: 1006,
  veteranA: pkg,
  veteranB: pkg,
  ...over,
});

const codeOf = (parse: () => unknown): string => {
  try {
    parse();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return 'NO_ERROR';
};

describe('parseExplainPairRequest', () => {
  it('accepts a well-formed pair', () => {
    const parsed = parseExplainPairRequest(body());
    expect(parsed.traineeCharaId).toBe(1006);
    expect(parsed.veteranA.self.cardId).toBe(100201);
  });

  it.each([
    ['a non-object body', null, 'INVALID_BODY'],
    ['a missing veteran', body({ veteranB: undefined }), 'INVALID_VETERAN'],
    ['a veteran that is an array', body({ veteranA: [] }), 'INVALID_VETERAN'],
    ['a veteran with no self', body({ veteranA: { parents: [null, null] } }), 'MISSING_ANCESTOR'],
    [
      'a parents array of the wrong length',
      body({ veteranA: { self: ancestor, parents: [null] } }),
      'INVALID_VETERAN_PARENTS',
    ],
    ['a non-integer traineeCharaId', body({ traineeCharaId: 'oguri' }), 'INVALID_FIELD'],
    ['a non-integer traineeCardId', body({ traineeCardId: 1.5 }), 'INVALID_FIELD'],
    ['a masterHash that is not a digest', body({ masterHash: 'nope' }), 'INVALID_MASTER_HASH'],
  ])('rejects %s', (_label, input, code) => {
    expect(codeOf(() => parseExplainPairRequest(input))).toBe(code);
  });

  it('allows a veteran with one empty parent slot', () => {
    const parsed = parseExplainPairRequest(
      body({ veteranA: { self: ancestor, parents: [ancestor, null] } }),
    );
    expect(parsed.veteranA.parents[1]).toBeNull();
  });
});

describe('traineeCardId: the costume being trained', () => {
  const lineage = (traineeCardId?: number) =>
    explainLineage(
      {
        traineeCharaId: 1006,
        ...(traineeCardId === undefined ? {} : { traineeCardId }),
        parents: [ancestor, ancestor],
        grandparents: [null, null, null, null],
      },
      master,
      hash,
    );

  it('is optional on an ExplainRequest, and absent falls back to the base costume', () => {
    expect(parseExplainRequest({
      traineeCharaId: 1006,
      parents: [ancestor, ancestor],
      grandparents: [null, null, null, null],
    }).traineeCardId).toBeUndefined();
    expect(lineage().trainee.portraitCardId).toBe(100601);
  });

  it('draws the costume the request names', () => {
    expect(lineage(100602).trainee.portraitCardId).toBe(100602);
  });

  it('changes no computed number, because the trainee carries no sparks', () => {
    const base = lineage();
    const costumed = lineage(100602);
    expect(costumed.pairTotal.value).toBe(base.pairTotal.value);
    expect(costumed.sparks).toEqual(base.sparks);
  });

  it("REFUSES a card belonging to a different character", () => {
    // Not an approximation -- somebody else's face over this lineage's numbers.
    // Drawing one character's art above another's affinity is exactly the bug
    // that made portraits key on card_id rather than chara_id.
    expect(codeOf(() => lineage(100201))).toBe('TRAINEE_CARD_MISMATCH');
  });

  it('falls back rather than failing when the extract has never heard of the card', () => {
    // A patch added a costume and the extract has not been rebuilt. The
    // character is still who they say they are, so this is the same blessed
    // approximation as omitting the field.
    expect(lineage(9999999).trainee.portraitCardId).toBe(100601);
  });
});
