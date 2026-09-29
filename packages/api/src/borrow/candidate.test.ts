import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { isLegalPair, pickBlock, MasterData } from '@umalegacies/core';
import { readFileSync } from 'node:fs';
import { findExtract, readTables } from '../master/master-extract.js';
import { packageFromRecord } from './record.js';
import { BORROWED_PREFIX, borrowedCandidates } from './candidate.js';
import { BORROWED_RECORD } from './fixture.js';

/**
 * The rules of the game, reaching a half the user does not own.
 *
 * Every assertion here is against the REAL master extract, because the one
 * thing that makes a borrowed half legal or illegal is a card-to-character
 * lookup, and a stubbed lookup would test the stub.
 */

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(findExtract(), 'utf8'));
const master = new MasterData(readTables(db));

const OGURI_CAP_CARD = 100601;
const OGURI_CAP = master.charaIdFor(OGURI_CAP_CARD) as number;
const SYMBOLI_RUDOLF_CARD = 100301;

const borrowed = (cardId: number) =>
  packageFromRecord({ inheritance: { ...BORROWED_RECORD, main_parent_id: cardId } });

const candidatesFor = (...cardIds: number[]) =>
  borrowedCandidates(
    cardIds.map((id) => borrowed(id) as NonNullable<ReturnType<typeof borrowed>>),
    master,
  );

describe('a borrowed half carries what the rules read', () => {
  it('resolves the character behind the card, because a card is a costume', () => {
    const [one] = candidatesFor(OGURI_CAP_CARD);
    expect(one?.self.charaId).toBe(OGURI_CAP);
    // ...and keeps the package the engine scores, untouched.
    expect(one?.package.self.cardId).toBe(OGURI_CAP_CARD);
  });

  it('leaves an unresolvable card null rather than dropping the candidate', () => {
    // A patch landing before the extract is rebuilt. Refusing the pair would
    // punish the reader for a stale extract rather than for the pairing.
    const [one] = candidatesFor(999999);
    expect(one?.self.charaId).toBeNull();
    expect(one?.package).toBeDefined();
  });
});

describe('the rules the first live run did not enforce', () => {
  it('refuses a borrowed parent who IS the trainee', () => {
    // 52 of 150 naive pairs failed exactly this, and they were winning.
    const [a, b] = candidatesFor(OGURI_CAP_CARD, SYMBOLI_RUDOLF_CARD);
    expect(isLegalPair(a!, b!, OGURI_CAP)).toBe(false);
  });

  it('refuses two borrowed parents of the same character in different costumes', () => {
    // Two cards, one character. Card equality would wave this straight through,
    // which is why every comparison is by charaId.
    const other = master
      .allCards()
      .find((c) => c.charaId === OGURI_CAP && c.cardId !== OGURI_CAP_CARD);
    expect(other).toBeDefined();
    const [a, b] = candidatesFor(OGURI_CAP_CARD, other?.cardId as number);
    expect(a?.package.self.cardId).not.toBe(b?.package.self.cardId);
    expect(isLegalPair(a!, b!, null)).toBe(false);
  });

  it('allows two different characters, neither of them the trainee', () => {
    const [a, b] = candidatesFor(SYMBOLI_RUDOLF_CARD, 101001);
    expect(isLegalPair(a!, b!, OGURI_CAP)).toBe(true);
  });
});

describe('the collision this design exists to make impossible', () => {
  /*
   * THE TRAP. `PairSide.index` is an identity, and the borrow sweep compares
   * OWN veterans against BORROWED ones in the same run. Number both from 0 and
   * own veteran 5 equals borrowed veteran 5, so `isLegalPair` refuses a
   * perfectly legal pair -- silently, and only for the pairs whose numbers
   * happen to line up, which is the hardest kind of bug to notice.
   */
  const ownRow = (index: number, charaId: number | null) => ({ index, self: { charaId } });

  it('never lets a borrowed key equal a roster row’s index', () => {
    const [first] = candidatesFor(SYMBOLI_RUDOLF_CARD);
    expect(typeof first?.index).toBe('string');
    expect(first?.index).toBe(`${BORROWED_PREFIX}0`);
    // The comparison the sweep actually makes, at the position that would clash.
    expect(first?.index === 0).toBe(false);
  });

  it('pairs roster row 0 with borrowed 0 quite happily', () => {
    const [zero] = candidatesFor(SYMBOLI_RUDOLF_CARD);
    const own = ownRow(0, 1014);
    expect(isLegalPair(own, zero!, OGURI_CAP)).toBe(true);
  });

  it('still refuses one borrowed half against itself', () => {
    // The index check is what stands between `isLegalPair(v, v, t)` and true
    // when a card is unresolved, since two null charaIds are deliberately not
    // "the same character".
    const [one] = candidatesFor(999999);
    expect(isLegalPair(one!, one!, null)).toBe(false);
  });
});

describe('the screen and the sweep read one copy of the rules', () => {
  it('blocks a borrowed pick for the same reasons, by name', () => {
    // `pickBlock` answers "why can the user not click this" and `isLegalPair`
    // answers "may these two be the parents". They must never disagree.
    const [trainee, other, third] = candidatesFor(OGURI_CAP_CARD, SYMBOLI_RUDOLF_CARD, 101001);
    expect(pickBlock(trainee!, [], OGURI_CAP)).toBe('is-trainee');
    expect(pickBlock(other!, [other!], null)).toBeNull();
    expect(pickBlock(third!, [other!, trainee!], null)).toBe('pair-full');
  });
});
