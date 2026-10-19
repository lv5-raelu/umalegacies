import { describe, expect, it } from 'vitest';
import type { ParentPick } from '@umalegacies/types';
import {
  TRAY_CAP,
  addToTray,
  dedupeKey,
  pairKey,
  removeFromTray,
  restoreToTray,
  trayIndexOf,
  type TrayPair,
} from './tray';

const own = (index: number): ParentPick => ({ kind: 'own', index, cardId: 100000 + index });
const pair = (a: number, b: number): TrayPair => [own(a), own(b)];

describe('the tray', () => {
  it('adds at the end and says where', () => {
    const first = addToTray([], pair(1, 2));
    expect(first).toEqual({ ok: true, tray: [pair(1, 2)], index: 0 });
    const second = addToTray(first.ok ? first.tray : [], pair(3, 4));
    expect(second.ok && second.index).toBe(1);
  });

  it('refuses a fifth pair with its reason, and evicts nothing', () => {
    let tray: TrayPair[] = [];
    for (let i = 0; i < TRAY_CAP; i++) {
      const added = addToTray(tray, pair(i * 2, i * 2 + 1));
      if (added.ok) tray = added.tray;
    }
    expect(tray).toHaveLength(4);
    expect(addToTray(tray, pair(100, 101))).toEqual({ ok: false, reason: 'full' });
  });

  it('treats A x B and B x A as the same pair for dedupe', () => {
    const tray = [pair(1, 2)];
    expect(addToTray(tray, pair(2, 1))).toEqual({ ok: false, reason: 'duplicate' });
    expect(trayIndexOf(tray, pair(2, 1))).toBe(0);
    expect(dedupeKey(pair(1, 2))).toBe(dedupeKey(pair(2, 1)));
  });

  it('keeps the ORDER in the cache key', () => {
    expect(pairKey(pair(1, 2))).not.toBe(pairKey(pair(2, 1)));
  });

  it('tells a stale index from a fresh one by its card', () => {
    const stale: TrayPair = [{ kind: 'own', index: 1, cardId: 999 }, own(2)];
    expect(trayIndexOf([pair(1, 2)], stale)).toBe(-1);
  });

  it('removes by position', () => {
    expect(removeFromTray([pair(1, 2), pair(3, 4), pair(5, 6)], 1)).toEqual([pair(1, 2), pair(5, 6)]);
  });

  it('puts an undone pair back where it was', () => {
    expect(restoreToTray([pair(1, 2), pair(5, 6)], pair(3, 4), 1)).toEqual([
      pair(1, 2),
      pair(3, 4),
      pair(5, 6),
    ]);
    // Never twice, never past the cap.
    expect(restoreToTray([pair(3, 4)], pair(4, 3), 0)).toEqual([pair(3, 4)]);
  });
});
