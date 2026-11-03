import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RosterMemberInput, RosterVeteranInput } from '@umalegacies/types';
import { extractMaster, findExtract } from '../master/master-extract.js';
import { resolveRoster, traineeOptions } from './roster.js';

const master = extractMaster();

/** Oguri Cap has two cards, Silence Suzuka one. That asymmetry is under test. */
const OGURI_STARLIGHT = 100601;
const OGURI_ASHEN = 100602;
const SUZUKA = 100201;

const SPEED_1 = 101; // group 1, 1 star
const STAMINA_1 = 201; // group 2, 1 star
const POWER_1 = 301; // group 3, 1 star

const member = (cardId: number, factorIds: number[] = []): RosterMemberInput => ({
  cardId,
  winSaddleIds: [],
  factorIds,
});

const veteran = (
  score: number,
  self: RosterMemberInput,
  parents: [RosterMemberInput | null, RosterMemberInput | null] = [null, null],
): RosterVeteranInput => ({ score, self, parents });

describe('resolveRoster: who each veteran is', () => {
  it('names a veteran and its own two parents', () => {
    const { veterans } = resolveRoster(
      [veteran(100, member(OGURI_STARLIGHT), [member(SUZUKA), member(OGURI_ASHEN)])],
      master,
    );
    const only = veterans[0]!;
    expect(only.self.name).toBe('Oguri Cap');
    expect(only.parents.map((p) => p?.name)).toEqual(['Silence Suzuka', 'Oguri Cap']);
    expect(only.ok).toBe(true);
  });

  it('tags a costume only where the character has more than one card', () => {
    // Most cards need the tag. On the rest it would be noise on every
    // row, and a row is 52px with four other things competing for it.
    const { veterans } = resolveRoster(
      [
        veteran(100, member(OGURI_STARLIGHT)),
        veteran(90, member(OGURI_ASHEN)),
        veteran(80, member(SUZUKA)),
      ],
      master,
    );
    const byCard = new Map(veterans.map((v) => [v.self.cardId, v.self.costume]));
    expect(byCard.get(OGURI_STARLIGHT)).toBe('[Starlight Beat]');
    expect(byCard.get(OGURI_ASHEN)).toBe('[Ashen Miracle]');
    expect(byCard.get(SUZUKA)).toBeNull();
  });

  it('preserves request order, because index is the browser\'s join key', () => {
    // The browser keeps the slimmed roster it sent and hands a package back to
    // explain-pair by index. Reordering here would pair display row N with a
    // different request entry, silently. Display order is the list's business.
    const { veterans } = resolveRoster(
      [veteran(10, member(SUZUKA)), veteran(30, member(OGURI_ASHEN)), veteran(20, member(SUZUKA))],
      master,
    );
    expect(veterans.map((v) => v.score)).toEqual([10, 30, 20]);
    expect(veterans.map((v) => v.index)).toEqual([0, 1, 2]);
  });
});

describe('resolveRoster: a row fails on its own, never the upload', () => {
  it('marks only the veteran with the unknown card, and keeps the rest usable', () => {
    // The realistic trigger: a patch adds an uma, the extract has not been
    // rebuilt, and one row in the save now names a card master.mdb has never
    // heard of. Failing the upload would brick the other 258.
    const { veterans, unresolvedCount } = resolveRoster(
      [veteran(100, member(999999)), veteran(90, member(SUZUKA))],
      master,
    );
    const broken = veterans.find((v) => v.self.cardId === 999999)!;
    const fine = veterans.find((v) => v.self.cardId === SUZUKA)!;

    expect(broken.ok).toBe(false);
    expect(broken.self.resolution).toEqual({ ok: false, reason: 'unknown_card', id: 999999 });
    // Named, not blanked: "card 999999" is a statement, an empty string is not.
    expect(broken.self.name).toBe('card 999999');
    expect(fine.ok).toBe(true);
    expect(unresolvedCount).toBe(1);
  });

  it('does not count an EMPTY parent slot as a failure', () => {
    // An absent ancestor is ordinary data the engine models deliberately. Only a
    // member that is present and unresolvable counts against the row.
    const { veterans, unresolvedCount } = resolveRoster(
      [veteran(100, member(SUZUKA), [null, null])],
      master,
    );
    expect(veterans[0]!.ok).toBe(true);
    expect(unresolvedCount).toBe(0);
  });

  it('names factor ids master.mdb has no row for rather than dropping them', () => {
    const { veterans } = resolveRoster(
      [veteran(100, member(SUZUKA, [SPEED_1, 888888]))],
      master,
    );
    expect(veterans[0]!.unknownFactorIds).toEqual([888888]);
  });
});

describe('the spark index carries both filter dimensions', () => {
  // SCOPE picks which of the three entries count; SPLIT picks max-vs-sum over
  // them. Summing at build time would answer scope and destroy split.
  const { veterans, sparkOptions } = resolveRoster(
    [
      veteran(100, member(SUZUKA, [SPEED_1]), [
        member(SUZUKA, [SPEED_1]),
        member(SUZUKA, [STAMINA_1]),
      ]),
    ],
    master,
  );
  const only = veterans[0]!;
  const group = (name: string) => sparkOptions.find((o) => o.name === name)!.groupId;
  const stars = (name: string) => only.sparks.find((s) => s.groupId === group(name))!.stars;

  it('keeps stars per member: [the veteran, its slot 10, its slot 20]', () => {
    expect(stars('Speed')).toEqual([1, 1, 0]);
    expect(stars('Stamina')).toEqual([0, 0, 1]);
  });

  it('can answer a package-scope question that a parent-scope one refuses', () => {
    const speed = stars('Speed');
    const packageTotal = speed[0] + speed[1] + speed[2];
    expect(packageTotal).toBe(2); // "2 stars of Speed anywhere in the package"
    expect(speed[0]).toBe(1); // "1 star of Speed on the direct parent"
    // And the split dimension: no single uma reaches 2, but the package does.
    expect(Math.max(...speed)).toBeLessThan(packageTotal);
  });

  it('carries no name or kind on an entry, because the catalogue holds them once', () => {
    expect(Object.keys(only.sparks[0]!).sort()).toEqual(['groupId', 'stars']);
  });
});

describe('the spark catalogue', () => {
  it('counts PACKAGES that carry a spark, not occurrences of it', () => {
    // "47 of your veterans can pass this down" is the number a user needs to
    // decide whether a criterion is worth setting. Counting carriers would say
    // 94 for the same roster and mean nothing.
    const { sparkOptions } = resolveRoster(
      [
        // One veteran carrying Speed three times over, on all three members.
        veteran(100, member(SUZUKA, [SPEED_1]), [
          member(SUZUKA, [SPEED_1]),
          member(SUZUKA, [SPEED_1]),
        ]),
        veteran(90, member(SUZUKA, [POWER_1])),
      ],
      master,
    );
    expect(sparkOptions.find((o) => o.name === 'Speed')!.veterans).toBe(1);
    expect(sparkOptions.find((o) => o.name === 'Power')!.veterans).toBe(1);
  });

  it('holds every group referenced by any veteran, so no entry is unnameable', () => {
    const { veterans, sparkOptions } = resolveRoster(
      [veteran(100, member(SUZUKA, [SPEED_1, STAMINA_1]), [member(OGURI_ASHEN, [POWER_1]), null])],
      master,
    );
    const known = new Set(sparkOptions.map((o) => o.groupId));
    for (const spark of veterans[0]!.sparks) expect(known.has(spark.groupId)).toBe(true);
  });
});

/**
 * The counts `build:master` computed from master.mdb in plain SQL.
 *
 * THESE USED TO BE LITERALS -- `toBe(112)`, `toBe(82)` -- and every patch that
 * added a card failed this file by design until someone edited them. Three data
 * PRs in a row did exactly that, and it is what stood between a game patch and
 * an automated update: a suite that fails on every new character can never go
 * green on its own. The numbers now move in `master-meta.json`, where a patch
 * shows them changing in its diff, and these tests check what they were always
 * really for: that the PICKER agrees with the DATA.
 *
 * That only works because the two sides are computed differently -- raw SQL at
 * extraction time against `traineeOptions` over the extract here -- so a picker
 * that let the placeholder cards back in, or dropped a costume, still fails.
 */
const meta = JSON.parse(
  readFileSync(new URL('../../data/master-meta.json', import.meta.url), 'utf8'),
) as {
  source: { sha256: string };
  counts: {
    playableCards: number;
    characters: number;
    charactersWithSeveralCards: number;
    ambiguousCards: number;
  };
};

describe('master-meta.json describes the extract it sits beside', () => {
  it('names the same source master.mdb as the extract header', () => {
    // Without this, a stale meta file would let the tests below pass against
    // counts from a different patch. build:master writes both, so they can only
    // disagree if one was regenerated and the other was not.
    const header = readFileSync(findExtract(), 'utf8').slice(0, 2000);
    expect(header).toContain(`source master.mdb sha256: ${meta.source.sha256}`);
  });
});

describe('the trainee picker', () => {
  const options = traineeOptions(master);

  it('offers every card, not every character, because a card is a costume', () => {
    // A costume carries its own unique skill, so the picker lists cards.
    expect(options.length).toBe(meta.counts.playableCards);
    expect(new Set(options.map((o) => o.charaId)).size).toBe(meta.counts.characters);
    expect(options.length).toBeGreaterThan(meta.counts.characters);
  });

  it('never offers the two placeholder cards', () => {
    // 9100101 and 9101101 are card_data rows with default_rarity 0 and no skill
    // set: nobody can train them. Offered, they were a second "Grass Wonder
    // [Stone-Piercing Blue]" with no portrait, and a second Special Week.
    const ids = options.map((o) => o.cardId);
    expect(ids).not.toContain(9100101);
    expect(ids).not.toContain(9101101);
    // And so no costume is listed twice. Checked as "no duplicates" rather than
    // as the exact list, which a third Grass Wonder costume would break for no
    // reason to do with placeholders.
    const grass = options.filter((o) => o.name === 'Grass Wonder').map((o) => o.costume);
    expect(grass).toContain('[Stone-Piercing Blue]');
    expect(new Set(grass).size).toBe(grass.length);
  });

  it('marks every card whose bare name is ambiguous, and only those', () => {
    expect(options.filter((o) => o.ambiguous).length).toBe(meta.counts.ambiguousCards);
    expect(new Set(options.filter((o) => o.ambiguous).map((o) => o.charaId)).size).toBe(
      meta.counts.charactersWithSeveralCards,
    );
    // Both of Oguri Cap's known costumes, tagged. `toContain` rather than the
    // exact list: a third costume should add a row here, not fail the test.
    const oguri = options.filter((o) => o.name === 'Oguri Cap');
    expect(oguri.map((o) => o.costume)).toEqual(
      expect.arrayContaining(['[Starlight Beat]', '[Ashen Miracle]']),
    );
    expect(oguri.every((o) => o.ambiguous)).toBe(true);
  });

  it('leaves a single-card character untagged', () => {
    const suzuka = options.find((o) => o.cardId === SUZUKA)!;
    expect(suzuka.ambiguous).toBe(false);
    expect(suzuka.costume).toBeNull();
  });

  it('gives every option a real name', () => {
    // A picker row reading "chara 1234" is a lookup failure wearing a label.
    expect(options.every((o) => !/^chara \d+$/.test(o.name))).toBe(true);
  });
});
