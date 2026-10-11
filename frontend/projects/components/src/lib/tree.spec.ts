import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { highlight } from './tree.component';

describe('vista ad albero', () => {
  it('evidenzia le parti cercate senza distinguere maiuscole e minuscole', () => {
    expect(highlight('Cancelleria e carta', 'CA')).toEqual([
      { text: 'Ca', match: true },
      { text: 'ncelleria e ', match: false },
      { text: 'ca', match: true },
      { text: 'rta', match: false },
    ]);
    expect(highlight('Hotel', '')).toEqual([{ text: 'Hotel', match: false }]);
  });

  const data = [
    { codice: 'A', nome: 'Acquisti', figli: [{ codice: 'A1', nome: 'Cancelleria <b>x</b>', figli: [] }, { codice: 'A2', nome: 'Informatica' }] },
    { codice: 'S', nome: 'Servizi', figli: [{ codice: 'S1', nome: 'Consulenze', figli: [{ codice: 'S11', nome: 'Legali' }] }] },
  ];
  const tree = (extra: Record<string, unknown> = {}): NodeDefinition =>
    ({
      type: 'tree',
      source: 'categorie',
      keyField: 'codice',
      labelField: 'nome',
      childrenField: 'figli',
      bind: 'state.categoria',
      searchable: true,
      onSelect: [{ toast: 'scelta {{ row.nome }}' }],
      ...extra,
    }) as NodeDefinition;
  const dataSources = { categorie: { type: 'rest' as const, method: 'GET' as const, url: '/api/categorie' } };
  const titles = (h: ScreenHarness): string[] => [...h.el.querySelectorAll('lc-tree .title')].map((t) => plain(t.textContent));
  const title = (h: ScreenHarness, text: string): HTMLElement => [...h.el.querySelectorAll<HTMLElement>('lc-tree .title')].find((t) => plain(t.textContent) === text)!;

  it('apre il primo livello, scrive la chiave scelta nello stato ed esegue onSelect con il nodo', async () => {
    const h = await renderScreen({ components: [tree(), { type: 'text', text: 'Scelta: {{ state.categoria }}' }], dataSources, respond: () => data });
    await h.until(() => titles(h).length > 0, 'albero');
    // Primo livello aperto: si vedono le radici e i loro figli, non i nipoti.
    expect(titles(h)).toEqual(['Acquisti', 'Cancelleria <b>x</b>', 'Informatica', 'Servizi', 'Consulenze']);
    expect(h.el.querySelector('lc-tree .title b')).toBeNull();
    title(h, 'Informatica').click();
    await h.until(() => h.toasts.length === 1, 'scelta');
    expect(h.toasts).toEqual(['scelta Informatica']);
    expect(plain(h.el.querySelector('lc-text')?.textContent)).toBe('Scelta: A2');
    expect(h.el.querySelector('.ant-tree-node-selected')?.textContent).toContain('Informatica');
    // Da tastiera: Invio sul titolo.
    title(h, 'Consulenze').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await h.until(() => h.toasts.length === 2, 'scelta da tastiera');
    expect(plain(h.el.querySelector('lc-text')?.textContent)).toBe('Scelta: S1');
  });

  it('la ricerca evidenzia il testo trovato; expandAll apre tutti i rami', async () => {
    const h = await renderScreen({ components: [tree({ expandAll: true })], dataSources, respond: () => data });
    await h.until(() => titles(h).includes('Legali'), 'tutti i rami aperti');
    const search = h.el.querySelector('lc-tree input[type="search"]') as HTMLInputElement;
    search.value = 'leg';
    search.dispatchEvent(new Event('input'));
    await h.settle();
    expect([...h.el.querySelectorAll('lc-tree mark')].map((m) => m.textContent)).toEqual(['Leg']);
    // Nessuno spazio aggiunto tra la parte trovata e il resto della parola.
    expect(h.el.querySelector('lc-tree mark')?.closest('.title')?.textContent?.trim()).toBe('Legali');
  });
});
