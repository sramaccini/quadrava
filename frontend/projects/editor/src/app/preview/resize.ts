import type { ResizeProperty } from './protocol';

/** Misure lette all'inizio e alla fine del trascinamento della maniglia. */
export interface ResizeMeasure {
  property: ResizeProperty;
  /** Larghezza del componente all'inizio. */
  startWidth: number;
  /** Larghezza che avrebbe alla posizione del puntatore. */
  width: number;
  /** Griglia: colonne e larghezza della griglia. */
  columns?: number;
  gridWidth?: number;
  /** Box: quota attuale (`grow`; 0 o assente vale 1). */
  current?: number;
}

/**
 * Nuovo valore dopo il ridimensionamento: nella griglia le colonne intere più vicine alla larghezza (da 1 a quelle della
 * griglia); nel box la quota attuale in proporzione al cambio di larghezza (da 1 a 12).
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
