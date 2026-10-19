import { useEffect, useState, type MouseEvent } from 'react';

/**
 * THE SCREENS, ONE PATH EACH, and no router library behind them.
 *
 * Three screens and one owner of the state they read: a library would bring
 * nested routes, loaders and params for a switch that is three comparisons.
 * What it would have given for free is below -- a path that survives being
 * pushed, and a link that does not reload the page.
 *
 * Paths need the server's agreement and hashes did not: a reload of `/search`
 * asks the server for `/search`. vercel.json answers these paths with
 * index.html and nothing else, and Vite's dev server does it on its own. A new
 * path needs adding there too, or a reload of it is a 404.
 */
export const ROOT = '/';
export const SEARCH = '/search';
export const ROSTER = '/roster';
export const TREE = '/tree';
export const COMPARE = '/compare';

/**
 * Change screens without a reload. A reload would drop everything only held
 * in memory -- the explained pair, the search's paged results.
 *
 * `popstate` is dispatched by hand because `pushState` and `replaceState` fire
 * nothing, and one listener for every way of arriving -- a link, the back
 * button, a redirect -- is what kept the hash version honest.
 *
 * `replace` for redirects, so "back" does not land on a screen that would only
 * send the reader forward again.
 */
export function navigate(path: string, { replace = false }: { replace?: boolean } = {}): void {
  if (path === location.pathname) return;
  const url = path + location.search;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  dispatchEvent(new PopStateEvent('popstate'));
}

/** The current path, kept in step with every `navigate` and every back/forward. */
export function usePath(): string {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const sync = (): void => setPath(location.pathname);
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);
  return path;
}

/**
 * The screens lived at `#search`, `#roster` and `#tree` before they had
 * paths. A bookmark or a shared link from then still names one; carry it
 * over before the first render, so the app never sees the old form.
 */
export function adoptLegacyHash(): void {
  const legacy: Record<string, string> = { '#search': SEARCH, '#roster': ROSTER, '#tree': TREE };
  const path = legacy[location.hash];
  if (path !== undefined) history.replaceState(null, '', path + location.search);
}

/**
 * A plain left click on a link stays in the page; anything else -- a new tab,
 * a new window, a download -- is left to the browser, which now works because
 * the path is real.
 */
export function followLink(event: MouseEvent<HTMLAnchorElement>, path: string): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(path);
}
