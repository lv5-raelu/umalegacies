import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { slimSave } from './save';

/**
 * The only test that runs against a real `data.json`.
 *
 * Every other test here feeds a hand-built entry, which proves the rules but not
 * that the rules match the game's actual export. This one is the opposite: it
 * asserts almost nothing about values and everything about the property that
 * matters, on real bytes.
 *
 * SKIPPED when the file is absent, which is the normal case -- `data.json` is
 * gitignored and never in CI. It runs on the builder's machine, which is where
 * the real file is.
 *
 * THE FILE IS READ IN `beforeAll`, NEVER IN THE `describe` BODY. `skipIf` skips
 * the tests but still RUNS the describe callback while collecting them, so a
 * read at that level crashed the whole suite on any checkout without the file
 * -- the opposite of skipping. It went unnoticed because this repository had no
 * CI to be such a checkout; the first clean run, on 2026-11-03, found it.
 */
// vitest runs with the workspace as cwd, and this file is ESM, so no __dirname.
const SAVE = resolve(process.cwd(), '../../data.json');
const present = existsSync(SAVE);

describe.skipIf(!present)("slimSave against a real data.json", () => {
  let text: string;
  let veterans: ReturnType<typeof slimSave>['veterans'];
  let skipped: ReturnType<typeof slimSave>['skipped'];
  let wire: string;

  beforeAll(() => {
    text = readFileSync(SAVE, 'utf8');
    ({ veterans, skipped } = slimSave(text));
    wire = JSON.stringify({ veterans });
  });

  it('reads every veteran in the file, skipping none', () => {
    expect(veterans.length).toBe((JSON.parse(text) as unknown[]).length);
    expect(veterans.length).toBeGreaterThan(0);
    // A real export should have nothing unreadable in it. If this ever fails,
    // the save format moved and the parser needs to follow.
    expect(skipped).toEqual([]);
  });

  it('sends no personal field from a real save, under any key', () => {
    // 184 distinct 12-digit trainer ids belonging to other players sit on the
    // ancestor slots of this file. None of them may cross the wire.
    expect(wire).not.toMatch(
      /owner_viewer_id|viewer_id|nickname|register_time|create_time|trained_chara_id|skill_array|race_result_list|support_card_list/,
    );
    // And the ids themselves, not only the key names they arrived under.
    const owners = new Set(
      (JSON.parse(text) as Array<{ succession_chara_array?: Array<{ owner_viewer_id?: number }> }>)
        .flatMap((e) => e.succession_chara_array ?? [])
        .map((s) => s.owner_viewer_id)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    );
    expect(owners.size).toBeGreaterThan(0);
    for (const id of owners) expect(wire).not.toContain(String(id));
  });

  it('is an order of magnitude smaller than the file it came from', () => {
    const before = statSync(SAVE).size;
    expect(wire.length).toBeLessThan(before / 10);
  });

  it('gives every veteran a card id and a score', () => {
    for (const veteran of veterans) {
      expect(Number.isInteger(veteran.self.cardId)).toBe(true);
      expect(Number.isFinite(veteran.score)).toBe(true);
    }
  });
});
