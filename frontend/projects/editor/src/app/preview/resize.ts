import type { ResizeProperty } from './protocol';

/** Measures read at the start and at the end of the drag of the handle. */
export interface ResizeMeasure {
  property: ResizeProperty;
  /** Width of the component at the start. */
  startWidth: number;
  /** Width it would have at the pointer position. */
  width: number;
  /** Grid: columns and width of the grid. */
  columns?: number;
  gridWidth?: number;
  /** Box: current share (`grow`; 0 or absent counts as 1). */
  current?: number;
}

/**
 * New value after resizing: in the grid the whole columns closest to the width (from 1 to those of the
 * grid); in the box the current share in proportion to the change of width (from 1 to 12).
 */
export function resizeValue(m: ResizeMeasure): number {
  const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));
  if (m.property === 'span') {
    const columns = Math.max(1, m.columns ?? 1);
    const column = (m.gridWidth ?? 0) / columns;
    return column > 0 ? clamp(m.width / column, 1, columns) : 1;
  }
  const current = m.current && m.current > 0 ? m.current : 1;
  return m.startWidth > 0 ? clamp((current * m.width) / m.startWidth, 1, 12) : current;
}
