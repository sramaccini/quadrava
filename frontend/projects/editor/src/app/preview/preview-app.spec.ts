import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { NavigationDefinition, ScreenDefinition, ThemeDefinition } from 'schema';
import { vi } from 'vitest';
import { PreviewApp } from './preview-app';
import { previewConfig } from './preview-config';
import { previewState, type FromPreview, type PreviewState } from './protocol';

describe('anteprima (dentro l’iframe)', () => {
  let fixture: ComponentFixture<PreviewApp>;
  let el: HTMLElement;
  let sent: FromPreview[];

  const screen: ScreenDefinition = {
    schemaVersion: '1.0',
    screen: 'prova',
    dataSources: { elenco: { type: 'rest', method: 'GET', url: '/api/elenco' } },
    components: [
      { id: 'pulsante', type: 'button', label: 'Avvisa', onClick: [{ toast: 'Fatto' }] },
      { id: 'tabella', type: 'table', source: 'elenco', columns: [{ field: 'nome', label: 'Nome' }] },
      {
        id: 'schede',
        type: 'tabs',
        tabs: [
          { label: 'Prima', components: [{ id: 'testo-1', type: 'text', text: 'Uno' }] },
          { label: 'Seconda', components: [{ id: 'testo-2', type: 'text', text: 'Due' }] },
        ],
      },
    ],
  } as ScreenDefinition;

  beforeEach(async () => {
    sent = [];
    if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => undefined;
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    // In jsdom la finestra «padre» è la stessa: si registra quello che l'anteprima manda all'editor.
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => void sent.push(message as FromPreview));
    TestBed.configureTestingModule({ providers: previewConfig.providers });
    fixture = TestBed.createComponent(PreviewApp);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
    document.getElementById('lc-nz-dark-theme')?.remove();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function until(condition: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      await settle();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timeout: ${label}`);
  }

  async function deliver(state: Partial<PreviewState>, origin = location.origin): Promise<void> {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-preview:state', state: previewState(state) }, origin, source: window }));
    await settle();
  }

  it('si dichiara pronta, disegna lo stato ricevuto e risponde con i dati di esempio', async () => {
    expect(sent).toContainEqual({ type: 'lc-preview:ready' });
    await deliver({ screen, samples: { elenco: [{ nome: 'Mario' }] } });
    await until(() => !!el.querySelector('lc-table tbody')?.textContent?.includes('Mario'), 'riga di esempio');
    expect(sent).toContainEqual({ type: 'lc-preview:event', event: { kind: 'request', text: 'GET /api/elenco → elenco' } });
  });

  it('ignora i messaggi che non vengono dall’editor della stessa origine', async () => {
    await deliver({ screen }, 'https://altro.example');
    expect(el.querySelector('lc-screen')).toBeNull();
  });

  it('Alt+clic, o un clic in modalità selezione, manda all’editor l’id del componente senza attivarlo', async () => {
    await deliver({ screen });
    await until(() => !!el.querySelector('lc-node[data-node-id="pulsante"] button'), 'pulsante');
    (el.querySelector('lc-node[data-node-id="pulsante"] button') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
    await settle();
    expect(sent).toContainEqual({ type: 'lc-preview:select', id: 'pulsante' });
    expect(document.querySelector('.ant-message-notice')).toBeNull();
    await deliver({ screen, selectMode: true });
    (el.querySelector('lc-node[data-node-id="testo-1"] lc-text') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sent).toContainEqual({ type: 'lc-preview:select', id: 'testo-1' });
  });

  it('un componente trascinato dalla tavolozza sul disegno: indicatore e messaggio di rilascio all’editor', async () => {
    await deliver({ screen });
    await until(() => !!el.querySelector('lc-node[data-node-id="pulsante"]'), 'pulsante');
    const node = el.querySelector('lc-node[data-node-id="pulsante"]') as HTMLElement;
    const drag = (type: string, target: Element, clientY = 0) => {
      const data = { types: ['application/x-lc-node-type'], getData: (t: string) => (t === 'application/x-lc-node-type' ? 'input.select' : ''), dropEffect: '' };
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', { value: data });
      target.dispatchEvent(event);
      return event;
    };
    // In jsdom i nodi non hanno dimensioni: il puntatore cade a metà, quindi «dopo».
    expect(drag('dragover', node).defaultPrevented).toBe(true);
    await settle();
    expect(el.querySelector('.drop')).not.toBeNull();
    drag('drop', node);
    await settle();
    expect(sent).toContainEqual({ type: 'lc-preview:drop', kind: 'input.select', targetId: 'pulsante', zone: 'after' });
    expect(el.querySelector('.drop')).toBeNull();
  });

  it('in modalità selezione i componenti si trascinano per spostarli; dentro una griglia c’è la maniglia', async () => {
    const withGrid: ScreenDefinition = { ...screen, components: [...screen.components, { id: 'griglia', type: 'grid', columns: 3, components: [{ id: 'cella', type: 'text', text: 'In griglia' }] }] };
    await deliver({ screen: withGrid });
    await until(() => !!el.querySelector('lc-node[data-node-id="cella"]'), 'griglia');
    expect(el.querySelector('lc-node[data-node-id="pulsante"]')?.getAttribute('draggable')).toBeNull();
    // In jsdom gli elementi non hanno dimensioni: senza misure non c'è riquadro né maniglia.
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({}) } as DOMRect);
    await deliver({ screen: withGrid, selectMode: true, selectedId: 'cella' });
    expect(el.querySelector('lc-node[data-node-id="pulsante"]')?.getAttribute('draggable')).toBe('true');
    expect(el.querySelector('.resize')).not.toBeNull();
    // Il pulsante (fuori da griglie e box) non ha maniglia.
    await deliver({ screen: withGrid, selectMode: true, selectedId: 'pulsante' });
    expect(el.querySelector('.resize')).toBeNull();
    const store = new Map<string, string>();
    const data = { types: [] as string[], setData: (t: string, v: string) => (store.set(t, v), data.types.push(t)), getData: (t: string) => store.get(t) ?? '', dropEffect: '', effectAllowed: '' };
    const drag = (type: string, target: Element) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', { value: data });
      target.dispatchEvent(event);
    };
    drag('dragstart', el.querySelector('lc-node[data-node-id="pulsante"] button')!);
    drag('dragover', el.querySelector('lc-node[data-node-id="tabella"]')!);
    await settle();
    drag('drop', el.querySelector('lc-node[data-node-id="tabella"]')!);
    expect(sent).toContainEqual({ type: 'lc-preview:move', id: 'pulsante', targetId: 'tabella', zone: 'before' });
    rect.mockRestore();
  });

  it('il nodo selezionato in una scheda nascosta fa aprire quella scheda', async () => {
    await deliver({ screen });
    await until(() => el.querySelector('.ant-tabs-tab-active')?.textContent?.trim() === 'Prima', 'prima scheda');
    await deliver({ screen, selectedId: 'testo-2' });
    await until(() => el.querySelector('.ant-tabs-tab-active')?.textContent?.trim() === 'Seconda', 'seconda scheda');
    // Ogni messaggio arriva clonato: una schermata uguale non si ridisegna, quindi la scheda resta quella aperta.
    await deliver({ screen: structuredClone(screen), selectedId: null });
    await settle();
    expect(el.querySelector('.ant-tabs-tab-active')?.textContent?.trim()).toBe('Seconda');
  });

  it('menu con il profilo simulato, traduzioni dell’editor, tema scuro con il suo foglio di stile', async () => {
    const navigation = {
      schemaVersion: '1.0',
      navigation: 'prova',
      areas: [
        {
          id: 'caso',
          label: 'Caso',
          items: [
            { id: 'ordini', label: "{{ t('p.ordini', 'Ordini') }}", screen: 'ordini', requires: 'ordini.ordine.leggi' },
            { id: 'altro', label: 'Altro', screen: 'altro' },
          ],
        },
      ],
    } as NavigationDefinition;
    const theme = {
      schemaVersion: '1.0',
      theme: 'notte',
      mode: 'dark',
      tokens: { colors: { primary: '#6aa6ff', onPrimary: '#0b1220', background: '#0f141b', surface: '#1a222d', onSurface: '#e6ebf2', border: '#2a3442' } },
    } as ThemeDefinition;
    const menu = (): string => el.querySelector('lc-sidebar')?.textContent?.replace(/\s+/g, ' ') ?? '';
    await deliver({ navigation, theme, locale: 'en', translations: { en: { 'p.ordini': 'Orders' } } });
    await until(() => menu().includes('Orders'), 'voce tradotta');
    // Il menu da solo: nessuna schermata accanto.
    expect(el.querySelector('lc-screen')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--lc-color-background')).toBe('#0f141b');
    expect(document.getElementById('lc-nz-dark-theme')).not.toBeNull();
    await deliver({ navigation, theme, locale: 'en', granted: [] });
    await until(() => !menu().includes('Orders') && menu().includes('Altro'), 'voce senza permesso nascosta');
  });
});
