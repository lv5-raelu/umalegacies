import type { MasterData } from '../master/master-data.js';
import { RULE_CITATIONS } from './citations.js';
import { positionLabel } from './positions.js';
import {
  ALL_POSITIONS,
  GRANDPARENT_POSITIONS,
  PARENT_OF,
  PARENT_POSITIONS,
  type AncestorRef,
  type ExplainNode,
  type ExplainRequest,
  type ExplainResponse,
  type MasterRef,
  type Position,
  type Resolution,
} from './types.js';

/** +3 per shared G1 win, to both members. */
const BONUS_PER_SHARED_G1 = 3;

/** The trainee is not a position; it is the root the whole lineage hangs off. */
type Member = Position | 'T';

interface Resolved {
  position: Position;
  ref: AncestorRef;
  /** null when card_data has no such card. */
  charaId: number | null;
  label: string;
}

/**
 * The seven links. Five carry a bonus term; the two trainee-parent links do
 * not, because bonus affinity is +3 per G1 shared between two members that
 * have BOTH raced and the trainee has not. A uniform 7 x {base, bonus} tree
 * produces two nodes that can never be non-zero. Domain Model Correction 1.
 */
interface Link {
  a: Member;
  b: Member;
  hasBonus: boolean;
}

const LINKS: readonly Link[] = [
  { a: 'T', b: 10, hasBonus: false },
  { a: 'T', b: 20, hasBonus: false },
  { a: 10, b: 20, hasBonus: true },
  { a: 10, b: 11, hasBonus: true },
  { a: 10, b: 12, hasBonus: true },
  { a: 20, b: 21, hasBonus: true },
  { a: 20, b: 22, hasBonus: true },
];

export function explain(
  request: ExplainRequest,
  master: MasterData,
  masterHash: string,
): ExplainResponse {
  const traineeId = request.traineeCharaId;
  const traineeLabel = master.charaName(traineeId);

  const resolved = new Map<Position, Resolved>();
  for (const [i, position] of PARENT_POSITIONS.entries()) {
    const ref = request.parents[i] as AncestorRef;
    resolved.set(position, resolveAncestor(position, ref, master));
  }
  for (const [i, position] of GRANDPARENT_POSITIONS.entries()) {
    const ref = request.grandparents[i] ?? null;
    if (ref) resolved.set(position, resolveAncestor(position, ref, master));
  }

  const nameOf = (m: Member): string =>
    m === 'T' ? traineeLabel : (resolved.get(m)?.label ?? positionLabel(m));

  // Every label a reader sees carries the SLOT as well as the name, because a
  // name alone is not unique within one lineage: fixture 5531 holds the same
  // character in several slots, so `El Condor Pasa <-> Inari One` names two
  // different links with two different values.
  const labelOf = (m: Member): string => `${nameOf(m)} (${positionLabel(m)})`;

  // Build each link once. The same node object is referenced by pairTotal and
  // by the individualAffinity trees of both its members; it serialises as a
  // copy in each, which is what the client wants to render.
  const linkNodes = new Map<Link, ExplainNode>();
  for (const link of LINKS) {
    linkNodes.set(
      link,
      buildLink(link, traineeId, resolved, master, labelOf),
    );
  }

  const pairTotal = sumNode(
    'total.pair',
    `${traineeLabel}: pair total`,
    LINKS.map((l) => linkNodes.get(l) as ExplainNode),
  );

  const individualAffinity: Record<number, ExplainNode> = {};
  for (const position of ALL_POSITIONS) {
    // Emitted for every slot including absent ones, so box browse can render a
    // uniform six-slot tree rather than a ragged one.
    const feeding = LINKS.filter((l) => l.a === position || l.b === position);
    individualAffinity[position] = sumNode(
      'individual.member',
      `${labelOf(position)}: individual affinity`,
      feeding.map((l) => linkNodes.get(l) as ExplainNode),
    );
  }

  const rank = master.rankFor(pairTotal.value);

  return {
    pairTotal,
    individualAffinity,
    relationRank: {
      value: rank.relation_rank,
      ruleId: 'rank.lookup',
      sources: [
        {
          table: 'succession_relation_rank',
          key: { relation_rank: rank.relation_rank },
          columns: {
            rank_value_min: rank.rank_value_min,
            rank_value_max: rank.rank_value_max,
          },
        },
      ],
    },
    rankBounds: { min: rank.rank_value_min, max: rank.rank_value_max },
    masterHash,
  };
}

function resolveAncestor(
  position: Position,
  ref: AncestorRef,
  master: MasterData,
): Resolved {
  const charaId = master.charaIdFor(ref.cardId);
  return {
    position,
    ref,
    charaId,
    label: charaId === null ? `unknown card ${ref.cardId}` : master.charaName(charaId),
  };
}

function buildLink(
  link: Link,
  traineeId: number,
  resolved: Map<Position, Resolved>,
  master: MasterData,
  labelOf: (m: Member) => string,
): ExplainNode {
  const label = `${labelOf(link.a)} <-> ${labelOf(link.b)}`;
  const children: ExplainNode[] = [buildBase(link, traineeId, resolved, master, labelOf)];
  if (link.hasBonus) {
    children.push(buildBonus(link, resolved, master, labelOf));
  }
  return sumNode('link.pair', label, children);
}

function buildBase(
  link: Link,
  traineeId: number,
  resolved: Map<Position, Resolved>,
  master: MasterData,
  labelOf: (m: Member) => string,
): ExplainNode {
  const isThreeWay = link.a !== 'T' && link.b !== 'T' && link.b in PARENT_OF;

  // An absent grandparent kills both terms, so the link contributes two zero
  // nodes and the sum invariant still holds.
  const bSlot = link.b === 'T' ? null : resolved.get(link.b);
  if (link.b !== 'T' && !bSlot) {
    return leaf('base.absent_ancestor', `No ancestor in slot ${link.b}`, 0);
  }

  const charas: Array<{ member: Member; charaId: number | null }> = [];
  charas.push({
    member: link.a,
    charaId: link.a === 'T' ? traineeId : (resolved.get(link.a)?.charaId ?? null),
  });
  charas.push({ member: link.b, charaId: bSlot ? bSlot.charaId : traineeId });
  if (isThreeWay) {
    // The trainee is the third member of a parent-grandparent link.
    charas.unshift({ member: 'T', charaId: traineeId });
  }

  // A card_data miss is a lookup failure, not a zero. Say so.
  for (const { member, charaId } of charas) {
    if (charaId === null) {
      const slot = resolved.get(member as Position);
      return leaf(
        isThreeWay ? 'base.three_way' : 'base.two_way',
        `${labelOf(link.a)} <-> ${labelOf(link.b)}`,
        0,
        { ok: false, reason: 'unknown_card', id: slot?.ref.cardId ?? 0 },
      );
    }
  }

  const ids = charas.map((c) => c.charaId as number);

  // Self-link: a grandparent who IS the trainee loses this base term. The
  // bonus term on the same link survives, which is the whole signature of
  // fixture 5774.
  if (isThreeWay && ids[0] === ids[ids.length - 1]) {
    return leaf(
      'base.self_link',
      `${labelOf(link.a)} <-> ${labelOf(link.b)}: base suppressed, ` +
        `the grandparent is the trainee`,
      0,
    );
  }

  const missing = charas.find(({ charaId }) => !master.hasChara(charaId as number));
  if (missing) {
    return leaf(
      isThreeWay ? 'base.three_way' : 'base.two_way',
      `${labelOf(link.a)} <-> ${labelOf(link.b)}`,
      0,
      { ok: false, reason: 'no_relation_rows', id: missing.charaId as number },
    );
  }

  const shared = intersect(ids.map((id) => master.relationTypesOf(id)));
  const rows: ExplainNode[] = [...shared]
    .sort((x, y) => x - y)
    .map((relationType) => {
      const point = master.relationPointOf(relationType);
      const sources: MasterRef[] = [
        {
          // relation_point lives HERE, not on the member table. A record citing
          // only membership shows that they share something and not what the
          // number is. Domain Model Correction 2.
          table: 'succession_relation',
          key: { relation_type: relationType },
          columns: { relation_point: point },
        },
        ...ids.map(
          (charaId): MasterRef => ({
            table: 'succession_relation_member',
            key: { relation_type: relationType, chara_id: charaId },
            columns: { chara_id: charaId },
          }),
        ),
      ];
      return {
        ruleId: 'row.relation' as const,
        label: `Relation ${relationType}`,
        value: point,
        sources,
        children: [],
        resolution: { ok: true } as Resolution,
      };
    });

  return sumNode(
    isThreeWay ? 'base.three_way' : 'base.two_way',
    `${labelOf(link.a)} <-> ${labelOf(link.b)}: base`,
    rows,
  );
}

function buildBonus(
  link: Link,
  resolved: Map<Position, Resolved>,
  master: MasterData,
  labelOf: (m: Member) => string,
): ExplainNode {
  const a = link.a === 'T' ? null : resolved.get(link.a);
  const b = link.b === 'T' ? null : resolved.get(link.b);
  if (!a || !b) {
    return leaf('bonus.absent_ancestor', `No ancestor in slot ${link.b}`, 0);
  }

  // RAW id intersection. Normalising to group_id here would count JBC Classic
  // at one racecourse as the same win as JBC Classic at another, and they are
  // different wins. Verified 2026-09-10.
  const bWins = new Set(b.ref.winSaddleIds);
  const sharedRaw = [...new Set(a.ref.winSaddleIds)]
    .filter((id) => bWins.has(id))
    .sort((x, y) => x - y);

  const rows: ExplainNode[] = [];
  for (const saddleId of sharedRaw) {
    if (!master.knowsSaddle(saddleId)) {
      // Both ancestors claim this win and master.mdb has never heard of it.
      // Worth 0, but say why rather than dropping it silently.
      rows.push(
        leaf('row.saddle', `Unknown saddle ${saddleId}`, 0, {
          ok: false,
          reason: 'unknown_saddle',
          id: saddleId,
        }),
      );
      continue;
    }
    if (!master.isG1(saddleId)) continue; // G2, G3 and epithets do not count.
    rows.push({
      ruleId: 'row.saddle',
      label: master.saddleName(saddleId),
      value: BONUS_PER_SHARED_G1,
      sources: [
        {
          table: 'single_mode_wins_saddle',
          key: { id: saddleId },
          columns: {
            win_saddle_type: 3,
            group_id: master.groupIdOf(saddleId) ?? -1,
          },
        },
      ],
      children: [],
      resolution: { ok: true },
    });
  }

  return sumNode(
    'bonus.shared_g1',
    `${labelOf(link.a)} <-> ${labelOf(link.b)}: shared G1 wins`,
    rows,
  );
}

/** A node whose value IS the sum of its children, by construction. */
function sumNode(
  ruleId: ExplainNode['ruleId'],
  label: string,
  children: ExplainNode[],
): ExplainNode {
  const node: ExplainNode = {
    ruleId,
    label,
    value: children.reduce((total, child) => total + child.value, 0),
    sources: [],
    children,
  };
  const citation = RULE_CITATIONS[ruleId];
  if (citation) node.citation = citation;
  return node;
}

function leaf(
  ruleId: ExplainNode['ruleId'],
  label: string,
  value: number,
  resolution?: Resolution,
): ExplainNode {
  const node: ExplainNode = { ruleId, label, value, sources: [], children: [] };
  const citation = RULE_CITATIONS[ruleId];
  if (citation) node.citation = citation;
  if (resolution) node.resolution = resolution;
  return node;
}

function intersect(sets: ReadonlySet<number>[]): Set<number> {
  const [first, ...rest] = sets;
  if (!first) return new Set();
  const out = new Set<number>();
  for (const value of first) {
    if (rest.every((s) => s.has(value))) out.add(value);
  }
  return out;
}

/** Walks a tree and returns every node whose value disagrees with its children. */
export function findSumViolations(
  node: ExplainNode,
  path = 'root',
): Array<{ path: string; value: number; childSum: number }> {
  const out: Array<{ path: string; value: number; childSum: number }> = [];
  if (node.children.length > 0) {
    const childSum = node.children.reduce((t, c) => t + c.value, 0);
    if (childSum !== node.value) {
      out.push({ path, value: node.value, childSum });
    }
  }
  for (const [i, child] of node.children.entries()) {
    out.push(...findSumViolations(child, `${path}/${child.ruleId}[${i}]`));
  }
  return out;
}
