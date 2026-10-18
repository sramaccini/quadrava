/**
 * Geometry of the document windows inside the workspace: pure functions, in pixels from the top left corner of the area.
 * Windows stay whole inside the area (as in the MDI applications: the title bar can always be reached).
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Size of the workspace area. Zero (not measured yet, as in tests) = no limits. */
export interface Area {
  width: number;
  height: number;
}

/** Edge or corner being dragged to resize: north, south, east, west and the corners. */
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const MIN_WIDTH = 360;
export const MIN_HEIGHT = 220;
/** Offset of every window from the previous one when cascading. */
export const CASCADE_STEP = 28;
/** Size of a window before the area is measured. */
const DEFAULT_SIZE = { width: 960, height: 620 };

/** The window inside the area, not smaller than the minimum (unless the area itself is smaller). */
export function clampBounds(bounds: Bounds, area: Area): Bounds {
  if (!(area.width > 0 && area.height > 0)) {
    const { x, y, width, height } = bounds;
    return { x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)), width: Math.round(Math.max(MIN_WIDTH, width)), height: Math.round(Math.max(MIN_HEIGHT, height)) };
  }
  const width = Math.min(area.width, Math.max(MIN_WIDTH, bounds.width));
  const height = Math.min(area.height, Math.max(MIN_HEIGHT, bounds.height));
  const x = Math.min(area.width - width, Math.max(0, bounds.x));
  const y = Math.min(area.height - height, Math.max(0, bounds.y));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Position of the n-th window of a cascade: each one a step lower and to the right, starting again when it would leave the area. */
export function cascadeBounds(index: number, area: Area): Bounds {
  if (!(area.width > 0 && area.height > 0)) return { x: index * CASCADE_STEP, y: index * CASCADE_STEP, ...DEFAULT_SIZE };
  const width = Math.max(Math.min(MIN_WIDTH, area.width), Math.round(area.width * 0.72));
  const height = Math.max(Math.min(MIN_HEIGHT, area.height), Math.round(area.height * 0.78));
  const room = Math.max(1, Math.floor(Math.min(area.width - width, area.height - height) / CASCADE_STEP) + 1);
  const offset = (index % room) * CASCADE_STEP;
  return clampBounds({ x: offset, y: offset, width, height }, area);
}

/** Windows side by side filling the area: a grid with as many columns as needed, the last row sharing its width. */
export function tileBounds(count: number, area: Area): Bounds[] {
  if (count <= 0) return [];
  const width = area.width > 0 ? area.width : DEFAULT_SIZE.width * 2;
  const height = area.height > 0 ? area.height : DEFAULT_SIZE.height * 2;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const result: Bounds[] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = row === rows - 1 ? count - columns * (rows - 1) : columns;
    for (let column = 0; column < inRow; column++) {
      const x = Math.round((column * width) / inRow);
      const y = Math.round((row * height) / rows);
      result.push({ x, y, width: Math.round(((column + 1) * width) / inRow) - x, height: Math.round(((row + 1) * height) / rows) - y });
    }
  }
  return result;
}

/** The window resized dragging an edge or a corner by (dx, dy): the opposite edge stays where it is. */
export function resizeBounds(start: Bounds, edge: Edge, dx: number, dy: number, area: Area): Bounds {
  let { x, y, width, height } = start;
  const right = x + width;
  const bottom = y + height;
  const minWidth = area.width > 0 ? Math.min(MIN_WIDTH, area.width) : MIN_WIDTH;
  const minHeight = area.height > 0 ? Math.min(MIN_HEIGHT, area.height) : MIN_HEIGHT;
  const maxRight = area.width > 0 ? area.width : Infinity;
  const maxBottom = area.height > 0 ? area.height : Infinity;
  if (edge.includes('e')) width = Math.max(minWidth, Math.min(maxRight - x, width + dx));
  if (edge.includes('s')) height = Math.max(minHeight, Math.min(maxBottom - y, height + dy));
  if (edge.includes('w')) {
    x = Math.min(right - minWidth, Math.max(0, x + dx));
    width = right - x;
  }
  if (edge.includes('n')) {
    y = Math.min(bottom - minHeight, Math.max(0, y + dy));
    height = bottom - y;
  }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/** Bounds read from the browser storage, if they have the expected shape. */
export function isBounds(value: unknown): value is Bounds {
  const b = value as Bounds | null;
  return typeof b === 'object' && b !== null && [b.x, b.y, b.width, b.height].every((n) => typeof n === 'number' && Number.isFinite(n));
}
