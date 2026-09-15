import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AncestorIdentity, ExplainNode, LineageResponse } from '../api/types';
import { NodeCard, type NodeSubject } from './NodeCard';
import styles from './Tree.module.css';

/** What the user has clicked. The provenance panel renders whatever this names. */
export type Selection =
  | { kind: 'total' }
  | { kind: 'member'; position: number | 'T' }
  | { kind: 'link'; node: ExplainNode };

/**
 * The seven links, in the order the engine emits them as children of pairTotal.
 * Six are brackets between tiers; the seventh runs sideways between the two
 * parents and is drawn as its own edge, because routing it through the trainee
 * would draw a line that means nothing.
 */
const LINK_ORDER = ['T-10', 'T-20', '10-20', '10-11', '10-12', '20-21', '20-22'] as const;

interface EdgeLabel {
  id: string;
  x: number;
  y: number;
  base: number;
  bonus: number | null;
  /** The slot at the far end is empty. Absent is a fact and reads calm. */
  absent: boolean;
  node: ExplainNode;
}

interface Edge {
  /**
   * Identity, not geometry. `d` was the key, and it is derived entirely from
   * measured rects: any state where getBoundingClientRect returns zeros for
   * several nodes at once (a tree inside display:none, an offscreen or print
   * render, a jsdom snapshot) collapses every drop to "M0 0 L0 0" and React
   * drops paths as duplicate keys. Same class as the label-as-key bug next door.
   */
  id: string;
  d: string;
  dashed: boolean;
}

/**
 * The pedigree, growing upward: grandparents across the top, parents beneath
 * them, trainee at the bottom.
 *
 * A flat list of seven links needs position_id tags to disambiguate, because
 * one lineage can hold the same character in several slots: fixture 5531's six
 * slots hold only three distinct characters, so `El Condor Pasa <-> Inari One`
 * appears twice with different values. In a pedigree, position does that work
 * and no internal id reaches the screen.
 *
 * Connectors are measured from the DOM rather than computed from assumed card
 * sizes, so a name that wraps or a font that loads late moves the lines with it.
 */
export function Tree({
  lineage,
  selection,
  onSelect,
}: {
  lineage: LineageResponse;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<Edge[]>([]);
  const [labels, setLabels] = useState<EdgeLabel[]>([]);

  const register = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  }, []);

  const measure = useCallback(() => {
    const root = frame.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const box = (id: string) => {
      const el = nodes.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        cx: r.left - origin.left + r.width / 2,
        left: r.left - origin.left,
        right: r.right - origin.left,
        top: r.top - origin.top,
        bottom: r.bottom - origin.top,
        cy: r.top - origin.top + r.height / 2,
      };
    };

    // Positional binding, so the engine's order IS the contract. Nothing
    // asserted it: reorder LINKS in engine.ts and every edge label silently
    // attaches to the wrong connector, with no error and no visual tell. An
    // eighth link is worse -- LINK_ORDER[7] is undefined, the map keys collide
    // on undefined, and the extra link vanishes from the tree while still
    // counting in the headline.
    if (lineage.pairTotal.children.length !== LINK_ORDER.length) {
      throw new Error(
        `the engine emitted ${lineage.pairTotal.children.length} links but the tree ` +
          `binds ${LINK_ORDER.length} by position. Update LINK_ORDER in Tree.tsx to ` +
          'match LINKS in engine.ts, or edge labels will attach to the wrong connectors.',
      );
    }
    const byId = new Map(
      lineage.pairTotal.children.map((child, i) => [LINK_ORDER[i] as string, child]),
    );
    const drawn: Edge[] = [];
    const marks: EdgeLabel[] = [];

    /** One bracket: every child drops to a shared bus, the bus drops to the parent. */
    const bracket = (childIds: string[], parentId: string, linkIds: string[]) => {
      const parent = box(parentId);
      const kids = childIds.map(box);
      if (!parent || kids.some((k) => k === null)) return;
      const boxes = kids as NonNullable<(typeof kids)[number]>[];
      const busY = Math.round((Math.max(...boxes.map((k) => k.bottom)) + parent.top) / 2);
      let anyPresent = false;
      boxes.forEach((kid, i) => {
        const node = byId.get(linkIds[i] as string);
        const parts = node ? split(node) : { base: 0, bonus: null, absent: false };
        if (!parts.absent) anyPresent = true;
        drawn.push({
          id: `drop:${linkIds[i] as string}`,
          d: `M${kid.cx} ${kid.bottom} L${kid.cx} ${busY}`,
          dashed: parts.absent,
        });
        if (node) {
          marks.push({
            id: linkIds[i] as string,
            x: kid.cx,
            y: (kid.bottom + busY) / 2,
            ...parts,
            node,
          });
        }
      });
      const xs = boxes.map((k) => k.cx);
      drawn.push({
        id: `bus:${parentId}`,
        d: `M${Math.min(...xs)} ${busY} L${Math.max(...xs)} ${busY}`,
        dashed: !anyPresent,
      });
      drawn.push({
        id: `riser:${parentId}`,
        d: `M${parent.cx} ${busY} L${parent.cx} ${parent.top}`,
        dashed: !anyPresent,
      });
    };

    bracket(['11', '12'], '10', ['10-11', '10-12']);
    bracket(['21', '22'], '20', ['20-21', '20-22']);
    bracket(['10', '20'], 'T', ['T-10', 'T-20']);

    // The seventh link. Drawn between the parents, not through the trainee.
    const a = box('10');
    const b = box('20');
    const parentPair = byId.get('10-20');
    if (a && b && parentPair) {
      const parts = split(parentPair);
      drawn.push({
        id: 'link:10-20',
        d: `M${a.right} ${a.cy} L${b.left} ${b.cy}`,
        dashed: parts.absent,
      });
      marks.push({
        id: '10-20',
        x: (a.right + b.left) / 2,
        y: a.cy,
        ...parts,
        node: parentPair,
      });
    }

    setPaths(drawn);
    setLabels(marks);
  }, [lineage]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const root = frame.current;
    if (!root) return;
    // Fonts land after first paint and move every card; a ResizeObserver on the
    // frame catches that as well as window resizes and a name that rewraps.
    let cancelled = false;
    const observer = new ResizeObserver(() => measure());
    observer.observe(root);
    for (const el of nodes.current.values()) observer.observe(el);
    // A promise cannot be cancelled, so guard the callback instead. `measure`
    // closes over THIS render's lineage while reading the CURRENT DOM, so a
    // fixture switched before the fonts resolve would otherwise repaint the new
    // tree's edges with the old lineage's numbers. Wrong numbers on the
    // decision surface is the worst failure this product has.
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [measure]);

  const isSelected = (position: number | 'T') =>
    selection.kind === 'member' && selection.position === position;

  return (
    <div className={styles.scroll}>
      <div className={styles.frame} ref={frame}>
        <svg className={styles.edges} aria-hidden="true">
          {paths.map((edge) => (
            <path
              key={edge.id}
              d={edge.d}
              strokeDasharray={edge.dashed ? '3 3' : undefined}
              opacity={edge.dashed ? 0.6 : 1}
            />
          ))}
        </svg>

        <div className={styles.tier}>GRANDPARENTS</div>
        <div className={styles.row4}>
          {[11, 12, 21, 22].map((position) => (
            <div key={position} ref={register(String(position))}>
              <NodeCard
                subject={subjectFor(lineage.ancestors[position] ?? null)}
                affinity={lineage.individualAffinity[position] ?? null}
                caption="individual"
                portraitCard={lineage.ancestors[position]?.cardId ?? null}
                selected={isSelected(position)}
                onSelect={() => onSelect({ kind: 'member', position })}
              />
            </div>
          ))}
        </div>

        <div className={styles.gap} />
        <div className={styles.tier}>PARENTS</div>
        <div className={styles.row4}>
          {[10, 20].map((position) => (
            <div
              key={position}
              ref={register(String(position))}
              style={{ gridColumn: position === 10 ? '1 / 3' : '3 / 5' }}
            >
              <NodeCard
                subject={subjectFor(lineage.ancestors[position] ?? null)}
                affinity={lineage.individualAffinity[position] ?? null}
                caption={addends(lineage.individualAffinity[position])}
                portraitCard={lineage.ancestors[position]?.cardId ?? null}
                selected={isSelected(position)}
                onSelect={() => onSelect({ kind: 'member', position })}
              />
            </div>
          ))}
        </div>

        <div className={styles.gap} />
        <div className={styles.traineeRow}>
          <div ref={register('T')}>
            <NodeCard
              variant="trainee"
              subject={{
                name: lineage.trainee.name,
                // The server's answer, not a hardcoded true. An unresolvable
                // trainee used to render as a confident card above a confident
                // headline.
                resolution: lineage.trainee.resolution,
                // Not an ancestor: it has not been trained, so it carries
                // nothing. `null` is "no sparks exist", distinct from an
                // ancestor whose spark set is merely empty.
                sparks: null,
              }}
              affinity={lineage.pairTotal}
              caption="trainee · pair total"
              // The request carries no trainee card, so this is the base
              // costume. The trainee shows no sparks, so no number depends on it.
              portraitCard={lineage.trainee.portraitCardId}
              selected={isSelected('T')}
              onSelect={() => onSelect({ kind: 'total' })}
            />
          </div>
        </div>

        {labels.map((label) => (
          <button
            key={label.id}
            type="button"
            className={[
              styles.edgeLabel,
              selection.kind === 'link' && selection.node === label.node ? styles.edgeOpen : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: label.x, top: label.y }}
            onClick={() => onSelect({ kind: 'link', node: label.node })}
            title={label.node.label}
          >
            {/* An empty slot's edge is a single calm 0. Printing `0 +0` would
                put amber on a link where nothing was added, and amber means
                added and nothing else. */}
            <span className={label.absent ? styles.absentValue : styles.base}>{label.base}</span>
            {/* The link total is deliberately absent. It is derivable, and it
                competes with the two numbers that carry meaning: base is fixed
                by which two characters these are, bonus is what you can earn. */}
            {!label.absent && label.bonus !== null && (
              <span className={styles.bonus}>+{label.bonus}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An ancestor as a node displays it. Null stays null: an empty slot. */
function subjectFor(identity: AncestorIdentity | null): NodeSubject | null {
  if (!identity) return null;
  return { name: identity.name, resolution: identity.resolution, sparks: identity.sparks };
}

/** Splits a link into its base and bonus halves. A trainee link has no bonus. */
function split(link: ExplainNode): { base: number; bonus: number | null; absent: boolean } {
  let base = 0;
  let bonus: number | null = null;
  let absent = false;
  for (const child of link.children) {
    if (child.ruleId === 'base.absent_ancestor' || child.ruleId === 'bonus.absent_ancestor') {
      absent = true;
    }
    if (child.ruleId.startsWith('base.')) base += child.value;
    else if (child.ruleId.startsWith('bonus.')) bonus = (bonus ?? 0) + child.value;
  }
  return { base, bonus, absent };
}

/** A parent's individual affinity prints its four link values beneath it. */
function addends(node: ExplainNode | undefined): string {
  if (!node || node.children.length < 2) return 'individual';
  return `individual · ${node.children.map((c) => c.value).join(' + ')}`;
}
