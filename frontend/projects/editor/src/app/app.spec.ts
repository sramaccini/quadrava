import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import layout from '../../public/examples/vetrina-layout.json';
import { I18n } from 'core';
import { App } from './app';
import { appConfig } from './app.config';
import { EditorStore } from './model/editor-store';
import { getIn as getAt, type Json } from './model/doc-ops';
import { NavigationStore } from './model/navigation-store';
import { EDITOR_REDIRECT } from './model/registry-client';
import { isToPreview, type PreviewState } from './preview/protocol';

const FILES: Record<string, unknown> = { 'examples/index.json': ['vetrina-layout'], 'examples/vetrina-layout.json': layout };

describe('editor delle schermate', () => {
  let fixture: ComponentFixture<App>;
  let el: HTMLElement;
  let store: EditorStore;
  /** Cambi di pagina chiesti dall'editor (login del BFF). */
  let redirects: string[];

  beforeEach(async () => {
    localStorage.clear();
    if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => undefined;
    vi.stubGlobal('fetch', async (url: string) => {
      const body = FILES[url];
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    });
    redirects = [];
    TestBed.configureTestingModule({ providers: [...appConfig.providers, { provide: EDITOR_REDIRECT, useValue: (url: string) => redirects.push(url) }] });
    fixture = TestBed.createComponent(App);
    el = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(EditorStore);
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  const outline = (): string[] => [...el.querySelectorAll('ed-outline .branch button.row')].map((b) => b.querySelector('.label')!.textContent!.trim());
  /**
   * Stati mandati all'iframe di un'anteprima. In jsdom l'iframe non carica l'applicazione: si simula il suo «pronto»
   * e si registra quello che l'editor gli manda.
   */
  const posted = new Map<Window, PreviewState[]>();
  async function frameWindow(host: string): Promise<Window> {
    await until(() => !!el.querySelector(`${host} iframe`), `iframe di ${host}`);
    const win = (el.querySelector(`${host} iframe`) as HTMLIFrameElement).contentWindow!;
    if (!posted.has(win)) {
      posted.set(win, []);
      vi.spyOn(win, 'postMessage').mockImplementation((message: unknown) => {
        if (isToPreview(message)) posted.get(win)!.push(message.state);
      });
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-preview:ready' }, origin: location.origin, source: win }));
      await settle();
    }
    return win;
  }
  async function untilState(host: string, condition: (state: PreviewState) => boolean, label: string): Promise<PreviewState> {
    const win = await frameWindow(host);
    await until(() => {
      const last = posted.get(win)!.at(-1);
      return !!last && condition(last);
    }, label);
    return posted.get(win)!.at(-1)!;
  }
  /** Un messaggio dall'iframe di un'anteprima all'editor. */
  async function fromFrame(host: string, data: unknown): Promise<void> {
    const win = await frameWindow(host);
    window.dispatchEvent(new MessageEvent('message', { data, origin: location.origin, source: win }));
    await settle();
  }
  const screenOf = (state: PreviewState): Json => state.screen as unknown as Json;
  const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const tab = (index: number): void => (el.querySelectorAll('.center .ant-tabs-tab')[index] as HTMLElement).click();

  it('dalla tavolozza alla struttura, alle proprietà e all’anteprima', async () => {
    expect(el.querySelector('ed-outline .empty')).not.toBeNull();
    (el.querySelector('ed-palette button[data-type="section"]') as HTMLButtonElement).click();
    await settle();
    expect(outline()).toEqual(['Sezione']);
    expect(el.querySelector('ed-inspector .kind')?.textContent).toBe('Sezione');
    type(el.querySelector('#prop-title') as HTMLTextAreaElement, 'Riepilogo');
    await untilState('ed-preview', (st) => getAt(screenOf(st), ['components', 0, 'title']) === 'Riepilogo', 'titolo nell’anteprima');
    // Dentro la sezione selezionata finisce il nodo successivo.
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    await untilState('ed-preview', (st) => getAt(screenOf(st), ['components', 0, 'components', 0, 'type']) === 'alert', 'messaggio dentro la sezione');
    expect(store.selection()).toEqual(['components', 0, 'components', 0]);
    expect(el.querySelector('.status')?.textContent).toContain('Valida');
  });

  it('un errore si vede nelle proprietà, nell’elenco dei problemi e nella struttura; l’anteprima resta all’ultima versione valida', async () => {
    (el.querySelector('ed-palette button[data-type="text"]') as HTMLButtonElement).click();
    await untilState('ed-preview', (st) => getAt(screenOf(st), ['components', 0, 'type']) === 'text', 'testo nell’anteprima');
    type(el.querySelector('#prop-text') as HTMLTextAreaElement, '{{ 1 + }}');
    await settle();
    expect(el.querySelector('.status')?.textContent).toContain('Errori: 1');
    expect(el.querySelector('ed-inspector .prop.invalid .issue')).not.toBeNull();
    expect(el.querySelector('ed-outline .mark.error')).not.toBeNull();
    expect(el.querySelector('ed-preview nz-alert')).not.toBeNull();
    // All'iframe resta l'ultima versione valida.
    await new Promise((r) => setTimeout(r, 300));
    const last = await untilState('ed-preview', () => true, 'stato');
    expect(getAt(screenOf(last), ['components', 0, 'text'])).toBe('Nuovo testo');
    store.select([]);
    await settle();
    (el.querySelector('ed-issues button') as HTMLButtonElement).click();
    await settle();
    expect(store.selection()).toEqual(['components', 0]);
  });

  it('data source con dati di esempio: l’anteprima li mostra; rinominare aggiorna la tabella', async () => {
    (el.querySelector('ed-palette button[data-type="table"]') as HTMLButtonElement).click();
    await settle();
    // Il campo source suggerisce i data source della schermata.
    const source = el.querySelector('#prop-source') as HTMLInputElement;
    expect([...document.querySelectorAll('#' + source.getAttribute('list') + ' option')].map((o) => (o as HTMLOptionElement).value)).toEqual(['elenco']);
    tab(2);
    await until(() => !!el.querySelector('ed-data-sources article'), 'pannello dei data source');
    expect(el.querySelector('ed-data-sources article')?.getAttribute('aria-label')).toBe('elenco');
    const sample = el.querySelector('#src-sample-elenco') as HTMLTextAreaElement;
    type(sample, '[{"id": 1, "descrizione": "Prima riga"}]');
    sample.dispatchEvent(new Event('blur'));
    const name = el.querySelector('#src-name-elenco') as HTMLInputElement;
    name.value = 'ordini';
    name.dispatchEvent(new Event('change'));
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'source'])).toBe('ordini');
    tab(0);
    const shown = await untilState('ed-preview', (st) => getAt(screenOf(st), ['components', 0, 'source']) === 'ordini', 'tabella rinominata');
    expect(shown.samples).toEqual({ ordini: [{ id: 1, descrizione: 'Prima riga' }] });
    expect(getAt(screenOf(shown), ['dataSources', 'ordini', 'url'])).toBe('/api/elenco');
  });

  it('JSON: il testo non valido non tocca il documento; quello valido si applica e si annulla con Ctrl+Z', async () => {
    tab(1);
    await until(() => !!el.querySelector('ed-json-view textarea'), 'vista JSON');
    const area = el.querySelector('ed-json-view textarea') as HTMLTextAreaElement;
    const apply = el.querySelector('ed-json-view button') as HTMLButtonElement;
    type(area, '{ rotto');
    await settle();
    apply.click();
    await settle();
    expect(el.querySelector('ed-json-view .error')).not.toBeNull();
    type(area, JSON.stringify({ schemaVersion: '1.0', screen: 'da-json', components: [{ type: 'text', text: 'Da JSON' }] }));
    await settle();
    apply.click();
    await settle();
    expect(getAt(store.doc(), ['screen'])).toBe('da-json');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await settle();
    expect(getAt(store.doc(), ['screen'])).toBe('nuova-schermata');
  });

  it('elenchi nelle proprietà: colonne campo per campo, passi per variante, e come JSON', async () => {
    (el.querySelector('ed-palette button[data-type="table"]') as HTMLButtonElement).click();
    await settle();
    const columns = (): HTMLElement => el.querySelector('ed-inspector [data-prop="columns"]') as HTMLElement;
    expect([...columns().querySelectorAll('.summary')].map((s) => s.textContent?.trim())).toEqual(['Id (id)', 'Descrizione (descrizione)']);
    // Si apre la seconda colonna e se ne cambia il formato.
    (columns().querySelectorAll('.item-toggle')[1] as HTMLButtonElement).click();
    await settle();
    type(columns().querySelector('#prop-columns-1-label') as HTMLInputElement, 'Note');
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'columns', 1, 'label'])).toBe('Note');
    // Una colonna nuova in fondo, poi spostata in cima.
    (columns().querySelector(':scope > .list > button') as HTMLButtonElement).click();
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'columns', 2])).toEqual({ field: 'campo3', label: 'Descrizione' });
    const up = columns().querySelectorAll(':scope > .list > .items > .item')[2].querySelector('button[aria-label^="Sposta su"]') as HTMLButtonElement;
    up.click();
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'columns', 1, 'field'])).toBe('campo3');
    // Vista JSON dell'elenco.
    (columns().querySelector(':scope > .list > .list-head button') as HTMLButtonElement).click();
    await settle();
    expect((columns().querySelector(':scope > .list > ed-json-field textarea') as HTMLTextAreaElement).value).toContain('"campo3"');

    // Pulsante: un passo nuovo scelto dalla variante.
    store.select([]);
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    await settle();
    const steps = el.querySelector('ed-inspector [data-prop="onClick"]') as HTMLElement;
    expect(steps.querySelector('.summary')?.textContent?.trim()).toBe('toast: Fatto');
    (steps.querySelector('button[nz-dropdown]') as HTMLButtonElement).click();
    await until(() => document.querySelectorAll('.ant-dropdown-menu-item').length === 10, 'varianti dei passi');
    ([...document.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item')].find((i) => i.textContent?.includes('refresh')) as HTMLElement).click();
    await settle();
    expect(getAt(store.doc(), ['components', 1, 'onClick', 1])).toEqual({ refresh: '' });
    // Il passo nuovo è aperto: il data source si scrive nel suo campo.
    type(steps.querySelector('#prop-onClick-1-refresh') as HTMLInputElement, 'elenco');
    await settle();
    expect(getAt(store.doc(), ['components', 1, 'onClick', 1])).toEqual({ refresh: 'elenco' });
    expect(store.issues()).toEqual([]);
  });

  it('dalla tavolozza all’anteprima: un componente rilasciato sul disegno si inserisce prima, dopo o dentro il nodo', async () => {
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    store.select([]);
    (el.querySelector('ed-palette button[data-type="box"]') as HTMLButtonElement).click();
    await untilState('ed-preview', (st) => !!st.screen, 'anteprima');
    await fromFrame('ed-preview', { type: 'lc-preview:drop', kind: 'text', targetId: 'button-1', zone: 'before' });
    expect((store.doc() as { components: { type: string }[] }).components.map((c) => c.type)).toEqual(['text', 'button', 'box']);
    await fromFrame('ed-preview', { type: 'lc-preview:drop', kind: 'input.date', targetId: 'box-1', zone: 'inside' });
    expect(getAt(store.doc(), ['components', 2, 'components', 0])).toMatchObject({ type: 'input', field: { type: 'date' } });
    await fromFrame('ed-preview', { type: 'lc-preview:drop', kind: 'alert', targetId: null, zone: 'after' });
    expect(getAt(store.doc(), ['components', 3, 'type'])).toBe('alert');
    // Un messaggio non valido non fa nulla.
    await fromFrame('ed-preview', { type: 'lc-preview:drop', kind: 'x<script>', targetId: null, zone: 'after' });
    expect((store.doc() as { components: unknown[] }).components.length).toBe(4);
  });

  it('dall’anteprima alla struttura: il componente scelto nell’iframe si seleziona; solo i messaggi del proprio iframe contano', async () => {
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    store.select([]);
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    // Il nodo selezionato è quello da evidenziare nell'anteprima.
    await untilState('ed-preview', (st) => st.selectedId === 'alert-1' && !!st.screen, 'nodo selezionato');
    await fromFrame('ed-preview', { type: 'lc-preview:select', id: 'button-1' });
    expect(store.selection()).toEqual(['components', 0]);
    // Un messaggio da un'altra finestra non conta.
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-preview:select', id: 'alert-1' }, origin: location.origin, source: window }));
    await settle();
    expect(store.selection()).toEqual(['components', 0]);
    // Modalità selezione e registro.
    ([...el.querySelectorAll('ed-preview .bar button')].find((b) => b.textContent?.includes('Seleziona')) as HTMLButtonElement).click();
    await untilState('ed-preview', (st) => st.selectMode, 'modalità selezione');
    await fromFrame('ed-preview', { type: 'lc-preview:event', event: { kind: 'request', text: 'GET /api/elenco' } });
    expect(el.querySelector('ed-preview .bar')?.textContent).toContain('Registro (1)');
  });
  it('testi: le traduzioni si salvano nel registro unite al catalogo esistente e si pubblicano', async () => {
    localStorage.setItem('lc.editor.registry', JSON.stringify({ appId: 'demo', env: 'sviluppo' }));
    const calls: { url: string; method: string; body?: string; ifMatch?: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const headers = (init.headers ?? {}) as Record<string, string>;
      if (url.startsWith('/registry')) calls.push({ url, method, body: init.body as string | undefined, ifMatch: headers['If-Match'] });
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
      if (url === '/registry/apps/demo/documents/messages/it/versions' && method === 'GET') return json([{ hash: 'h-it', createdAt: '2026-10-13T08:00:00Z', author: 'mario' }]);
      if (url.endsWith('/versions') && method === 'GET') return json([]);
      if (url.endsWith('/versions/h-it')) return json({ schemaVersion: '1.0', messages: 'it', texts: { 'app.title': 'Titolo', 'x.y': 'vecchio' } });
      if (url.endsWith('/versions') && method === 'POST') return json({ hash: 'nuovo', createdAt: '2026-10-13T09:00:00Z', author: 'mario' }, 201);
      if (url.includes('/published')) return { ok: true, status: 204, json: async () => undefined };
      const body = FILES[url];
      return body ? json(body) : { ok: false, status: 404, json: async () => ({}) };
    });
    store.setTranslation('it', 'x.y', 'nuovo');
    store.setTranslation('en', 'x.y', 'new');
    tab(3);
    await until(() => !!el.querySelector('ed-texts .head-actions'), 'pannello dei testi');
    ([...el.querySelectorAll<HTMLButtonElement>('ed-texts .head-actions button')].find((b) => b.textContent?.includes('Salva nel registro')) as HTMLButtonElement).click();
    await until(() => calls.filter((c) => c.method === 'PUT').length === 2, 'pubblicazioni');
    const saves = calls.filter((c) => c.method === 'POST');
    expect(saves.map((c) => [c.url, c.ifMatch])).toEqual([
      ['/registry/apps/demo/documents/messages/it/versions', '"h-it"'],
      ['/registry/apps/demo/documents/messages/en/versions', undefined],
    ]);
    // Le chiavi già nel catalogo restano; quelle modificate si sostituiscono.
    expect(JSON.parse(saves[0].body!)).toEqual({ schemaVersion: '1.0', messages: 'it', texts: { 'app.title': 'Titolo', 'x.y': 'nuovo' } });
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.url)).toEqual([
      '/registry/apps/demo/documents/messages/it/published?env=sviluppo',
      '/registry/apps/demo/documents/messages/en/published?env=sviluppo',
    ]);
    localStorage.removeItem('lc.editor.registry');
  });

  it('testi: un testo semplice diventa traducibile, la traduzione inglese vale subito nell’anteprima', async () => {
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    await settle();
    expect(el.querySelectorAll('.center .ant-tabs-tab')[3].textContent?.trim()).toBe('Testi (2)');
    tab(3);
    await until(() => !!el.querySelector('ed-texts tbody tr'), 'elenco dei testi');
    const row = (): HTMLElement => [...el.querySelectorAll<HTMLElement>('ed-texts tbody tr')].find((r) => r.textContent?.includes('Messaggio'))!;
    (row().querySelector('button.convert') as HTMLButtonElement).click();
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'text'])).toBe("{{ t('nuova_schermata.messaggio_per_l_utente', 'Messaggio per l’utente') }}");
    const english = row().querySelector('input[aria-label$=" en"]') as HTMLInputElement;
    expect(english.getAttribute('aria-invalid')).toBe('true');
    english.value = 'Message for the user';
    english.dispatchEvent(new Event('change'));
    await settle();
    expect(row().querySelector('input[aria-label$=" en"]')?.getAttribute('aria-invalid')).toBeNull();
    TestBed.inject(I18n).setLocale('en');
    tab(0);
    await untilState('ed-preview', (st) => st.locale === 'en' && st.translations['en']?.['nuova_schermata.messaggio_per_l_utente'] === 'Message for the user', 'traduzione all’anteprima');
  });

  it('navigazione: struttura, campi dallo schema, menu vero con un profilo simulato', async () => {
    ([...el.querySelectorAll<HTMLElement>('.mode .ant-segmented-item')].find((i) => i.textContent?.includes('Navigazione')) as HTMLElement).click();
    await until(() => !!el.querySelector('ed-navigation-editor'), 'editor della navigazione');
    const nav = TestBed.inject(NavigationStore);
    const menu = (st: PreviewState): string => JSON.stringify(st.navigation);
    await untilState('ed-navigation-editor', (st) => menu(st).includes('Nuova voce') && !st.screen, 'menu nell’anteprima');
    // Una voce che richiede un permesso.
    nav.select(['useCases', 0, 'items', 0]);
    await settle();
    expect(el.querySelector('ed-navigation-editor .kind')?.textContent).toBe('Voce');
    type(el.querySelector('ed-navigation-editor #prop-label') as HTMLInputElement, 'Ordini');
    type(el.querySelector('ed-navigation-editor #prop-requires') as HTMLInputElement, 'ordini.ordine.leggi');
    await untilState('ed-navigation-editor', (st) => menu(st).includes('Ordini') && st.granted === null, 'etichetta nuova nel menu');
    // Profilo senza il permesso: la voce sparisce.
    (el.querySelector('ed-navigation-editor .profile nz-switch') as HTMLElement).click();
    await settle();
    (el.querySelector('ed-navigation-editor .permissions input') as HTMLInputElement).click();
    await untilState('ed-navigation-editor', (st) => Array.isArray(st.granted) && !st.granted.includes('ordini.ordine.leggi'), 'profilo senza il permesso');
    // Il gruppo si aggiunge dalla barra della struttura; Ctrl+Z vale per la navigazione.
    ([...el.querySelectorAll<HTMLButtonElement>('ed-navigation-editor .add button')].find((b) => b.textContent?.includes('Gruppo')) as HTMLButtonElement).click();
    await settle();
    expect(nav.target()).toEqual({ kind: 'group', level: 1 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await settle();
    expect(getAt(nav.doc(), ['useCases', 0, 'items'])).toHaveLength(1);
    // Problemi della navigazione in basso: la voce iniziale apre una schermata che non è tra quelle note.
    expect(el.querySelector('.bottom')?.textContent).toContain('Schermata «nuova-schermata» non trovata tra quelle note');
  });

  it('tema: i token si modificano dai campi e vanno all’anteprima con la schermata in modifica; con errori resta l’ultimo valido', async () => {
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    ([...el.querySelectorAll<HTMLElement>('.mode .ant-segmented-item')].find((i) => i.textContent?.includes('Tema')) as HTMLElement).click();
    await untilState('ed-theme-editor', (st) => st.theme?.tokens.colors.primary === '#1f5fbf' && getAt(screenOf(st), ['components', 0, 'type']) === 'alert', 'tema e schermata');
    const primary = el.querySelector('ed-theme-editor #prop-tokens-colors-primary') as HTMLInputElement;
    expect(primary.previousElementSibling?.getAttribute('type')).toBe('color');
    type(primary, '#aa3300');
    await untilState('ed-theme-editor', (st) => st.theme?.tokens.colors.primary === '#aa3300', 'colore nuovo');
    // L'editor non cambia: il tema vale solo nell'iframe.
    expect(document.documentElement.style.getPropertyValue('--lc-color-primary')).not.toBe('#aa3300');
    type(primary, 'rosso');
    await settle();
    expect(el.querySelector('.status')?.textContent).toContain('Errori: 1');
    const last = await untilState('ed-theme-editor', () => true, 'stato');
    expect(last.theme?.tokens.colors.primary).toBe('#aa3300');
  });
  it('espressioni: l’aiuto propone variabili e funzioni e le inserisce al cursore', async () => {
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    await settle();
    (el.querySelector('ed-inspector details.conditions') as HTMLDetailsElement).open = true;
    const help = el.querySelector('ed-inspector [data-prop="visibleIf"] details.hints') as HTMLDetailsElement;
    help.open = true;
    help.dispatchEvent(new Event('toggle'));
    await settle();
    const chip = [...help.querySelectorAll<HTMLButtonElement>('.chip')].find((c) => c.textContent?.trim() === 'user.username')!;
    chip.click();
    await settle();
    expect(getAt(store.doc(), ['components', 0, 'visibleIf'])).toBe('{{ user.username }}');
    expect(store.issues()).toEqual([]);
  });

  it('registro: salva una versione del documento aperto, mostra lo storico, pubblica; con errori non salva', async () => {
    const calls: { url: string; method: string }[] = [];
    const versions = [{ hash: 'a1b2c3d4e5f6', createdAt: '2026-10-13T08:00:00Z', author: 'mario' }];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (url.startsWith('/registry')) calls.push({ url, method });
      const json = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
      if (url.endsWith('/versions') && method === 'POST') return json(versions[0], 201);
      if (url.endsWith('/versions')) return json(versions);
      if (url.endsWith('/documents')) return json([{ kind: 'screen', id: 'nuova-schermata', publishedEnvironments: { sviluppo: 'a1b2c3d4e5f6' } }]);
      if (url.includes('/published')) return { ok: true, status: 204, json: async () => undefined };
      const body = FILES[url];
      return body ? json(body) : { ok: false, status: 404, json: async () => ({}) };
    });
    ([...el.querySelectorAll<HTMLButtonElement>('.toolbar button')].find((b) => b.textContent?.includes('Registro')) as HTMLButtonElement).click();
    await until(() => !!document.querySelector('ed-registry-panel'), 'pannello del registro');
    const panel = document.querySelector('ed-registry-panel') as HTMLElement;
    const app = panel.querySelector('#registry-app') as HTMLInputElement;
    type(app, 'ordini');
    await settle();
    expect(panel.textContent).toContain('screen / nuova-schermata');
    const button = (label: string): HTMLButtonElement => [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(label))!;
    button('Salva versione').click();
    await until(() => !!panel.querySelector('ol li .hash'), 'storico');
    expect(calls.slice(0, 1)).toEqual([{ url: '/registry/apps/ordini/documents/screen/nuova-schermata/versions', method: 'POST' }]);
    expect(panel.querySelector('ol li')?.textContent).toContain('a1b2c3d4e5');
    expect(panel.querySelector('ol li nz-tag')?.textContent?.trim()).toBe('sviluppo');
    // Pubblicare chiede conferma.
    button('Pubblica in sviluppo').click();
    await until(() => !!document.querySelector('.ant-modal-confirm, .ant-modal'), 'conferma');
    ([...document.querySelectorAll<HTMLButtonElement>('.ant-modal button')].find((b) => b.textContent?.includes('Conferma')) as HTMLButtonElement).click();
    await until(() => calls.some((c) => c.method === 'PUT'), 'pubblicazione');
    expect(calls.find((c) => c.method === 'PUT')?.url).toBe('/registry/apps/ordini/documents/screen/nuova-schermata/published?env=sviluppo');
    // Con errori il salvataggio è bloccato.
    store.setValue(['screen'], 'Non Valido');
    await settle();
    expect(button('Salva versione').disabled).toBe(true);
    expect(panel.textContent).toContain('Correggi gli errori');
  });

  it('registro: revisione, confronto con il documento aperto, salvataggio in conflitto ed errori di validazione', async () => {
    const calls: { url: string; method: string; body?: string; ifMatch?: string }[] = [];
    let state = 'bozza';
    let conflict = true;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const headers = (init.headers ?? {}) as Record<string, string>;
      if (url.startsWith('/registry')) calls.push({ url, method, body: init.body as string | undefined, ifMatch: headers['If-Match'] });
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
      const version = () => ({ hash: 'a1b2c3d4e5f6', createdAt: '2026-10-13T08:00:00Z', author: 'mario', state, ...(state === 'respinta' ? { reviewedBy: 'luisa', reviewedAt: '2026-10-13T09:00:00Z', reviewNote: 'Titolo da rivedere' } : {}) });
      if (url.endsWith('/review')) {
        const action = JSON.parse(init.body as string).action;
        state = action === 'richiedi' ? 'in-revisione' : action === 'approva' ? 'approvata' : 'respinta';
        return json(version());
      }
      if (url.includes('/versions/a1b2c3d4e5f6')) return json({ schemaVersion: '1.0', screen: 'nuova-schermata', title: 'Vecchio titolo', components: [] });
      if (url.endsWith('/versions') && method === 'POST') {
        const body = JSON.parse(init.body as string);
        if (body.title === 'Rotto') return json({ title: 'Il documento non rispetta lo schema', errors: [{ path: '/components/0/type', message: 'valore non ammesso' }] }, 400);
        if (headers['If-Match'] && conflict) return json({ title: 'Il documento è stato modificato', latest: 'ffff', latestAuthor: 'luisa' }, 412);
        return json(version(), 201);
      }
      if (url.endsWith('/versions')) return json([version()]);
      if (url.endsWith('/documents')) return json([{ kind: 'screen', id: 'nuova-schermata', publishedEnvironments: {} }]);
      const body = FILES[url];
      return body ? json(body) : { ok: false, status: 404, json: async () => ({}) };
    });
    ([...el.querySelectorAll<HTMLButtonElement>('.toolbar button')].find((b) => b.textContent?.includes('Registro')) as HTMLButtonElement).click();
    await until(() => !!document.querySelector('ed-registry-panel'), 'pannello del registro');
    const panel = document.querySelector('ed-registry-panel') as HTMLElement;
    type(panel.querySelector('#registry-app') as HTMLInputElement, 'ordini');
    await settle();
    const button = (label: string): HTMLButtonElement => [...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(label))!;
    const confirm = async (): Promise<void> => {
      // Le finestre chiuse restano nel DOM: conta l'ultima aperta.
      const last = () => [...document.querySelectorAll<HTMLElement>('.ant-modal')].at(-1);
      await until(() => !!last()?.querySelector('button'), 'conferma');
      ([...last()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Conferma')) as HTMLButtonElement).click();
    };

    // Storico: la versione è una bozza; si chiede la revisione, poi la si respinge con una nota.
    button('Storico').click();
    await until(() => panel.textContent!.includes('bozza'), 'stato bozza');
    button('Chiedi revisione').click();
    await until(() => panel.textContent!.includes('in revisione'), 'in revisione');
    type(panel.querySelector('#registry-note') as HTMLInputElement, 'Titolo da rivedere');
    await settle();
    button('Respingi').click();
    await until(() => panel.textContent!.includes('respinta') && panel.textContent!.includes('Decisa da luisa'), 'respinta con nota');
    expect(JSON.parse(calls.filter((c) => c.url.endsWith('/review')).at(-1)!.body!)).toEqual({ action: 'respingi', note: 'Titolo da rivedere' });

    // Confronto: la versione salvata contro il documento aperto.
    button('Confronta').click();
    await until(() => !!panel.querySelector('.diff li'), 'differenze');
    expect(panel.querySelector('.diff')?.textContent).toContain('/title');
    expect(panel.querySelector('.diff')?.textContent).toContain('"Vecchio titolo"');

    // Aperta quella versione, il salvataggio indica da dove si parte; se un altro ha salvato, si chiede conferma.
    button('Apri').click();
    await confirm();
    await until(() => store.doc() !== null && (store.doc() as { title?: string }).title === 'Vecchio titolo', 'versione aperta');
    store.setValue(['title'], 'Nuovo titolo');
    await settle();
    button('Salva versione').click();
    await until(() => [...document.querySelectorAll('.ant-modal')].some((m) => m.textContent?.includes('luisa ha salvato')), 'avviso di conflitto');
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/versions')).at(-1)?.ifMatch).toBe('"a1b2c3d4e5f6"');
    conflict = false;
    await confirm();
    await until(() => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/versions')).length === 2, 'salvataggio comunque');
    expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/versions')).at(-1)?.ifMatch).toBeUndefined();

    // Gli errori di validazione del registro si mostrano punto per punto.
    store.setValue(['title'], 'Rotto');
    await settle();
    button('Salva versione').click();
    await until(() => !!panel.querySelector('.issues li'), 'errori del registro');
    expect(panel.querySelector('.issues li')?.textContent).toContain('/components/0/type');
  });

  it('registro senza sessione: il pannello propone l’accesso attraverso il BFF e poi si torna all’editor', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('/registry')) return { ok: false, status: 401, json: async () => ({ title: 'Sessione scaduta' }) };
      const body = FILES[url];
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    });
    ([...el.querySelectorAll<HTMLButtonElement>('.toolbar button')].find((b) => b.textContent?.includes('Registro')) as HTMLButtonElement).click();
    await until(() => !!document.querySelector('ed-registry-panel'), 'pannello del registro');
    const panel = document.querySelector('ed-registry-panel') as HTMLElement;
    type(panel.querySelector('#registry-app') as HTMLInputElement, 'ordini');
    await settle();
    ([...panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Storico')) as HTMLButtonElement).click();
    await until(() => !!panel.querySelector('.login'), 'richiesta di accesso');
    ([...panel.querySelectorAll<HTMLButtonElement>('.login button')][0]).click();
    expect(redirects).toEqual(['/bff/login?return=' + encodeURIComponent(location.href)]);
  });

  it('apre un esempio, e da tastiera elimina il nodo selezionato', async () => {
    store.load(layout as never);
    await until(() => outline().length > 5, 'struttura dell’esempio');
    expect(outline()).toContain('Schede');
    expect(outline()).toContain('Scheda');
    expect(store.issues()).toEqual([]);
    store.select(['components', 0]);
    await settle();
    const before = outline().length;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await settle();
    expect(outline().length).toBe(before - 1);
  });
});
