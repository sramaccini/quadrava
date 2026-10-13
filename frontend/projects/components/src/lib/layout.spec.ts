import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';

describe('contenitori di layout', () => {
  const text = (id: string, extra: Record<string, unknown> = {}): NodeDefinition => ({ id, type: 'text', text: id, ...extra }) as NodeDefinition;
  const host = (el: HTMLElement, id: string): HTMLElement => el.querySelector(`[data-node-id="${id}"]`) as HTMLElement;

  it('box: direzione, allineamento, distribuzione, a capo, spazio e quote di grow', async () => {
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

  it('griglia: colonne e span limitato alle colonne disponibili', async () => {
    const h = await renderScreen({ components: [{ type: 'grid', columns: 3, components: [text('a', { span: 2 }), text('b'), text('c', { span: 9 })] }] });
    expect((h.el.querySelector('lc-grid .grid') as HTMLElement).style.getPropertyValue('--lc-grid-columns')).toBe('3');
    expect(['a', 'b', 'c'].map((id) => host(h.el, id).style.getPropertyValue('--lc-span'))).toEqual(['2', '1', '3']);
  });

  it('griglia senza columns: due colonne', async () => {
    const two = await renderScreen({ components: [{ type: 'grid', components: [text('x')] }] });
    expect((two.el.querySelector('lc-grid .grid') as HTMLElement).style.getPropertyValue('--lc-grid-columns')).toBe('2');
  });

  it('border: figli per regione (center se non indicata), solo le regioni usate occupano spazio', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'border',
          westWidth: 200,
          components: [text('titolo', { region: 'north' }), text('menu', { region: 'west' }), text('corpo'), text('altro', { region: 'center' }), text('piede', { region: 'south' })],
        },
      ],
    });
    const regions = [...h.el.querySelectorAll<HTMLElement>('lc-border .region')];
    expect(regions.map((r) => r.dataset['region'])).toEqual(['north', 'west', 'center', 'south']);
    expect(regions.map((r) => [...r.querySelectorAll('lc-node')].map((n) => n.getAttribute('data-node-id')))).toEqual([['titolo'], ['menu'], ['corpo', 'altro'], ['piede']]);
    const grid = h.el.querySelector('lc-border .border') as HTMLElement;
    expect(grid.style.getPropertyValue('--lc-border-columns')).toBe('200px minmax(0, 1fr)');
    expect(grid.style.getPropertyValue('--lc-border-areas')).toBe('"north north" "west center" "south south"');
  });

  it('i figli dei contenitori rispettano visibilità e preparano lo stato dei campi prima del primo caricamento', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'grid',
          components: [
            { type: 'border', components: [{ type: 'box', components: [{ type: 'input', default: 'x', field: { name: 'q', type: 'text', label: 'Q' } }] }] },
            text('nascosto', { visibleIf: '{{ false }}' }),
          ],
        },
      ],
      dataSources: { righe: { type: 'rest', method: 'GET', url: '/api/righe', params: { q: '{{ state.q }}' } } },
      respond: () => [],
    });
    await h.until(() => h.requests.length > 0, 'caricamento');
    expect(h.requests[0].query).toEqual({ q: 'x' });
    expect(plain(host(h.el, 'nascosto').textContent)).toBe('');
  });
});
