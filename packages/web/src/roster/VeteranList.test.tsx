import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ParentPick, ResolvedVeteran } from '@umalegacies/types';
import { catalogueOf } from './catalogue';
import { VeteranList } from './VeteranList';

/**
 * The A/B badge, which is the only thing on the list that says which half a
 * card fills.
 *
 * It used to be `picked.indexOf(veteran.index)` over an array of numbers. A
 * pick is now a union, so the same question is a `findIndex` over a
 * discriminant -- and the failure mode of getting that wrong is not an error.
 * It is every picked card losing its badge, or both cards claiming to be A,
 * while the pane above still shows a perfectly good pair.
 *
 * Rendered through `renderToStaticMarkup`: no DOM, no clicking, just what the
 * list prints for a given pair.
 */

const veteran = (index: number, cardId: number, charaId: number): ResolvedVeteran => ({
  index,
  score: 20_000 - index,
  self: { cardId, charaId, name: `uma ${cardId}`, costume: null, resolution: { ok: true } },
  parents: [null, null],
  sparks: [],
  unknownFactorIds: [],
  ok: true,
});

const veterans = [veteran(0, 100601, 1006), veteran(1, 100901, 1009), veteran(2, 101401, 1014)];

const own = (index: number, cardId: number): ParentPick => ({ kind: 'own', index, cardId });

const render = (picked: readonly ParentPick[]): string =>
  renderToStaticMarkup(
    <VeteranList
      veterans={veterans}
      pickedVeterans={picked.flatMap((p) => (p.kind === 'own' ? [veterans[p.index] as ResolvedVeteran] : []))}
      catalogue={catalogueOf([])}
      picked={picked}
      traineeCharaId={null}
      onPick={() => {}}
      onClearFilter={() => {}}
    />,
  );

/** The badge letters, in the order the rows render. */
const marks = (html: string): string[] =>
  [...html.matchAll(/pickMark[^>]*>([AB])</g)].map((m) => m[1] as string);

describe('a picked roster row wears the slot it fills', () => {
  it('marks nothing when nothing is picked', () => {
    expect(marks(render([]))).toEqual([]);
  });

  it('marks the first pick A and the second B, in PICK order not list order', () => {
    // Picking the last row first makes it A. The list never re-sorts on a pick
    // -- an earlier cut pinned picks to the top and made the list jump under
    // the pointer -- so the badge is the only record of which is which.
    expect(marks(render([own(2, 101401), own(0, 100601)]))).toEqual(['B', 'A']);
  });

  it('marks the picked rows and only those', () => {
    const html = render([own(1, 100901)]);
    expect(marks(html)).toEqual(['A']);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('does not mark a row whose index merely matches a pick POSITION', () => {
    // The trap the widening opens: reading a pick's place in the pair instead
    // of its `index`. Pick row 2 alone and row 0 would light up as A.
    const html = render([own(2, 101401)]);
    expect(marks(html)).toEqual(['A']);
    expect(html.indexOf('uma 101401')).toBeLessThan(html.indexOf('pickMark'));
  });
});
