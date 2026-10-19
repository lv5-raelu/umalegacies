import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompareToggle, type CompareStatus } from './CompareToggle';

const render = (status: CompareStatus) =>
  renderToStaticMarkup(<CompareToggle status={status} onAdd={() => {}} onOpen={() => {}} />);

describe('the compare control', () => {
  it('is a button that adds, when the pair is not in the tray', () => {
    expect(render({ kind: 'add' })).toMatch(/^<button[^>]*>Add to compare<\/button>$/);
  });

  it('is a link to the pair, naming its slot, when it is', () => {
    expect(render({ kind: 'in', letter: 'C' })).toMatch(/^<a[^>]*href="\/compare"[^>]*>In compare\s·\sC<\/a>$/);
  });

  it('is a link to /compare, never a silent replace, when the tray is full', () => {
    expect(render({ kind: 'full' })).toMatch(/^<a[^>]*href="\/compare"[^>]*>Compare full · 4 of 4<\/a>$/);
  });
});
