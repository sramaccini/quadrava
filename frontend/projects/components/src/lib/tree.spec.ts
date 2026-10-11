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

  it('da tastiera: frecce, Home e Fine si spostano, destra e sinistra aprono e chiudono, Invio sceglie; Tab raggiunge un solo nodo', async () => {
    const h = await renderScreen({ components: [tree()], dataSources, respond: () => data });
    await h.until(() => titles(h).length > 0, 'albero');
    const key = (k: string, el: HTMLElement): void => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    };
    const focused = (): string => plain((document.activeElement as HTMLElement | null)?.textContent);
    const tabbable = (): string[] => [...h.el.querySelectorAll<HTMLElement>('lc-tree .title[tabindex="0"]')].map((t) => plain(t.textContent));
    expect(h.el.querySelector('nz-tree')?.getAttribute('role')).toBe('tree');
    expect(tabbable()).toEqual(['Acquisti']);
    const acquisti = title(h, 'Acquisti');
    expect(acquisti.getAttribute('aria-expanded')).toBe('true');
    expect(acquisti.getAttribute('aria-level')).toBe('1');
    acquisti.focus();
    key('ArrowDown', acquisti);
    await h.settle();
    expect(focused()).toBe('Cancelleria <b>x</b>');
    expect(tabbable()).toEqual(['Cancelleria <b>x</b>']);
    key('ArrowLeft', document.activeElement as HTMLElement);
    await h.settle();
    expect(focused()).toBe('Acquisti');
    // Sinistra su un ramo aperto lo chiude.
    key('ArrowLeft', title(h, 'Acquisti'));
    await h.settle();
    expect(title(h, 'Acquisti').getAttribute('aria-expanded')).toBe('false');
    expect(title(h, 'Informatica').getAttribute('data-shown')).toBe('false');
    // Destra lo riapre, poi entra nel primo figlio.
    key('ArrowRight', title(h, 'Acquisti'));
    await h.settle();
    expect(title(h, 'Informatica').getAttribute('data-shown')).toBe('true');
    key('ArrowRight', title(h, 'Acquisti'));
    await h.settle();
    expect(focused()).toBe('Cancelleria <b>x</b>');
    key('End', document.activeElement as HTMLElement);
    await h.settle();
    expect(focused()).toBe('Consulenze');
    // Consulenze ha figli chiusi: destra apre il ramo e mostra «Legali».
    key('ArrowRight', document.activeElement as HTMLElement);
    await h.settle();
    expect(titles(h)).toContain('Legali');
    key('Home', document.activeElement as HTMLElement);
    await h.settle();
    expect(focused()).toBe('Acquisti');
    key(' ', document.activeElement as HTMLElement);
    await h.until(() => h.toasts.length === 1, 'scelta con lo spazio');
    expect(h.toasts).toEqual(['scelta Acquisti']);
    expect(title(h, 'Acquisti').getAttribute('aria-selected')).toBe('true');
  });
});
