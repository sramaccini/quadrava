import { getIn, startsWith, type Json, type Path } from './doc-ops';
import { childSlots, targetAt } from './schema-info';

/** Dove cade un elemento trascinato rispetto alla riga della struttura su cui si rilascia. */
export type DropZone = 'before' | 'after' | 'inside';

/** Posizione d'arrivo: l'elenco di nodi e l'indice. */
export interface DropPoint {
  list: Path;
  index: number;
}

/**
 * Traduce «rilasciato prima / dopo / dentro questa riga» in una posizione nel documento. Dentro vale per i contenitori
 * (schermata, sezioni, schede, passi); su una scheda o un passo si finisce sempre dentro, perché accanto a una scheda
 * può stare solo un'altra scheda. Restituisce null se lì non può andare un nodo (per esempio dentro sé stesso).
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
  // Un nodo non può finire dentro sé stesso o un suo discendente.
  if (point && dragged && startsWith(point.list, dragged)) return null;
  return point;
}

/** La zona in base alla posizione verticale del puntatore nella riga: i bordi per prima/dopo, il centro per dentro. */
export function zoneAt(offsetY: number, height: number, canContain: boolean): DropZone {
  const ratio = height > 0 ? offsetY / height : 0.5;
  if (canContain) return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
  return ratio < 0.5 ? 'before' : 'after';
}
