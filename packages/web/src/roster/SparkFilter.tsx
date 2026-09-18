import type { FilterScope, FilterSplit, RosterSparkOption, SparkCriterion } from '@umalegacies/types';
import { MAX_STARS_PER_UMA } from './filter';
import { SparkPicker } from './SparkPicker';
import styles from './Controls.module.css';

const SCOPE_LABEL: Readonly<Record<FilterScope, string>> = {
  package: 'anywhere in the package',
  parent: 'on the parent itself',
  grandparents: 'on its own parents',
};

const SPLIT_LABEL: Readonly<Record<FilterSplit, string>> = {
  sum: 'added together',
  single: 'on one uma alone',
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
 * already know did not change, it repeated. Each row carries its own scope and
 * split, because "6 Stamina anywhere in the package" and "2 Medium on the parent
 * itself" is a normal pair of requirements and forcing them to share a scope
 * would make the second one unaskable.
 *
 * It sits BELOW the trainee picker, not above it, because the working set
 * changes with the trainee: measured on the roster, any two trainees' parent sets
 * overlap only 48%, and the most-run trainee used 22 distinct parents.
 */
export function SparkFilter({
  options,
  criteria,
  matching,
  total,
  onChange,
}: {
  options: readonly RosterSparkOption[];
  criteria: readonly SparkCriterion[];
  matching: number;
  total: number;
  onChange: (criteria: SparkCriterion[]) => void;
}) {
  const replace = (at: number, patch: Partial<SparkCriterion>): void =>
    onChange(criteria.map((c, i) => (i === at ? { ...c, ...patch } : c)));

  const remove = (at: number): void => onChange(criteria.filter((_, i) => i !== at));

  const add = (groupId: number): void =>
    onChange([...criteria, { groupId, minStars: 1, scope: 'package', split: 'sum' }]);

  // A spark already required cannot be required again: a second row for the
  // same spark is either a duplicate or a contradiction, and neither is a thing
  // to offer. Changing an existing row still reaches every spark, so nothing is
  // unreachable -- only unrepeatable.
  const taken = new Set(criteria.map((c) => c.groupId));
  const unused = options.filter((o) => !taken.has(o.groupId));

  // A spark caps at 3 stars per uma, so "on one uma alone" above 3 can never be
  // met by anybody. Saying so beats returning an empty list and letting the user
  // wonder whether their roster is the problem.
  const unsatisfiable = criteria.filter(
    (c) => c.split === 'single' && c.minStars > MAX_STARS_PER_UMA,
  );

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

          {/* A select, not a number input. The whole range is 1-9 (three umas
              at three stars each), and a spinner control at this size clipped
              its own value to an unreadable sliver. */}
          <select
            className={styles.number}
            value={criterion.minStars}
            aria-label="minimum stars"
            onChange={(e) => replace(at, { minStars: Number(e.target.value) })}
          >
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
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
            onChange={(e) => replace(at, { scope: e.target.value as FilterScope })}
          >
            {(Object.keys(SCOPE_LABEL) as FilterScope[]).map((scope) => (
              <option key={scope} value={scope}>
                {SCOPE_LABEL[scope]}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={criterion.split}
            aria-label="how the stars are counted"
            onChange={(e) => replace(at, { split: e.target.value as FilterSplit })}
          >
            {(Object.keys(SPLIT_LABEL) as FilterSplit[]).map((split) => (
              <option key={split} value={split}>
                {SPLIT_LABEL[split]}
              </option>
            ))}
          </select>
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

      {unsatisfiable.length > 0 && (
        <p className={`${styles.note} ${styles.warn}`}>
          No uma can carry more than {MAX_STARS_PER_UMA}★ of one spark, so{' '}
          {unsatisfiable.length === 1
            ? 'that requirement'
            : `${unsatisfiable.length} of these requirements`}{' '}
          will never match. Lower the threshold, or count the package added together.
        </p>
      )}
    </div>
  );
}
