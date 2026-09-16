import type { TraineeOption } from '@umalegacies/types';
import styles from './Controls.module.css';

/**
 * Who you are about to train.
 *
 * Keyed by CARD, not character, because a card is a costume and a costume
 * carries its own unique skill -- which is the green spark this whole tool is
 * about. 66 characters span 105 cards, so an unlabelled list would show "Oguri
 * Cap" twice, identically, for two umas that pass down different things.
 *
 * Sourced from master.mdb rather than from the save: you can train a character
 * you have never trained before.
 */
export function TraineePicker({
  trainees,
  chosen,
  onChoose,
}: {
  trainees: readonly TraineeOption[];
  chosen: number | null;
  onChoose: (cardId: number) => void;
}) {
  return (
    <div className={styles.region}>
      <label>
        <span className={styles.label}>TRAINEE</span>
        <div className={styles.row}>
          <select
            className={`${styles.select} ${styles.grow}`}
            value={chosen ?? ''}
            onChange={(e) => onChoose(Number(e.target.value))}
          >
            <option value="" disabled>
              Choose who you are training…
            </option>
            {trainees.map((trainee) => (
              <option key={trainee.cardId} value={trainee.cardId}>
                {trainee.name}
                {trainee.costume ? ` ${trainee.costume}` : ''}
              </option>
            ))}
          </select>
          {/* No costume echo here: the select already shows it, and repeating
              it beside the control read as a stray label rather than as
              confirmation. The tree page draws that costume's actual art. */}
        </div>
      </label>
    </div>
  );
}
