import { describe, expect, it } from 'vitest';
import type { LineageResponse, ParentPick } from '@umalegacies/types';
import type { ColumnResult } from './run-columns';
import type { TrayPair } from './tray';
import { columnKey, pruneResults } from './useCompareColumns';

const own = (index: number): ParentPick => ({ kind: 'own', index, cardId: 100000 + index });
const pair = (a: number, b: number): TrayPair => [own(a), own(b)];
const ok: ColumnResult = { kind: 'ok', lineage: {} as LineageResponse };

describe('the keyed results', () => {
  it('keys by order, so B x A never reads A x B', () => {
    expect(columnKey('h', 1, pair(1, 2))).not.toBe(columnKey('h', 1, pair(2, 1)));
  });

  it('keys by trainee and game data, so a switch never shows the old numbers', () => {
    expect(columnKey('h', 1, pair(1, 2))).not.toBe(columnKey('h', 2, pair(1, 2)));
    expect(columnKey('h', 1, pair(1, 2))).not.toBe(columnKey('g', 1, pair(1, 2)));
  });

  it('stay bounded across ten trainee switches, and keep an undo slot', () => {
    const tray = [pair(1, 2), pair(3, 4), pair(5, 6)];
    const removed = pair(7, 8);
    const results = new Map<string, ColumnResult>();
    for (let trainee = 0; trainee < 10; trainee++) {
      const keys = [...tray, removed].map((p) => columnKey('h', trainee, p));
      pruneResults(results, keys);
      for (const key of keys) results.set(key, ok);
      expect(results.size).toBeLessThanOrEqual(tray.length + 1);
    }
    // The last trainee's undo slot is still cached: undo shows no loading state.
    expect(results.has(columnKey('h', 9, removed))).toBe(true);
  });
});
