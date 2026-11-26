import { rowsOf } from 'core';
import type { GraphNode, Tone } from 'schema';
import { toneOf } from './menu-entries';

/** A node to lay out: its key and the width of its box (from the length of its label). */
export interface GraphLayoutNode {
  key: string;
  width: number;
}

/** An edge to lay out; `from: null` means from any node. */
export interface GraphLayoutEdge {
  from: string | null;
  to: string;
  label?: string;
}

export interface PlacedNode {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

/**
 * An edge with its SVG path and the place of its label. `forward` goes to a later column, `back` to the same or an
 * earlier one (drawn as an arc below the nodes), `self` from a node to itself, `any` from the «any» marker above its node.
 */
export interface PlacedEdge {
  index: number;
  from: string | null;
  to: string;
  label?: string;
  kind: 'forward' | 'back' | 'self' | 'any';
  path: string;
  labelX: number;
  labelY: number;
}

/** The «any» marker above a node that some edges reach from any node. */
export interface PlacedAny {
  to: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  anys: PlacedAny[];
}

export const GRAPH_NODE_HEIGHT = 40;
const GAP_X = 96;
const GAP_Y = 44;
const MARGIN = 16;
/** Room above every row for the «any» marker. */
const ANY_HEIGHT = 22;
const ANY_GAP = 14;
const TOP = MARGIN + ANY_HEIGHT + ANY_GAP;
/** Distance between the arcs of the edges that go back. */
const LANE = 18;

const round = (n: number): number => Math.round(n * 10) / 10;

/**
 * Lays out a directed graph from left to right, in columns (layers): the start node (or the nodes without incoming
 * edges) in the first column, every other node in the column after the nearest node that leads to it, as a
 * breadth-first visit. Within a column the nodes are ordered by the mean position of the nodes they come from, to
 * cross fewer edges. Edges that go back are drawn as arcs below the nodes, each in its own lane; edges from any node
 * start from a small marker above their node. Pure and deterministic: the same input gives the same drawing.
 */
export function layoutGraph(nodes: readonly GraphLayoutNode[], edges: readonly GraphLayoutEdge[], options: { start?: string | null; anyWidth?: number } = {}): GraphLayout {
  const byKey = new Map<string, GraphLayoutNode>();
  for (const node of nodes) if (!byKey.has(node.key)) byKey.set(node.key, node);
  const keys = [...byKey.keys()];
  const valid = edges.map((edge, index) => ({ ...edge, index })).filter((e) => byKey.has(e.to) && (e.from === null || byKey.has(e.from)));
  const out = new Map<string, string[]>(keys.map((k) => [k, []]));
  const incoming = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const e of valid) {
    if (e.from === null || e.from === e.to) continue;
    out.get(e.from)!.push(e.to);
    incoming.set(e.to, incoming.get(e.to)! + 1);
  }

  // Columns: breadth-first from the start, then from the nodes nobody reaches, then from whatever is left (cycles).
  const layer = new Map<string, number>();
  const visitOrder: string[] = [];
  const visit = (root: string): void => {
    if (layer.has(root)) return;
    layer.set(root, 0);
    const queue = [root];
    while (queue.length) {
      const key = queue.shift()!;
      visitOrder.push(key);
      for (const next of out.get(key)!) {
        if (layer.has(next)) continue;
        layer.set(next, layer.get(key)! + 1);
        queue.push(next);
      }
    }
  };
  const start = options.start != null && byKey.has(options.start) ? options.start : null;
  if (start !== null) visit(start);
  for (const key of keys) if (incoming.get(key) === 0) visit(key);
  for (const key of keys) visit(key);

  const columns: string[][] = [];
  for (const key of visitOrder) (columns[layer.get(key)!] ??= []).push(key);
  // Within a column, the mean position of the nodes in earlier columns that lead to it; two passes are enough here.
  const position = new Map<string, number>();
  const place = (): void => columns.forEach((column) => column.forEach((key, i) => position.set(key, i)));
  place();
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 1; c < columns.length; c++) {
      const mean = (key: string): number => {
        const from = valid.filter((e) => e.to === key && e.from !== null && layer.get(e.from)! < c).map((e) => position.get(e.from!)!);
        return from.length ? from.reduce((a, b) => a + b, 0) / from.length : position.get(key)!;
      };
      const weights = new Map(columns[c].map((key) => [key, mean(key)]));
      columns[c] = [...columns[c]].sort((a, b) => weights.get(a)! - weights.get(b)! || position.get(a)! - position.get(b)!);
      place();
    }
  }

  // Coordinates: each column as wide as its widest node, centred vertically on the tallest column.
  const rows = Math.max(1, ...columns.map((c) => c.length));
  const rowStep = GRAPH_NODE_HEIGHT + GAP_Y + ANY_HEIGHT;
  const placed = new Map<string, PlacedNode>();
  let x = MARGIN;
  columns.forEach((column, c) => {
    const width = Math.max(...column.map((key) => byKey.get(key)!.width));
    const offset = ((rows - column.length) * rowStep) / 2;
    column.forEach((key, i) => {
      const node = byKey.get(key)!;
      placed.set(key, { key, x: round(x + (width - node.width) / 2), y: round(TOP + offset + i * rowStep), width: node.width, height: GRAPH_NODE_HEIGHT, layer: c });
    });
    x += width + GAP_X;
  });
  const right = x - GAP_X + MARGIN;
  const bottom = Math.max(TOP, ...[...placed.values()].map((n) => n.y + n.height));

  // Edges.
  const result: PlacedEdge[] = [];
  const anys = new Map<string, PlacedAny>();
  const anyWidth = options.anyWidth ?? 48;
  let lanes = 0;
  for (const e of valid) {
    const to = placed.get(e.to)!;
    const base = { index: e.index, from: e.from, to: e.to, label: e.label };
    if (e.from === null) {
      const marker = anys.get(e.to) ?? { to: e.to, x: round(to.x + (to.width - anyWidth) / 2), y: round(to.y - ANY_GAP - ANY_HEIGHT), width: anyWidth, height: ANY_HEIGHT };
      anys.set(e.to, marker);
      const cx = round(to.x + to.width / 2);
      result.push({ ...base, kind: 'any', path: `M ${cx} ${marker.y + ANY_HEIGHT} L ${cx} ${to.y}`, labelX: round(marker.x + marker.width + 6), labelY: round(marker.y + ANY_HEIGHT / 2 + 4) });
      continue;
    }
    const from = placed.get(e.from)!;
    if (e.from === e.to) {
      const sx = from.x + from.width;
      const sy = from.y + 10;
      result.push({ ...base, kind: 'self', path: `M ${round(sx)} ${round(sy)} C ${round(sx + 34)} ${round(sy - 30)} ${round(sx + 34)} ${round(sy + 50)} ${round(sx)} ${round(sy + 20)}`, labelX: round(sx + 30), labelY: round(sy + 14) });
      continue;
    }
    if (to.layer > from.layer) {
      const sx = from.x + from.width;
      const sy = from.y + GRAPH_NODE_HEIGHT / 2;
      const ex = to.x;
      const ey = to.y + GRAPH_NODE_HEIGHT / 2;
      const dx = (ex - sx) / 2;
      result.push({ ...base, kind: 'forward', path: `M ${round(sx)} ${round(sy)} C ${round(sx + dx)} ${round(sy)} ${round(ex - dx)} ${round(ey)} ${round(ex)} ${round(ey)}`, labelX: round((sx + ex) / 2), labelY: round((sy + ey) / 2 - 6) });
      continue;
    }
    // Back (or within the same column): an arc below every node, one lane each.
    const sx = from.x + from.width / 2;
    const sy = from.y + GRAPH_NODE_HEIGHT;
    const ex = to.x + to.width / 2;
    const ey = to.y + GRAPH_NODE_HEIGHT;
    const depth = bottom + 20 + lanes * LANE;
    lanes++;
    // Middle of the cubic curve: (P0 + 3 P1 + 3 P2 + P3) / 8.
    result.push({ ...base, kind: 'back', path: `M ${round(sx)} ${round(sy)} C ${round(sx)} ${round(depth)} ${round(ex)} ${round(depth)} ${round(ex)} ${round(ey)}`, labelX: round((sx + ex) / 2), labelY: round((sy + ey) / 8 + (6 * depth) / 8 - 4) });
  }
  const height = bottom + (lanes ? 20 + lanes * LANE : 0) + MARGIN;
  return { width: round(Math.max(right, MARGIN * 2)), height: round(height), nodes: [...placed.values()], edges: result, anys: [...anys.values()] };
}

/** A node read from the data: key, label (translated) and tone. */
export interface GraphItem {
  key: string;
  label: string;
  tone: Tone;
}

/** The nodes and edges of a `graph` read from the answer of its data source. */
export function readGraph(data: unknown, spec: Pick<GraphNode, 'nodes' | 'edges'>, translate: (key: string, fallback: string) => string): { nodes: GraphItem[]; edges: GraphLayoutEdge[] } {
  const list = (field: string | undefined): Record<string, unknown>[] => {
    const value = field === undefined ? data : (data !== null && typeof data === 'object' ? (data as Record<string, unknown>)[field] : undefined);
    return rowsOf(value);
  };
  const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));
  const n = spec.nodes;
  const nodes = list(n.field).flatMap((row) => {
    const key = text(row[n.keyField ?? 'id']);
    if (!key) return [];
    const fallback = text(row[n.labelField ?? 'name']) || key;
    const toneValue = n.toneField ? text(row[n.toneField]) : '';
    return [{ key, label: n.valueKey ? translate(`${n.valueKey}.${key}`, fallback) : fallback, tone: n.tones ? toneOf(n.tones[toneValue]) : toneOf(toneValue) }];
  });
  const e = spec.edges;
  const edges = list(e.field).flatMap((row) => {
    const to = text(row[e.toField ?? 'to']);
    if (!to) return [];
    const from = text(row[e.fromField ?? 'from']);
    const label = e.labelField ? text(row[e.labelField]) : '';
    return [{ from: from || null, to, ...(label ? { label } : {}) }];
  });
  return { nodes, edges };
}
