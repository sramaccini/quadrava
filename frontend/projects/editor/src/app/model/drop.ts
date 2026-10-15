import { getIn, startsWith, type Json, type Path } from './doc-ops';
import { childSlots, targetAt } from './schema-info';

/** Where a dragged element falls relative to the outline row it is released on. */
export type DropZone = 'before' | 'after' | 'inside';

/** Arrival position: the list of nodes and the index. */
export interface DropPoint {
  list: Path;
  index: number;
}

/**
 * Translates «released before / after / inside this row» into a position in the document. Inside applies to containers
 * (screen, sections, tabs, steps); on a tab or a step one always ends up inside, because next to a tab
 * there can only be another tab. Returns null if a node cannot go there (for example inside itself).
 */
export function dropPoint(doc: Json, target: Path, zone: DropZone, dragged?: Path): DropPoint | null {
  const kind = targetAt(doc, target);
  if (!kind) return null;
  const [slot] = childSlots(doc, target);
  const inside = (): DropPoint | null => {
    if (!slot) return null;
    const list = getIn(doc, slot.path);
    return { list: slot.path, index: Array.isArray(list) ? list.length : 0 };
  };
  let point: DropPoint | null;
  if (kind.kind !== 'node') point = inside();
  else if (zone === 'inside') point = inside() ?? { list: target.slice(0, -1), index: (target.at(-1) as number) + 1 };
  else point = { list: target.slice(0, -1), index: (target.at(-1) as number) + (zone === 'after' ? 1 : 0) };
  // A node cannot end up inside itself or one of its descendants.
  if (point && dragged && startsWith(point.list, dragged)) return null;
  return point;
}

/** The zone by the vertical position of the pointer in the row: the edges for before/after, the centre for inside. */
export function zoneAt(offsetY: number, height: number, canContain: boolean): DropZone {
  const ratio = height > 0 ? offsetY / height : 0.5;
  if (canContain) return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
  return ratio < 0.5 ? 'before' : 'after';
}
