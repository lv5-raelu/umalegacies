import type { FilterScope, FilterSplit, RosterSparkOption, SparkCriterion } from '@umalegacies/types';
import { SPARK_GROUP_LABEL, SPARK_KIND_ORDER } from '../lineage/sparks';
import { MAX_STARS_PER_UMA } from './filter';
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
 * One criterion row plus the scope selector.
 *
 * The INDEX behind this carries both of uma.moe's filter dimensions -- scope,
 * and whether a threshold is met by one uma or by the package summing -- because
 * their Advanced tier's repeatable rows, presets and Hide Sparks land on the same
 * index in M7 with no rebuild. Only one row ships now.
 *
 * It sits BELOW the trainee picker, not above it, because the working set
 * changes with the trainee: measured on the roster, any two trainees' parent sets
 * overlap only 48%, and the most-run trainee used 22 distinct parents.
 */
export function SparkFilter({
  options,
  criterion,
  matching,
  total,
  onChange,
}: {
  options: readonly RosterSparkOption[];
  criterion: SparkCriterion | null;
  matching: number;
  total: number;
  onChange: (criterion: SparkCriterion | null) => void;
}) {
  const grouped = SPARK_KIND_ORDER.map((kind) => ({
    kind,
    entries: options.filter((o) => o.kind === kind),
  })).filter((g) => g.entries.length > 0);

  const set = (patch: Partial<SparkCriterion>): void => {
    if (!criterion) return;
    onChange({ ...criterion, ...patch });
  };

  // A spark caps at 3 stars per uma, so "on one uma alone" above 3 can never be
  // met by anybody. Saying so beats returning an empty list and letting the user
  // wonder whether their roster is the problem.
  const unsatisfiable =
    criterion !== null && criterion.split === 'single' && criterion.minStars > MAX_STARS_PER_UMA;

  return (
    <div className={styles.region}>
      <span className={styles.label}>NARROW BY SPARK</span>
      <div className={styles.row}>
        <select
          className={`${styles.select} ${styles.grow}`}
          value={criterion?.groupId ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            if (value === '') return onChange(null);
            onChange({
              groupId: Number(value),
              minStars: criterion?.minStars ?? 1,
              scope: criterion?.scope ?? 'package',
              split: criterion?.split ?? 'sum',
            });
          }}
        >
          <option value="">No filter — show every veteran</option>
          {grouped.map((group) => (
            <optgroup key={group.kind} label={SPARK_GROUP_LABEL[group.kind]}>
              {group.entries.map((option) => (
                <option key={option.groupId} value={option.groupId}>
                  {option.name} ({option.veterans})
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {criterion && (
          <>
            {/* A select, not a number input. The whole range is 1-9 (three umas
                at three stars each), and a spinner control at this size clipped
                its own value to an unreadable sliver. */}
            <select
              className={styles.number}
              value={criterion.minStars}
              aria-label="minimum stars"
              onChange={(e) => set({ minStars: Number(e.target.value) })}
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
              onChange={(e) => set({ scope: e.target.value as FilterScope })}
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
              onChange={(e) => set({ split: e.target.value as FilterSplit })}
            >
              {(Object.keys(SPLIT_LABEL) as FilterSplit[]).map((split) => (
                <option key={split} value={split}>
                  {SPLIT_LABEL[split]}
                </option>
              ))}
            </select>
            <button type="button" className={styles.clear} onClick={() => onChange(null)}>
              Clear
            </button>
          </>
        )}

        {/* The region states its own result, so a short list is never a mystery. */}
        <span className={styles.result}>
          {criterion ? `${matching} of ${total}` : `${total} veterans`}
        </span>
      </div>

      {unsatisfiable && (
        <p className={`${styles.note} ${styles.warn}`}>
          No uma can carry more than {MAX_STARS_PER_UMA}★ of one spark, so nothing will ever
          match this. Lower the threshold, or count the package added together.
        </p>
      )}
    </div>
  );
}
