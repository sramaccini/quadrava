import type { NodeDefinition } from 'schema';
import { layoutGraph, readGraph, type GraphLayoutEdge } from './graph-layout';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

const box = (...keys: string[]) => keys.map((key) => ({ key, width: 100 }));
const workflow: GraphLayoutEdge[] = [
  { from: 'todo', to: 'doing', label: 'Start' },
  { from: 'doing', to: 'done', label: 'Finish' },
  { from: 'doing', to: 'todo', label: 'Pause' },
  { from: 'done', to: 'doing', label: 'Reopen' },
  { from: null, to: 'todo', label: 'Reset' },
];

describe('graph layout', () => {
  it('puts the nodes in columns from left to right, following the edges from the nodes nobody reaches', () => {
    const layout = layoutGraph(box('done', 'doing', 'todo'), [{ from: 'todo', to: 'doing' }, { from: 'doing', to: 'done' }]);
    const column = Object.fromEntries(layout.nodes.map((n) => [n.key, n.layer]));
    expect(column).toEqual({ todo: 0, doing: 1, done: 2 });
    const x = Object.fromEntries(layout.nodes.map((n) => [n.key, n.x]));
    expect(x['todo']).toBeLessThan(x['doing']);
    expect(x['doing']).toBeLessThan(x['done']);
  });

  it('starts from the start node when the graph is a cycle, and draws edges that go back as arcs below the nodes', () => {
    const layout = layoutGraph(box('todo', 'doing', 'done'), workflow, { start: 'todo' });
    expect(layout.nodes.map((n) => [n.key, n.layer])).toEqual([['todo', 0], ['doing', 1], ['done', 2]]);
    expect(layout.edges.map((e) => [e.label, e.kind])).toEqual([['Start', 'forward'], ['Finish', 'forward'], ['Pause', 'back'], ['Reopen', 'back'], ['Reset', 'any']]);
    const bottom = Math.max(...layout.nodes.map((n) => n.y + n.height));
    const back = layout.edges.filter((e) => e.kind === 'back');
    // Each arc in its own lane, below the nodes, and inside the drawing.
    expect(back.every((e) => e.labelY > bottom)).toBe(true);
    expect(back[0].labelY).not.toBe(back[1].labelY);
    expect(layout.height).toBeGreaterThan(Math.max(...back.map((e) => e.labelY)));
  });

  it('an edge from any node starts from one marker above its node', () => {
    const layout = layoutGraph(box('a', 'b'), [{ from: 'a', to: 'b' }, { from: null, to: 'a' }, { from: null, to: 'a', label: 'again' }], { anyWidth: 40 });
    const a = layout.nodes.find((n) => n.key === 'a')!;
    expect(layout.anys).toEqual([{ to: 'a', x: a.x + 30, y: a.y - 36, width: 40, height: 22 }]);
    expect(layout.edges.filter((e) => e.kind === 'any').length).toBe(2);
    expect(layout.anys[0].y).toBeGreaterThanOrEqual(0);
  });

  it('orders a column by the nodes the edges come from, to cross fewer edges', () => {
    // a → y, b → x: x goes next to b, y next to a.
    const layout = layoutGraph(box('a', 'b', 'y', 'x'), [{ from: 'a', to: 'y' }, { from: 'b', to: 'x' }, { from: 'a', to: 'x' }, { from: 'b', to: 'x' }]);
    const y = Object.fromEntries(layout.nodes.map((n) => [n.key, n.y]));
    expect(y['a']).toBeLessThan(y['b']);
    expect(y['y']).toBeLessThan(y['x']);
  });

  it('ignores edges to unknown nodes, keeps unconnected nodes and is deterministic', () => {
    const nodes = box('a', 'b', 'lonely');
    const edges = [{ from: 'a', to: 'b' }, { from: 'a', to: 'ghost' }, { from: 'ghost', to: 'b' }, { from: 'b', to: 'b', label: 'stay' }];
    const layout = layoutGraph(nodes, edges);
    expect(layout.nodes.map((n) => n.key).sort()).toEqual(['a', 'b', 'lonely']);
    expect(layout.edges.map((e) => e.kind)).toEqual(['forward', 'self']);
    expect(layoutGraph(nodes, edges)).toEqual(layout);
    expect(layoutGraph([], []).nodes).toEqual([]);
  });
});

describe('graph data', () => {
  it('reads nodes and edges from the fields of the answer, with translated labels and tones', () => {
    const data = {
      statuses: [{ id: 'todo', name: 'To do', category: 'new' }, { id: 'done', name: 'Done', category: 'done' }, { name: 'no key' }],
      transitions: [{ from: 'todo', to: 'done', name: 'Finish' }, { from: null, to: 'todo', name: 'Reset' }, { from: 'todo' }],
    };
    const graph = readGraph(data, {
      nodes: { field: 'statuses', valueKey: 'values.status', toneField: 'category', tones: { done: 'success' } },
      edges: { field: 'transitions', labelField: 'name' },
    }, (key, fallback) => (key === 'values.status.done' ? 'Fatto' : fallback));
    expect(graph.nodes).toEqual([{ key: 'todo', label: 'To do', tone: 'neutral' }, { key: 'done', label: 'Fatto', tone: 'success' }]);
    expect(graph.edges).toEqual([{ from: 'todo', to: 'done', label: 'Finish' }, { from: null, to: 'todo', label: 'Reset' }]);
  });

  it('without tones the value of toneField is the tone; a missing field gives no rows', () => {
    const graph = readGraph({ nodes: [{ key: 'a', title: 'A', tone: 'danger' }] }, { nodes: { field: 'nodes', keyField: 'key', labelField: 'title', toneField: 'tone' }, edges: { field: 'links' } }, (_, f) => f);
    expect(graph).toEqual({ nodes: [{ key: 'a', label: 'A', tone: 'danger' }], edges: [] });
  });
});

describe('graph', () => {
  const node = (extra: Record<string, unknown> = {}): NodeDefinition => ({
    type: 'graph',
    source: 'workflow',
    nodes: { field: 'statuses', toneField: 'tone' },
    edges: { field: 'transitions', labelField: 'name' },
    highlight: '{{ "doing" }}',
    start: 'todo',
    caption: 'Workflow',
    ...extra,
  } as NodeDefinition);
  const dataSources = { workflow: { type: 'rest' as const, method: 'GET' as const, url: '/api/workflow' } };
  const respond = () => ({
    statuses: [{ id: 'todo', name: 'To do', tone: 'neutral' }, { id: 'doing', name: 'Doing', tone: 'primary' }, { id: 'done', name: 'Done', tone: 'success' }],
    transitions: workflow.map((e) => ({ from: e.from, to: e.to, name: e.label })),
  });
  const svg = (h: ScreenHarness): SVGSVGElement | null => h.el.querySelector('lc-graph svg');
  const tool = (h: ScreenHarness, name: string): HTMLButtonElement => [...h.el.querySelectorAll<HTMLButtonElement>('lc-graph [role="toolbar"] button')].find((b) => (b.getAttribute('aria-label') ?? plain(b.textContent)) === name)!;

  it('draws the nodes with their tone, the current one highlighted, the start marked, the edges with their names', async () => {
    const h = await renderScreen({ components: [node()], dataSources, respond });
    await h.until(() => !!svg(h), 'drawn');
    const nodes = [...svg(h)!.querySelectorAll('g.node')];
    expect(nodes.map((g) => plain(g.textContent))).toEqual(['To do', 'Doing', 'Done']);
    expect(nodes.map((g) => g.classList.contains('current'))).toEqual([false, true, false]);
    expect(svg(h)!.querySelectorAll('circle.start').length).toBe(1);
    expect(svg(h)!.querySelectorAll('path.edge').length).toBe(5);
    expect(svg(h)!.querySelectorAll('path.edge.back').length).toBe(2);
    expect(plain(svg(h)!.querySelector('g.any')?.textContent)).toBe('Any');
    expect([...svg(h)!.querySelectorAll('text.edge-label')].map((t) => plain(t.textContent))).toEqual(['Start', 'Finish', 'Pause', 'Reopen', 'Reset']);
    expect(svg(h)!.getAttribute('aria-hidden')).toBe('true');
    expect(h.reports).toEqual([]);
  });

  it('screen readers get the nodes and the connections as lists', async () => {
    const h = await renderScreen({ components: [node()], dataSources, respond });
    await h.until(() => !!svg(h), 'drawn');
    const lists = [...h.el.querySelectorAll('lc-graph .visually-hidden ul')].map((ul) => [...ul.querySelectorAll('li')].map((li) => plain(li.textContent)));
    expect(lists).toEqual([
      ['To do (start)', 'Doing (current)', 'Done'],
      ['To do → Doing: Start', 'Doing → Done: Finish', 'Doing → To do: Pause', 'Done → Doing: Reopen', 'Any → To do: Reset'],
    ]);
  });

  it('zooms in and out within limits and hides the names of the connections', async () => {
    const h = await renderScreen({ components: [node()], dataSources, respond });
    await h.until(() => !!svg(h), 'drawn');
    const width = Number(svg(h)!.getAttribute('width'));
    tool(h, 'Zoom in').click();
    await h.settle();
    expect(Number(svg(h)!.getAttribute('width'))).toBeCloseTo(width * 1.25, 0);
    expect(plain(h.el.querySelector('lc-graph .zoom')?.textContent)).toBe('125%');
    tool(h, 'Actual size').click();
    for (let i = 0; i < 5; i++) tool(h, 'Zoom out').click();
    await h.settle();
    expect(plain(h.el.querySelector('lc-graph .zoom')?.textContent)).toBe('50%');
    expect(tool(h, 'Zoom out').disabled).toBe(true);
    const names = tool(h, 'Connection names');
    expect(names.getAttribute('aria-pressed')).toBe('true');
    names.click();
    await h.settle();
    expect(names.getAttribute('aria-pressed')).toBe('false');
    expect(svg(h)!.querySelectorAll('text.edge-label').length).toBe(0);
  });

  it('starts without the names of the connections with edgeLabels false', async () => {
    const h = await renderScreen({ components: [node({ edgeLabels: false })], dataSources, respond });
    await h.until(() => !!svg(h), 'drawn');
    expect(svg(h)!.querySelectorAll('text.edge-label').length).toBe(0);
  });

  it('says when there is nothing to draw', async () => {
    const empty = await renderScreen({ components: [node()], dataSources, respond: () => ({ statuses: [], transitions: [] }) });
    await empty.until(() => plain(empty.el.querySelector('lc-graph')?.textContent) === 'No data.', 'empty');
  });
});
