import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COMPARE } from './route';
import { SiteNav, navTargets } from './SiteNav';

const render = (over: { hasRoster: boolean; trayCount: number }) =>
  renderToStaticMarkup(
    <SiteNav current={COMPARE} targets={navTargets({ hasLineage: false, ...over })} />,
  );

/* Design review 3C: a route the reader cannot use is shown, not hidden. */
describe('the Compare nav item', () => {
  it('is listed with an empty tray, without a count', () => {
    const html = render({ hasRoster: true, trayCount: 0 });
    expect(html).toContain('>Compare</a>');
  });

  it('counts the pairs in the tray', () => {
    expect(render({ hasRoster: true, trayCount: 3 })).toContain('>Compare (3)</a>');
  });

  it('is shown before a roster exists, with the reason, not hidden', () => {
    const html = render({ hasRoster: false, trayCount: 0 });
    expect(html).toMatch(/aria-disabled="true" title="Load your veteran data first">Compare</);
  });
});
