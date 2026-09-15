import { useState } from 'react';
import type {
  AncestorIdentity,
  ExplainNode,
  LineageResponse,
  MasterRef,
  SparkSummaryRow,
} from '../api/types';
import { sumByRulePrefix } from './explain-node';
import { SPARK_COLOR, isWhite, percent, plural, stars } from './sparks';
import styles from './Provenance.module.css';

/**
 * The drawer every number opens onto. This is the product's single claim, so
 * the rule here is absolute: a number that cannot open says why in place,
 * rather than opening onto an empty drawer.
 */
export function LinkProvenance({ link }: { link: ExplainNode }) {
  return (
    <section className={styles.panel}>
      <h3 className={styles.heading}>{link.label}</h3>
      {link.children.map((term) => (
        <Term key={term.ruleId} node={term} />
      ))}
    </section>
  );
}

/**
 * The rule id is the single discriminant, so display text derives from it and
 * cannot drift out of sync with the rule it describes.
 */
const TERM_TITLE: Readonly<Record<string, string>> = {
  'base.two_way': 'base affinity · two-way',
  'base.three_way': 'base affinity · three-way',
  'base.self_link': 'base affinity · suppressed',
  'base.absent_ancestor': 'base affinity · empty slot',
  'bonus.shared_g1': 'bonus affinity · shared G1 wins',
  'bonus.absent_ancestor': 'bonus affinity · empty slot',
};

const termTitle = (node: ExplainNode): string => TERM_TITLE[node.ruleId] ?? node.ruleId;

function Term({ node }: { node: ExplainNode }) {
  const isBonus = node.ruleId.startsWith('bonus.');
  return (
    <div className={styles.term}>
      <div className={styles.termHead}>
        <span className={styles.termLabel}>{termTitle(node)}</span>
        <span className={isBonus ? styles.bonusValue : styles.value}>
          {isBonus && node.value > 0 ? `+${node.value}` : node.value}
        </span>
      </div>
      {node.citation && (
        <p className={styles.citation}>
          {node.citation.quote ?? node.citation.label}
          {node.citation.url && (
            <>
              {' '}
              <a href={node.citation.url} target="_blank" rel="noreferrer">
                {node.citation.label}
              </a>
            </>
          )}
        </p>
      )}
      <TermBody node={node} />
    </div>
  );
}

function TermBody({ node }: { node: ExplainNode }) {
  switch (node.ruleId) {
    case 'base.two_way':
    case 'base.three_way':
      return <RelationTotal node={node} />;
    case 'bonus.shared_g1':
      return <SharedRaces node={node} />;
    case 'base.self_link':
      return (
        <p className={styles.reason}>
          A character shares every succession relation with itself, so without this rule the base
          term would score the ancestor's whole relation list as a coincidence.
        </p>
      );
    case 'base.absent_ancestor':
    case 'bonus.absent_ancestor':
      return <p className={styles.reason}>This slot is empty, so the link contributes nothing.</p>;
    default:
      return null;
  }
}

/**
 * The base term renders as a count and a total, and does NOT expand.
 *
 * master.mdb holds no name for any of its 1,616 relation types, and only 8% of
 * the relation rows a reader actually meets can be derived from character
 * attributes. Listing 132 rows called "Relation 2601" is not provenance, it is
 * a wall. Substituting group membership was tested and dropped: the first
 * members of every large group are the same low-id characters, so three
 * different relations all render as "shared by ~50 characters incl. Special
 * Week, Silence Suzuka, Tokai Teio".
 *
 * This is not a consolation. Base affinity is a fixed property of which two
 * characters these are: the number informs which parents you pick, the reason
 * never can. Detail belongs where a decision lives, which is the bonus term.
 */
function RelationTotal({ node }: { node: ExplainNode }) {
  const rows = node.children.filter((c) => c.ruleId === 'row.relation');
  const unresolved = node.children.find((c) => c.resolution && c.resolution.ok === false);

  if (unresolved && unresolved.resolution?.ok === false) {
    return (
      <p className={styles.unresolved}>
        could not resolve {unresolved.resolution.reason.replace(/_/g, ' ')}{' '}
        {unresolved.resolution.id}
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className={styles.reason}>They share no succession relations.</p>;
  }
  return (
    <>
      <p className={styles.sum}>
        {plural(rows.length, 'shared succession relation')} = {node.value}
      </p>
      <p className={styles.reason}>
        This does not open. <code>master.mdb</code> names none of its 1,616 relation types, and
        only the birth-month and birth-year families can be derived from character attributes, so
        every row here would read "Relation {rows[0]?.label.replace(/\D/g, '')}". The point values
        are real and cited; the reasons are not recoverable from the game's own data.
      </p>
    </>
  );
}

/** A shared G1 is something you can go and race for, so it keeps every name. */
function SharedRaces({ node }: { node: ExplainNode }) {
  const [open, setOpen] = useState(false);
  const races = node.children.filter((c) => c.ruleId === 'row.saddle');
  if (races.length === 0) {
    return <p className={styles.reason}>They share no G1 wins.</p>;
  }
  return (
    <>
      <button type="button" className={styles.expander} onClick={() => setOpen(!open)}>
        {open ? '−' : '+'} {plural(races.length, 'shared G1 win')} at +3 each
      </button>
      {open && (
        <ul className={styles.races}>
          {races.map((race) => (
            <li key={`${race.label}-${race.sources[0]?.key.id ?? ''}`}>
              <span className={styles.raceName}>{race.label}</span>
              <Sources refs={race.sources} />
              <span className={styles.bonusValue}>+{race.value}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The master rows behind a leaf, cited by NATURAL key. Never by rowid:
 * succession_relation_member.id is an arbitrary surrogate and master.mdb has no
 * version table, so a cited rowid silently rots when a patch renumbers rows.
 */
function Sources({ refs }: { refs: MasterRef[] }) {
  if (refs.length === 0) return null;
  return (
    <span className={styles.sources}>
      {refs.map((ref, i) => (
        <span key={`${ref.table}-${i}`} className={styles.source}>
          {ref.table}
          {Object.entries(ref.key).map(([k, v]) => ` ${k}=${v}`)}
        </span>
      ))}
    </span>
  );
}

/** One ancestor in full: where its affinity came from, and everything it carries. */
export function MemberProvenance({
  identity,
  affinity,
}: {
  identity: AncestorIdentity;
  affinity: ExplainNode | undefined;
}) {
  const sparks = identity.sparks;
  const named = [sparks.blue, sparks.pink, sparks.green].filter((s) => s !== null);
  const byKind = {
    white_race: sparks.whites.filter((s) => s.kind === 'white_race'),
    white_skill: sparks.whites.filter((s) => s.kind === 'white_skill'),
    white_scenario: sparks.whites.filter((s) => s.kind === 'white_scenario'),
  };

  return (
    <section className={styles.panel}>
      <h3 className={styles.heading}>
        {identity.name} <span className={styles.slot}>slot {identity.position}</span>
      </h3>

      {affinity && (
        <div className={styles.term}>
          <div className={styles.termHead}>
            <span className={styles.termLabel}>individual affinity</span>
            <span className={styles.value}>{affinity.value}</span>
          </div>
          <p className={styles.reason}>
            The sum of the links feeding this member: {affinity.children.length} of the seven. This
            is the number that scales every spark rate below.
          </p>
          <ul className={styles.addends}>
            {/* Keyed by index, NOT by label. One lineage can hold the same
                character in several slots, so two of these links genuinely
                share a label: fixture 5531 renders `El Condor Pasa <-> Inari
                One` twice with different values. React then warns that
                children may be duplicated or omitted, which in this product
                means a wrong number against a right name. The list is a fixed,
                engine-ordered set that never reorders or filters, so the index
                is a stable identity. */}
            {affinity.children.map((child, i) => (
              <li key={i}>
                <span>{child.label}</span>
                <span className={styles.value}>{child.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.term}>
        <div className={styles.termHead}>
          <span className={styles.termLabel}>inheritable sparks</span>
          <span className={styles.value}>{named.length + sparks.whites.length}</span>
        </div>
        <ul className={styles.sparkList}>
          {named.map((spark) => (
            <li key={spark.factorId} className={styles.namedSpark}>
              <i className={styles.tick} style={{ background: SPARK_COLOR[spark.kind] }} />
              <span className={styles.sparkName}>{spark.name}</span>
              <span className={styles.value}>{stars(spark.stars)}</span>
            </li>
          ))}
        </ul>
        {(['white_race', 'white_skill', 'white_scenario'] as const).map((kind) =>
          byKind[kind].length === 0 ? null : (
            <div key={kind} className={styles.whiteGroup}>
              <div className={styles.whiteHead}>
                {kind.replace('white_', 'white · ')} · {byKind[kind].length}
              </div>
              <ul className={styles.sparkList}>
                {byKind[kind].map((spark) => (
                  <li key={spark.factorId}>
                    <i
                      className={isWhite(spark.kind) ? styles.tickOutlined : styles.tick}
                      style={isWhite(spark.kind) ? undefined : { background: SPARK_COLOR[spark.kind] }}
                    />
                    <span className={styles.sparkName}>{spark.name}</span>
                    <span className={styles.value}>{stars(spark.stars)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
        {sparks.unknownFactorIds.length > 0 && (
          <p className={styles.unresolved}>
            {plural(sparks.unknownFactorIds.length, 'spark')} in this save{' '}
            {sparks.unknownFactorIds.length === 1 ? 'has' : 'have'} no row in{' '}
            <code>master.mdb</code>: {sparks.unknownFactorIds.join(', ')}. The extract is probably
            older than the save.
          </p>
        )}
      </div>
    </section>
  );
}

/** One spark across the lineage: who carries it, and the arithmetic behind its odds. */
export function SparkProvenance({ row }: { row: SparkSummaryRow }) {
  return (
    <section className={styles.panel}>
      <h3 className={styles.heading}>
        <i
          className={isWhite(row.kind) ? styles.tickOutlined : styles.tick}
          style={isWhite(row.kind) ? undefined : { background: SPARK_COLOR[row.kind] }}
        />
        {row.name} <span className={styles.slot}>{row.stars}★ across the lineage</span>
      </h3>

      <div className={styles.term}>
        <div className={styles.termHead}>
          <span className={styles.termLabel}>at least once in a career</span>
          <span className={styles.value}>{percent(row.onceInCareer)}</span>
        </div>
        <p className={styles.reason}>
          Each carrier activates at <code>base rate × (1 + individual affinity / 100)</code>,
          capped at 100%. Inspiration fires twice per career, and within one firing every carrier
          rolls independently, so the count is a Poisson-binomial over the carriers and the career
          is that distribution against itself. At least twice: {percent(row.twiceInCareer)}.
        </p>
        <table className={styles.carriers}>
          <thead>
            <tr>
              <th>SLOT</th>
              <th>STARS</th>
              <th className={styles.numeric}>BASE</th>
              <th className={styles.numeric}>AFFINITY</th>
              <th className={styles.numeric}>PER FIRING</th>
            </tr>
          </thead>
          <tbody>
            {row.carriers.map((carrier) => (
              <tr key={carrier.position}>
                <td>{carrier.position}</td>
                <td>{stars(carrier.stars)}</td>
                <td className={styles.numeric}>{percent(carrier.baseRate)}</td>
                <td className={styles.numeric}>{carrier.individualAffinity}</td>
                <td className={styles.numeric}>
                  {carrier.perInspiration >= 1 ? '100%' : percent(carrier.perInspiration)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The pair total, and the seven links that make it. */
export function TotalProvenance({ lineage }: { lineage: LineageResponse }) {
  const base = sumByRulePrefix(lineage.pairTotal, 'base.');
  const bonus = sumByRulePrefix(lineage.pairTotal, 'bonus.');
  return (
    <section className={styles.panel}>
      <h3 className={styles.heading}>
        {lineage.trainee.name} <span className={styles.slot}>pair total</span>
      </h3>
      <div className={styles.term}>
        <div className={styles.termHead}>
          <span className={styles.termLabel}>
            7 base links + 5 bonus links = {base} + {bonus}
          </span>
          <span className={styles.value}>{lineage.pairTotal.value}</span>
        </div>
        <p className={styles.reason}>
          The two trainee-parent links carry no bonus term. Bonus affinity is +3 per G1 win shared
          between two members that have both raced, and the trainee has not raced yet, so a
          uniform 7 × {'{'}base, bonus{'}'} tree would produce two nodes that can never be
          non-zero.
        </p>
        <ul className={styles.addends}>
          {/* Keyed by index for the same reason as the addends above: the
              seven links are emitted in a fixed order and two of them can
              share a label. */}
          {lineage.pairTotal.children.map((link, i) => (
            <li key={i}>
              <span>{link.label}</span>
              <span className={styles.value}>{link.value}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.term}>
        <div className={styles.termHead}>
          <span className={styles.termLabel}>
            relation rank · {lineage.rankBounds.min}
            {lineage.rankBounds.max >= 9999 ? '+' : `–${lineage.rankBounds.max}`}
          </span>
          <span className={styles.value}>{lineage.relationRank.value}</span>
        </div>
        <p className={styles.reason}>
          A lookup rather than a sum, which is why it is the one number on this screen that does
          not carry addends.
        </p>
        <Sources refs={lineage.relationRank.sources} />
      </div>
    </section>
  );
}

