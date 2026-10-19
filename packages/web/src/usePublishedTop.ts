import { useCallback, useRef } from 'react';

/**
 * Where an element starts on the page, published as a CSS variable ON that
 * element, so its contents can be sized "everything from here down".
 *
 * Two users: the roster grid publishes `--pane-top` for the sticky pair pane,
 * and the compare page's narrow-screen scroll box publishes `--compare-box-top`
 * for its own height. One copy, so both keep the three lessons the first one
 * cost:
 *
 * MEASURE A NON-STICKY CONTAINER. A stuck element's `getBoundingClientRect().top`
 * reports where it is PINNED, not where it sits in flow -- so `rect.top +
 * scrollY` returned 80 at the top of the page and 5,024 once scrolled to 5,000.
 * `offsetTop` is no better; it reported 5,024 too. Either one collapsed the pane
 * to a sliver showing only the headline number.
 *
 * REFUSE A VALUE TALLER THAN THE VIEWPORT, which would leave the sized element
 * with a negative height. Nothing legitimate produces one; whatever measured
 * wrong, the last good value is a better answer than an empty pane.
 *
 * RE-MEASURE ON EVERY LAYOUT CHANGE, through a ResizeObserver on `body`: 259
 * lazily-loaded portraits resize the document constantly while you scroll.
 *
 * A CALLBACK REF, NOT AN EFFECT. The effect this replaced re-ran only when the
 * roster changed, and the roster grid is rebuilt after every visit to the
 * search -- so the new grid never got the variable and fell back to 80px. A
 * callback ref runs exactly when the element attaches, detaches or is
 * replaced, which is the event that matters.
 */
export function usePublishedTop(name: string): (element: HTMLElement | null) => void {
  const detach = useRef<(() => void) | null>(null);

  return useCallback(
    (element: HTMLElement | null) => {
      detach.current?.();
      detach.current = null;
      if (element === null) return;

      let last = -1;
      const measure = (): void => {
        const top = nextTop(
          element.getBoundingClientRect().top,
          window.scrollY,
          window.innerHeight,
          last,
        );
        if (top === null) return;
        last = top;
        element.style.setProperty(name, `${top}px`);
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(document.body);
      addEventListener('resize', measure);
      detach.current = () => {
        observer.disconnect();
        removeEventListener('resize', measure);
      };
    },
    [name],
  );
}

/**
 * The value to publish, or null to leave the last one standing: above the
 * viewport, below 0, or unchanged.
 */
export function nextTop(
  rectTop: number,
  scrollY: number,
  innerHeight: number,
  last: number,
): number | null {
  const top = Math.round(rectTop + scrollY);
  if (top < 0 || top > innerHeight) return null;
  if (top === last) return null;
  return top;
}
