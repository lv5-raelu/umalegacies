import type {
  AncestorSparkSet,
  PackageSpark,
  ResolvedMember,
  ResolvedVeteran,
  RosterMemberInput,
  RosterSparkOption,
  RosterVeteranInput,
  TraineeOption,
} from '@umalegacies/types';
import { allSparks, ancestorSparks, type MasterData, SPARK_KIND_ORDER } from '@umalegacies/core';

/** A member as the response describes it, beside the sparks used to build it. */
interface Member {
  identity: ResolvedMember;
  sparks: AncestorSparkSet;
}

/**
 * What the save means, once master.mdb has been asked.
 *
 * The browser has already thrown away everything personal before calling here
 * (see RosterMemberInput), so this function never sees a trainer id, a nickname
 * or a timestamp. It takes ids and returns names, costumes and sparks, and it
 * keeps nothing: the resolved roster lives in the response and in the tab that
 * asked for it, and nowhere else.
 */
export function resolveRoster(
  input: readonly RosterVeteranInput[],
  master: MasterData,
): {
  veterans: ResolvedVeteran[];
  sparkOptions: RosterSparkOption[];
  unresolvedCount: number;
} {
  const catalogue = new Map<number, RosterSparkOption>();

  const resolved = input.map((veteran, index): ResolvedVeteran => {
    const members: Array<Member | null> = [
      resolveMember(veteran.self, master),
      veteran.parents[0] ? resolveMember(veteran.parents[0], master) : null,
      veteran.parents[1] ? resolveMember(veteran.parents[1], master) : null,
    ];
    const self = members[0] as Member;

    return {
      index,
      score: veteran.score,
      self: self.identity,
      parents: [members[1]?.identity ?? null, members[2]?.identity ?? null],
      sparks: packageSparks(members, catalogue),
      unknownFactorIds: [...new Set(members.flatMap((m) => m?.sparks.unknownFactorIds ?? []))],
      // A missing parent slot is ordinary data, not a failure: the engine models
      // an absent ancestor deliberately. Only a member that IS present and could
      // not be resolved counts against the row.
      ok: members.every((m) => m === null || m.identity.resolution.ok),
    };
  });

  // REQUEST ORDER IS PRESERVED, deliberately, and `index` is the position in it.
  //
  // Sorting here was the obvious thing and it was wrong: the browser keeps the
  // slimmed roster it sent, and picking a veteran means handing that package
  // back to explain-pair. `index` is the only thing joining the two, so a
  // server-side reorder would silently pair display row N with request entry N
  // of a different ordering. Display order is the list's business and it sorts
  // by score there.

  return {
    veterans: resolved,
    // Kind first, then THE GAME'S OWN ORDER within a kind.
    //
    // `factor_group_id` is monotonic with `factor_id` across all 392 groups
    // (checked, not assumed), and factor_id order is the order the game itself
    // uses: Speed, Stamina, Power, Guts, Wit for the blues; Turf, Dirt, Front
    // Runner, Pace Chaser, Late Surger, End Closer, Sprint, Mile, Medium, Long
    // for the pinks; and for the whites, skills before races before scenarios,
    // with the skills in the order a veteran's own skill list shows them.
    //
    // It replaces a sort by carrier count then name, which put a spark wherever
    // this particular roster happened to put it -- so the same list reordered
    // itself between two saves, and matched nothing the player had memorised.
    sparkOptions: [...catalogue.values()].sort(
      (a, b) =>
        SPARK_KIND_ORDER.indexOf(a.kind) - SPARK_KIND_ORDER.indexOf(b.kind) ||
        a.groupId - b.groupId,
    ),
    unresolvedCount: resolved.filter((v) => !v.ok).length,
  };
}

function resolveMember(input: RosterMemberInput, master: MasterData): Member {
  const charaId = master.charaIdFor(input.cardId);
  return {
    identity: {
      cardId: input.cardId,
      charaId,
      name: charaId === null ? `card ${input.cardId}` : master.charaName(charaId),
      costume: master.costumeLabel(input.cardId),
      resolution:
        charaId === null
          ? { ok: false, reason: 'unknown_card', id: input.cardId }
          : { ok: true },
    },
    // An unresolved card still gets a spark set: its factor ids are the save's
    // and master.mdb knows them regardless of whether it knows the card.
    sparks: ancestorSparks(input, master),
  };
}

/**
 * Every distinct spark in one veteran's package, kept PER MEMBER, and the
 * catalogue entry for each one.
 *
 * `stars` is [the veteran, its slot 10, its slot 20] and stays that way: it is
 * not summed here, because summing would collapse the two filter dimensions into
 * one. A criterion asking "6 stars of Stamina anywhere in the package" and one
 * asking "3 stars of Stamina on the direct parent" read the same three numbers
 * differently, and M7's borrow search needs both.
 *
 * Names and kinds go into `catalogue` rather than onto every entry. One veteran
 * carries around 27 distinct sparks and there are 259 of them, so repeating a
 * name per occurrence is ~7,000 copies of 297 strings.
 */
function packageSparks(
  members: ReadonlyArray<Member | null>,
  catalogue: Map<number, RosterSparkOption>,
): PackageSpark[] {
  const byGroup = new Map<number, PackageSpark>();

  members.forEach((member, slot) => {
    if (!member) return;
    for (const spark of allSparks(member.sparks)) {
      let entry = byGroup.get(spark.groupId);
      if (!entry) {
        entry = { groupId: spark.groupId, stars: [0, 0, 0] };
        byGroup.set(spark.groupId, entry);
      }
      // Additive rather than assigned: one uma carrying two factor ids of the
      // same group has never been observed, but losing stars silently would be
      // worse than showing a total nobody expected.
      entry.stars[slot] = (entry.stars[slot] as number) + spark.stars;

      const known = catalogue.get(spark.groupId);
      if (!known) {
        catalogue.set(spark.groupId, {
          groupId: spark.groupId,
          kind: spark.kind,
          name: spark.name,
          // Counted once per PACKAGE below, not once per occurrence.
          veterans: 0,
        });
      }
    }
  });

  // "47 of your veterans can pass this down" is the number that tells a user
  // whether a criterion is worth setting, so count packages, not carriers.
  for (const groupId of byGroup.keys()) {
    const entry = catalogue.get(groupId);
    if (entry) entry.veterans += 1;
  }

  return [...byGroup.values()].sort((a, b) => a.groupId - b.groupId);
}

/**
 * Every trainable card, for the trainee picker.
 *
 * Sourced from master.mdb and not from the save: you train whoever you like, not
 * only characters you already own. Keyed by CARD, because a card is a costume
 * and a costume carries its own unique skill -- so "Oguri Cap" is three
 * different green sparks and an unlabelled list would show the name three times
 * identically.
 */
export function traineeOptions(master: MasterData): TraineeOption[] {
  return master
    .allCards()
    .map(({ cardId, charaId }) => ({
      cardId,
      charaId,
      name: master.charaName(charaId),
      costume: master.costumeLabel(cardId),
      ambiguous: master.hasMultipleCards(charaId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.cardId - b.cardId);
}
