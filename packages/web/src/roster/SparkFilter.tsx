import type { FilterScope, RosterSparkOption, SparkCriterion, SparkKind } from '@umalegacies/types';
import { isWhite, isRequirement, maxStarsFor, type StarSubject } from '@umalegacies/core';
import { SparkPicker } from './SparkPicker';
import styles from './Controls.module.css';

const SCOPE_LABEL: Readonly<Record<FilterScope, string>> = {
  package: 'across the lineage',
  parent: 'on the parent',
};

/**
 * As many criteria as the user wants, and a veteran must satisfy ALL of them.
 *
 * AND rather than OR, because "who can give me the blue I need AND a decent
 * pink" is the question a pair is chosen to answer; an OR over the same rows is
 * the weaker query, already available by filtering one spark at a time. It is
 * also what the design doc specifies for M7's hard constraints, so the list
 * filter and the eventual pair search agree by construction.
 *
 * EVERY ROW IS THE SAME CONTROL. What used to be the whole filter is now one
 * row, and the empty picker at the end adds another -- so the shape people
 * already know did not change, it repeated. Each row carries its own scope,
 * because "6 Stamina across the lineage" and "2 Medium on the parent" is a
 * normal pair of requirements and forcing them to share a scope would make the
 * second one unaskable.
 *
 * It sits BELOW the trainee picker, not above it, because the working set
 * changes with the trainee: measured on the roster, any two trainees' parent sets
 * overlap only 48%, and the most-run trainee used 22 distinct parents.
 */
/** 1..n, which is every star count a selector may offer. */
const starsUpTo = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

export function SparkFilter({
  options,
  criteria,
  matching,
  total,
  subject = 'package',
  onChange,
}: {
  options: readonly RosterSparkOption[];
  criteria: readonly SparkCriterion[];
  matching: number;
  total: number;
  /**
   * WHAT THE CRITERIA ARE ABOUT, which decides the ceilings this control
   * offers and whether the must-have toggle appears at all.
   *
   * `'package'` on the roster list, where a row is one veteran capping at 3
   * stars on the parent and 9 across its lineage. `'pair'` in the search, where
   * six ancestors cap at 6 and 18. One `SparkCriterion` type drives both, so
   * the same stored `minStars` means different things depending on who reads
   * it, and this prop is how the control knows which it is.
   */
  subject?: StarSubject;
  onChange: (criteria: SparkCriterion[]) => void;
}) {
  const replace = (at: number, patch: Partial<SparkCriterion>): void =>
    onChange(criteria.map((c, i) => (i === at ? { ...c, ...patch } : c)));

  const remove = (at: number): void => onChange(criteria.filter((_, i) => i !== at));

  const add = (groupId: number): void =>
    onChange([...criteria, { groupId, minStars: 1, scope: 'package' }]);

  // Changing the scope changes the ceiling, and a threshold left above the new
  // ceiling would be a requirement nobody can meet -- 7 stars on a single uma
  // that caps at 3. Clamping keeps every row on screen satisfiable by
  // construction, which is why there is no warning about impossible rows.
  const rescope = (at: number, scope: FilterScope): void =>
    replace(at, {
      scope,
      // 'package': this control filters the roster LIST, and a row there is one
      // veteran. The pair search reuses the same component against 'pair'.
      minStars: Math.min(criteria[at]!.minStars, maxStarsFor(scope, subject)),
    });

  // A spark already required cannot be required again: a second row for the
  // same spark is either a duplicate or a contradiction, and neither is a thing
  // to offer. Changing an existing row still reaches every spark, so nothing is
  // unreachable -- only unrepeatable.
  // A criterion is a groupId and a threshold; its KIND lives in the catalogue,
  // and whether the toggle even appears depends on it. Unknown reads as white,
  // the most permissive answer, for the same reason the sweep does it: a stale
  // catalogue must not silently change what the user is allowed to ask for.
  const kinds = new Map(options.map((o) => [o.groupId, o.kind]));
  const kindOf = (groupId: number): SparkKind => kinds.get(groupId) ?? 'white_skill';

  const taken = new Set(criteria.map((c) => c.groupId));
  const unused = options.filter((o) => !taken.has(o.groupId));

  return (
    <div className={styles.region}>
      <span className={styles.label}>
        NARROW BY SPARK
        {criteria.length > 1 && <span className={styles.every}> — showing veterans with all {criteria.length}</span>}
      </span>

      {criteria.map((criterion, at) => (
        <div className={styles.row} key={criterion.groupId}>
          <div className={styles.grow}>
            <SparkPicker
              options={options.filter((o) => o.groupId === criterion.groupId || !taken.has(o.groupId))}
              chosen={criterion.groupId}
              onChoose={(groupId) => (groupId === null ? remove(at) : replace(at, { groupId }))}
            />
          </div>

          {/* A select, not a number input. A spinner control at this size
              clipped its own value to an unreadable sliver.

              THE RANGE FOLLOWS THE SCOPE. One uma caps at 3 stars of a spark and
              the lineage is three umas, so "on the parent" offers 1-3 and
              "across the lineage" offers 1-9. An impossible requirement is not
              warned about; it cannot be typed. */}
          <select
            className={styles.number}
            value={criterion.minStars}
            aria-label="minimum stars"
            onChange={(e) => replace(at, { minStars: Number(e.target.value) })}
          >
            {starsUpTo(maxStarsFor(criterion.scope, subject)).map((n) => (
              <option key={n} value={n}>
                {n}★
              </option>
            ))}
          </select>
          <span className={styles.echo}>or more</span>
          <select
            className={styles.select}
            value={criterion.scope}
            aria-label="where the stars must be"
            onChange={(e) => rescope(at, e.target.value as FilterScope)}
          >
            {(Object.keys(SCOPE_LABEL) as FilterScope[]).map((scope) => (
              <option key={scope} value={scope}>
                {SCOPE_LABEL[scope]}
              </option>
            ))}
          </select>

          {/*
            THE MUST-HAVE TOGGLE, ON WHITES, IN THE SEARCH ONLY.

            A white ranks by default and prunes nothing, which is how a
            whites-only search ends up scoring every legal pair. Promoting one
            cuts the work: four whites promoted took a real sweep from 18,996
            scored pairs to 2,930, and the wall time from 1,128 ms to 205 ms,
            without moving the top result.

            Absent on blue, pink and green, because those are requirements
            already -- every ancestor carries exactly one of each -- and a
            toggle that cannot change anything is a control that lies. Absent on
            the roster LIST too: a list has nothing to rank with, so every
            criterion there already filters.
          */}
          {subject === 'pair' && isWhite(kindOf(criterion.groupId)) && (
            <label className={styles.mustHave}>
              <input
                type="checkbox"
                checked={isRequirement(criterion, kindOf(criterion.groupId))}
                onChange={(e) => replace(at, { mustHave: e.target.checked })}
              />
              must have
            </label>
          )}

          <button
            type="button"
            className={styles.clear}
            aria-label={`Remove the ${options.find((o) => o.groupId === criterion.groupId)?.name ?? 'spark'} requirement`}
            onClick={() => remove(at)}
          >
            Remove
          </button>
        </div>
      ))}

      {/* The add row. An empty picker rather than a button, so choosing a spark
          and adding a requirement are one action instead of two. */}
      <div className={styles.row}>
        <div className={styles.grow}>
          <SparkPicker
            key={criteria.length}
            options={unused}
            chosen={null}
            onChoose={(groupId) => {
              if (groupId !== null) add(groupId);
            }}
          />
        </div>

        {criteria.length > 0 && (
          <button type="button" className={styles.clear} onClick={() => onChange([])}>
            {criteria.length === 1 ? 'Clear' : 'Clear all'}
          </button>
        )}

        {/* The region states its own result, so a short list is never a mystery. */}
        <span className={styles.result}>
          {criteria.length > 0 ? `${matching} of ${total}` : `${total} veterans`}
        </span>
      </div>
    </div>
  );
}
