import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';

describe('layout containers', () => {
  const text = (id: string, extra: Record<string, unknown> = {}): NodeDefinition => ({ id, type: 'text', text: id, ...extra }) as NodeDefinition;
  const host = (el: HTMLElement, id: string): HTMLElement => el.querySelector(`[data-node-id="${id}"]`) as HTMLElement;

  it('box: direction, alignment, distribution, wrapping, gap and grow shares', async () => {
    const h = await renderScreen({
      components: [
        { type: 'box', align: 'end', justify: 'between', gap: 'large', components: [text('a', { grow: 2 }), text('b'), text('c', { grow: 1 })] },
        { type: 'box', direction: 'column', gap: 'none', components: [text('d')] },
      ],
    });
    const [row, column] = [...h.el.querySelectorAll<HTMLElement>('lc-box .box')];
    expect(row.classList).toContain('wrap');
    expect(row.classList).toContain('gap-large');
    expect(row.style.alignItems).toBe('flex-end');
    expect(row.style.justifyContent).toBe('space-between');
    expect(host(h.el, 'a').style.flex).toBe('2 1 0px');
    expect(host(h.el, 'b').style.flex).toBe('');
    expect(host(h.el, 'a').classList).toContain('grow');
    expect(column.classList).toContain('column');
    expect(column.classList).not.toContain('wrap');
    expect(column.classList).toContain('gap-none');
  });

  it('grid: columns and span limited to the available columns', async () => {
    const h = await renderScreen({ components: [{ type: 'grid', columns: 3, components: [text('a', { span: 2 }), text('b'), text('c', { span: 9 })] }] });
    expect((h.el.querySelector('lc-grid .grid') as HTMLElement).style.getPropertyValue('--lc-grid-columns')).toBe('3');
    expect(['a', 'b', 'c'].map((id) => host(h.el, id).style.getPropertyValue('--lc-span'))).toEqual(['2', '1', '3']);
  });

  it('grid without columns: two columns', async () => {
    const two = await renderScreen({ components: [{ type: 'grid', components: [text('x')] }] });
    expect((two.el.querySelector('lc-grid .grid') as HTMLElement).style.getPropertyValue('--lc-grid-columns')).toBe('2');
  });

  it('border: children by region (center when not given), only the regions used take space', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'border',
          westWidth: 200,
          components: [text('title', { region: 'north' }), text('menu', { region: 'west' }), text('body'), text('other', { region: 'center' }), text('footer', { region: 'south' })],
        },
      ],
    });
    const regions = [...h.el.querySelectorAll<HTMLElement>('lc-border .region')];
    expect(regions.map((r) => r.dataset['region'])).toEqual(['north', 'west', 'center', 'south']);
    expect(regions.map((r) => [...r.querySelectorAll('lc-node')].map((n) => n.getAttribute('data-node-id')))).toEqual([['title'], ['menu'], ['body', 'other'], ['footer']]);
    const grid = h.el.querySelector('lc-border .border') as HTMLElement;
    expect(grid.style.getPropertyValue('--lc-border-columns')).toBe('200px minmax(0, 1fr)');
    expect(grid.style.getPropertyValue('--lc-border-areas')).toBe('"north north" "west center" "south south"');
  });

  it('children of containers respect visibility and prepare the state of their fields before the first load', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'grid',
          components: [
            { type: 'border', components: [{ type: 'box', components: [{ type: 'input', default: 'x', field: { name: 'q', type: 'text', label: 'Q' } }] }] },
            text('hidden', { visibleIf: '{{ false }}' }),
          ],
        },
      ],
      dataSources: { rows: { type: 'rest', method: 'GET', url: '/api/rows', params: { q: '{{ state.q }}' } } },
      respond: () => [],
    });
    await h.until(() => h.requests.length > 0, 'loading');
    expect(h.requests[0].query).toEqual({ q: 'x' });
    expect(plain(host(h.el, 'hidden').textContent)).toBe('');
  });

  it('resizable border: accessible dividers, keyboard and dragging within 120–600px', async () => {
    const h = await renderScreen({
      components: [{ type: 'border', resizable: true, westWidth: 200, components: [text('menu', { region: 'west' }), text('body'), text('note', { region: 'east' })] }],
    });
    const [west, east] = [...h.el.querySelectorAll<HTMLElement>('lc-border .handle')];
    const columns = () => (h.el.querySelector('lc-border .border') as HTMLElement).style.getPropertyValue('--lc-border-columns');
    expect(west.getAttribute('role')).toBe('separator');
    expect(west.getAttribute('aria-label')).toBe('Width of the left panel');
    expect([west.getAttribute('aria-valuenow'), east.getAttribute('aria-valuenow')]).toEqual(['200', '240']);
    west.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    east.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    await h.settle();
    expect(columns()).toBe('216px minmax(0, 1fr) 176px');
    west.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await h.settle();
    expect(west.getAttribute('aria-valuenow')).toBe('120');
    // Dragging: 500px to the right stop at the maximum.
    const pointer = (type: string, x: number) => west.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x }), { pointerId: 1 }));
    pointer('pointerdown', 100);
    pointer('pointermove', 600);
    pointer('pointerup', 600);
    await h.settle();
    expect(west.getAttribute('aria-valuenow')).toBe('600');
  });

  it('border without resizable: no divider', async () => {
    const h = await renderScreen({ components: [{ type: 'border', components: [text('menu', { region: 'west' }), text('body')] }] });
    expect(h.el.querySelector('lc-border .handle')).toBeNull();
  });
});
