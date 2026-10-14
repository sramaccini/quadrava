import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import layout from '../../public/examples/vetrina-layout.json';
import { I18n } from 'core';
import { App } from './app';
import { appConfig } from './app.config';
import { EditorStore } from './model/editor-store';
import { getIn as getAt, type Json } from './model/doc-ops';
import { NavigationStore } from './model/navigation-store';
import { EDITOR_REDIRECT } from './model/registry-client';
import { PreviewComponent } from './preview/preview.component';
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
  /** Un comando della barra dei menu, come lo sceglie l'utente: apre il menu e fa clic sulla voce. */
  async function menuCommand(menu: string, item: string): Promise<void> {
    (el.querySelector(`ed-menu-bar [data-menu="${menu}"]`) as HTMLButtonElement).click();
    await settle();
    (el.querySelector(`ed-menu-bar [data-item="${item}"]`) as HTMLButtonElement).click();
    await settle();
  }

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

  it('barra dei menu: Modifica agisce sulla selezione, File apre un esempio dal sottomenu', async () => {
    const bar = el.querySelector('ed-menu-bar [role="menubar"]') as HTMLElement;
    expect([...bar.querySelectorAll(':scope > li > [role="menuitem"]')].map((b) => b.textContent?.trim())).toEqual(['File', 'Modifica', 'Visualizza', 'Aiuto']);
    const item = (id: string) => el.querySelector(`ed-menu-bar [data-item="${id}"]`) as HTMLButtonElement | null;

    // Senza selezione i comandi della selezione sono spenti e non fanno nulla.
    (el.querySelector('ed-menu-bar [data-menu="edit"]') as HTMLButtonElement).click();
    await settle();
    expect(item('duplicate')?.getAttribute('aria-disabled')).toBe('true');
    expect(item('undo')?.getAttribute('aria-disabled')).toBe('true');
    expect(item('delete')?.querySelector('.shortcut')?.textContent).toBe('Canc');
    item('duplicate')!.click();
    await settle();
    expect(item('duplicate')).not.toBeNull();
    // Un clic fuori chiude il menu.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await settle();
    expect(item('duplicate')).toBeNull();

    (el.querySelector('ed-palette button[data-type="section"]') as HTMLButtonElement).click();
    await settle();
    await menuCommand('edit', 'duplicate');
    expect(outline()).toEqual(['Sezione', 'Sezione']);
    await menuCommand('edit', 'undo');
    expect(outline()).toEqual(['Sezione']);
    store.select(['components', 0]);
    await settle();
    await menuCommand('edit', 'delete');
    expect(store.doc()).toMatchObject({ components: [] });

    // File → Apri esempio → vetrina-layout, dopo la conferma.
    (el.querySelector('ed-menu-bar [data-menu="file"]') as HTMLButtonElement).click();
    await settle();
    expect([...el.querySelectorAll('ed-menu-bar [data-level="0"] .label')].map((l) => l.textContent)).toEqual([
      'Nuova',
      'Apri esempio',
      'Importa…',
      'Esporta',
      'Registro…',
    ]);
    item('open-example')!.click();
    await until(() => !!item('example:vetrina-layout'), 'esempi nel sottomenu');
    item('example:vetrina-layout')!.click();
    await until(() => !![...document.querySelectorAll('.ant-modal')].at(-1)?.querySelector('.ant-btn-primary'), 'conferma');
    ([...document.querySelectorAll('.ant-modal')].at(-1)!.querySelector('.ant-btn-primary') as HTMLButtonElement).click();
    await until(() => (store.doc() as { screen?: string }).screen === 'vetrina-layout', 'esempio aperto');
    expect(item('open-example')).toBeNull();
  });

  it('riquadri nascosti uno per uno come negli IDE: linguetta del riquadro, gli altri restano nella colonna', async () => {
    const left = el.querySelector('ed-dock-side.left') as HTMLElement;
    const right = el.querySelector('ed-dock-side.right') as HTMLElement;
    const editor = el.querySelector('.editor') as HTMLElement;
    const pin = (panel: string) => el.querySelector(`[data-dock-pin="${panel}"]`) as HTMLButtonElement;
    const panel = (id: string) => el.querySelector(`[data-dock-panel="${id}"]`) as HTMLElement;
    const tabs = (side: HTMLElement) => [...side.querySelectorAll('.strip .tab')].map((t) => t.textContent?.trim());
    expect([pin('palette'), pin('outline'), pin('inspector')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true']);
    expect(left.querySelector('.strip')).toBeNull();
    expect(editor.style.getPropertyValue('--ed-left')).toBe('280px');

    // Solo la struttura si nasconde: linguetta «Struttura», i componenti restano nella colonna (più larga della striscia).
    pin('outline').click();
    await settle();
    expect(tabs(left)).toEqual(['Struttura']);
    expect(panel('palette').classList.contains('ed-docked')).toBe(true);
    expect(panel('outline').classList.contains('ed-floating')).toBe(true);
    expect(editor.style.getPropertyValue('--ed-left')).toBe('310px');
    // Appena sganciata resta aperta finché il mouse non esce.
    expect(panel('outline').classList.contains('ed-open')).toBe(true);
    left.dispatchEvent(new Event('pointerleave'));
    await until(() => !panel('outline').classList.contains('ed-open'), 'chiusura all’uscita del mouse');
    expect(JSON.parse(localStorage.getItem('lc.editor.dock')!)).toEqual({ pins: { palette: true, outline: false, inspector: true } });

    // Anche i componenti: resta la sola striscia, con le due linguette nell'ordine dei riquadri.
    pin('palette').click();
    await settle();
    left.dispatchEvent(new Event('pointerleave'));
    await until(() => !panel('palette').classList.contains('ed-open'), 'chiusura');
    expect(tabs(left)).toEqual(['Componenti', 'Struttura']);
    expect(editor.style.getPropertyValue('--ed-left')).toBe('30px');
    expect(left.querySelector('.splitter')).toBeNull();

    // Il passaggio su una linguetta apre solo il suo riquadro (dopo una breve attesa; un passaggio veloce no).
    const tab = (id: string) => left.querySelector(`.tab[data-dock-tab="${id}"]`) as HTMLButtonElement;
    tab('outline').dispatchEvent(new Event('pointerenter'));
    tab('outline').dispatchEvent(new Event('pointerleave'));
    await new Promise((r) => setTimeout(r, 250));
    await settle();
    expect(panel('outline').classList.contains('ed-open')).toBe(false);
    left.dispatchEvent(new Event('pointerenter'));
    tab('outline').dispatchEvent(new Event('pointerenter'));
    await until(() => panel('outline').classList.contains('ed-open'), 'apertura al passaggio');
    expect(panel('palette').classList.contains('ed-open')).toBe(false);
    expect(tab('outline').getAttribute('aria-expanded')).toBe('true');
    // Passando all'altra linguetta si apre l'altro riquadro.
    tab('palette').dispatchEvent(new Event('pointerenter'));
    await until(() => panel('palette').classList.contains('ed-open') && !panel('outline').classList.contains('ed-open'), 'cambio di riquadro');

    // Trascinare un componente della tavolozza verso l'anteprima chiude il riquadro.
    el.querySelector('ed-palette button[data-type="section"]')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
    await until(() => !panel('palette').classList.contains('ed-open'), 'chiusura durante il trascinamento');

    // A destra: con il fuoco in un campo resta aperto anche con il mouse fuori; Esc lo chiude e torna alla linguetta.
    pin('inspector').click();
    await settle();
    const field = panel('inspector').querySelector('input, textarea') as HTMLInputElement;
    field.focus();
    right.dispatchEvent(new Event('pointerleave'));
    await new Promise((r) => setTimeout(r, 500));
    await settle();
    expect(panel('inspector').classList.contains('ed-open')).toBe(true);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(panel('inspector').classList.contains('ed-open')).toBe(false);
    expect(document.activeElement?.getAttribute('data-dock-tab')).toBe('inspector');
    // Un clic sulla linguetta apre subito.
    (document.activeElement as HTMLButtonElement).click();
    await settle();
    expect(panel('inspector').classList.contains('ed-open')).toBe(true);

    // Rifissati, tornano nelle colonne; la scelta resta per la visita successiva.
    pin('inspector').click();
    pin('palette').click();
    pin('outline').click();
    await settle();
    expect(left.querySelector('.strip')).toBeNull();
    expect(right.querySelector('.strip')).toBeNull();
    expect(JSON.parse(localStorage.getItem('lc.editor.dock')!)).toEqual({ pins: { palette: true, outline: true, inspector: true } });
  });

  it('riquadri nascosti anche in navigazione e tema; la scelta vale per il riquadro in tutte le modalità', async () => {
    const mode = async (label: string) => {
      ([...el.querySelectorAll<HTMLElement>('.mode .ant-segmented-item')].find((i) => i.textContent?.includes(label)) as HTMLElement).click();
      await settle();
    };
    await mode('Navigazione');
    const nav = el.querySelector('ed-navigation-editor') as HTMLElement;
    expect([...nav.querySelectorAll('[data-dock-pin]')].map((p) => p.getAttribute('data-dock-pin'))).toEqual(['outline', 'inspector']);
    (nav.querySelector('[data-dock-pin="outline"]') as HTMLButtonElement).click();
    await settle();
    const left = nav.querySelector('ed-dock-side.left') as HTMLElement;
    const outline = nav.querySelector('[data-dock-panel="outline"]') as HTMLElement;
    expect(nav.style.getPropertyValue('--ed-left')).toBe('30px');
    expect([...left.querySelectorAll('.strip .tab')].map((t) => t.textContent?.trim())).toEqual(['Struttura']);
    left.dispatchEvent(new Event('pointerleave'));
    await until(() => !outline.classList.contains('ed-open'), 'chiusura in navigazione');
    left.dispatchEvent(new Event('pointerenter'));
    left.querySelector('.tab')!.dispatchEvent(new Event('pointerenter'));
    await until(() => outline.classList.contains('ed-open'), 'apertura in navigazione');

    // Tema: le proprietà; nascoste qui, lo sono anche nella schermata. La struttura nascosta in navigazione lo è anche lì.
    await mode('Tema');
    const theme = el.querySelector('ed-theme-editor') as HTMLElement;
    (theme.querySelector('[data-dock-pin="inspector"]') as HTMLButtonElement).click();
    await settle();
    expect(theme.style.getPropertyValue('--ed-right')).toBe('30px');
    expect([...theme.querySelectorAll('ed-dock-side.right .strip .tab')].map((t) => t.textContent?.trim())).toEqual(['Proprietà']);
    await mode('Schermata');
    expect([...el.querySelectorAll('ed-dock-side.left .strip .tab')].map((t) => t.textContent?.trim())).toEqual(['Struttura']);
    expect([...el.querySelectorAll('ed-dock-side.right .strip .tab')].map((t) => t.textContent?.trim())).toEqual(['Proprietà']);
    expect((el.querySelector('.editor') as HTMLElement).style.getPropertyValue('--ed-right')).toBe('30px');
  });

  it('tavolozza: la ricerca filtra mentre si scrive, Invio aggiunge il primo trovato, Esc svuota', async () => {
    const search = el.querySelector('[data-palette-search]') as HTMLInputElement;
    type(search, 'griglia');
    await settle();
    expect([...el.querySelectorAll('ed-palette button[data-type]')].map((b) => b.getAttribute('data-type'))).toEqual(['grid']);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(outline()).toEqual(['Griglia']);
    type(search, 'zzz');
    await settle();
    expect(el.querySelector('ed-palette .none')?.textContent).toContain('Nessun componente');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(el.querySelectorAll('ed-palette button[data-type]').length).toBeGreaterThan(30);
  });

  it('struttura: rami da chiudere e aprire, ricerca, menu contestuale con «Avvolgi in» anche da tastiera', async () => {
    const add = async (type: string) => {
      (el.querySelector(`ed-palette button[data-type="${type}"]`) as HTMLButtonElement).click();
      await settle();
    };
    await add('section');
    await add('box');
    await add('text');
    store.select([]);
    await settle();
    await add('alert');
    expect(outline()).toEqual(['Sezione', 'Box (riga o colonna)', 'Testo', 'Messaggio']);
    // Chiudere e aprire un ramo; comprimi ed espandi tutto.
    const twisty = () => el.querySelector('ed-outline .twisty') as HTMLButtonElement;
    expect(twisty().getAttribute('aria-expanded')).toBe('true');
    twisty().click();
    await settle();
    expect(outline()).toEqual(['Sezione', 'Messaggio']);
    (el.querySelector('[data-outline="expand"]') as HTMLButtonElement).click();
    await settle();
    (el.querySelector('[data-outline="collapse"]') as HTMLButtonElement).click();
    await settle();
    expect(outline()).toEqual(['Sezione', 'Messaggio']);
    // Selezionare un nodo dentro un ramo chiuso lo riapre.
    store.select(['components', 0, 'components', 0, 'components', 0]);
    await settle();
    expect(outline()).toEqual(['Sezione', 'Box (riga o colonna)', 'Testo', 'Messaggio']);
    // Ricerca: i nodi trovati con i rami che li contengono.
    const search = el.querySelector('ed-outline .search') as HTMLInputElement;
    type(search, 'testo');
    await settle();
    expect(outline()).toEqual(['Sezione', 'Box (riga o colonna)', 'Testo']);
    expect(el.querySelector('ed-outline .line.match .label')?.textContent).toBe('Testo');
    type(search, 'niente');
    await settle();
    expect(el.querySelector('ed-outline .empty')?.textContent).toContain('Nessun nodo');
    type(search, '');
    await settle();
    // Menu contestuale da tastiera (Maiusc+F10) sul testo: «Avvolgi in una griglia».
    const row = el.querySelector('ed-outline .row[data-path="components/0/components/0/components/0"]') as HTMLButtonElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await settle();
    const menu = el.querySelector('ed-context-menu [role="menu"]') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(document.activeElement?.getAttribute('data-item')).toBe('cut');
    expect(menu.querySelector('[data-item="paste"]')?.getAttribute('aria-disabled')).toBe('true');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(document.activeElement?.getAttribute('data-item')).toBe('select-parent');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(document.activeElement?.getAttribute('data-item')).toBe('wrap-grid');
    (document.activeElement as HTMLButtonElement).click();
    await settle();
    expect(el.querySelector('ed-context-menu')).toBeNull();
    expect(outline()).toEqual(['Sezione', 'Box (riga o colonna)', 'Griglia', 'Testo', 'Messaggio']);
    expect(store.selection()).toEqual(['components', 0, 'components', 0, 'components', 0]);
    // Tasto destro sul messaggio: Esc chiude senza fare nulla; «Seleziona il contenitore» risale.
    const line = el.querySelector('ed-outline .row[data-path="components/1"]')!.parentElement as HTMLElement;
    line.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    await settle();
    expect(store.selection()).toEqual(['components', 1]);
    el.querySelector('ed-context-menu [role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(el.querySelector('ed-context-menu')).toBeNull();
    store.select(['components', 0, 'components', 0]);
    await settle();
    el.querySelector('ed-outline .row[data-path="components/0/components/0"]')!.parentElement!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle();
    (el.querySelector('ed-context-menu [data-item="select-parent"]') as HTMLButtonElement).click();
    await settle();
    expect(store.selection()).toEqual(['components', 0]);
    expect(store.issues()).toEqual([]);
  });

  it('struttura: più nodi con Ctrl+clic e Maiusc+clic, avvolti insieme dal menu contestuale; Canc li elimina', async () => {
    for (const type of ['text', 'alert', 'button', 'text']) {
      store.select([]);
      (el.querySelector(`ed-palette button[data-type="${type}"]`) as HTMLButtonElement).click();
      await settle();
    }
    const row = (i: number) => el.querySelector(`ed-outline .row[data-path="components/${i}"]`) as HTMLButtonElement;
    row(0).click();
    row(2).dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await settle();
    expect([...el.querySelectorAll('ed-outline .line.selected .row')].map((r) => r.getAttribute('data-path'))).toEqual(['components/0', 'components/2']);
    expect(el.querySelector('ed-outline .tools')).toBeNull();
    expect(el.querySelector('ed-inspector .multi')?.textContent).toContain('2 nodi selezionati');
    expect(row(0).textContent).toContain('selezionato insieme ad altri');
    // Maiusc+clic: intervallo dal primo scelto.
    row(1).click();
    row(3).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    await settle();
    expect(store.multi()).toEqual([['components', 1], ['components', 2], ['components', 3]]);
    // Maiusc+freccia su dalla riga 3 stringe l'intervallo a 1–2.
    row(3).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    await settle();
    expect(store.multi()).toEqual([['components', 1], ['components', 2]]);
    // Menu contestuale su un nodo della selezione: vale per tutti.
    row(2).parentElement!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settle();
    expect([...el.querySelectorAll('ed-context-menu .item .label')].map((l) => l.textContent)).toEqual([
      'Avvolgi 2 nodi in una sezione',
      'Avvolgi 2 nodi in un box',
      'Avvolgi 2 nodi in una griglia',
      'Elimina 2 nodi',
    ]);
    (el.querySelector('ed-context-menu [data-item="wrap-box"]') as HTMLButtonElement).click();
    await settle();
    expect(outline()).toEqual(['Testo', 'Box (riga o colonna)', 'Messaggio', 'Pulsante', 'Testo']);
    // Canc su una selezione di più nodi li elimina tutti.
    store.select(['components', 0]);
    store.toggleSelect(['components', 2]);
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await settle();
    expect(outline()).toEqual(['Box (riga o colonna)', 'Messaggio', 'Pulsante']);
    expect(store.issues()).toEqual([]);
  });

  it('traduzioni: la lingua predefinita si cambia dal pannello e arriva all’anteprima', async () => {
    tab(3);
    await settle();
    (el.querySelector('ed-texts [data-language="en"] .make-default') as HTMLButtonElement).click();
    await settle();
    expect(store.defaultLanguage()).toBe('en');
    expect([...el.querySelectorAll('ed-texts .language .name')].map((n) => n.textContent)).toEqual(['Inglese', 'Italiano']);
    expect(el.querySelector('ed-texts [data-language="en"] .default')?.textContent).toBe('predefinita');
    expect(el.querySelector('ed-texts [data-language="en"] .remove')).toBeNull();
    expect(el.querySelector('ed-texts [data-language="it"] .remove')).not.toBeNull();
    tab(0);
    await settle();
    await untilState('ed-preview', (st) => st.defaultLocale === 'en', 'lingua predefinita nell’anteprima');
  });

  it('data source importati da OpenAPI (springdoc): lettura dall’indirizzo, scelta delle operazioni, dati di esempio', async () => {
    const doc = {
      openapi: '3.0.1',
      info: { title: 'Gestionale', version: '1' },
      servers: [{ url: 'http://localhost:8080' }],
      paths: {
        '/api/clienti': {
          get: { tags: ['clienti'], operationId: 'listClienti', responses: { '200': { description: 'OK', content: { '*/*': { schema: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string', example: 'Rossi' } } } } } } } } },
          post: { tags: ['clienti'], operationId: 'createCliente', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'OK' } } },
        },
      },
    };
    const requested: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      requested.push(url);
      if (url === '/v3/api-docs') return { ok: true, status: 200, text: async () => JSON.stringify(doc) };
      return { ok: false, status: 404, text: async () => '' };
    });
    tab(2);
    await settle();
    (el.querySelector('[data-openapi-open]') as HTMLButtonElement).click();
    await until(() => !!document.querySelector('[data-openapi-url]'), 'finestra di importazione');
    const url = document.querySelector('[data-openapi-url]') as HTMLInputElement;
    expect(url.value).toBe('/v3/api-docs');
    // Indirizzo sbagliato: il messaggio dice lo stato.
    type(url, '/swagger-ui.html');
    url.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => !!document.querySelector('ed-openapi-import .error'), 'errore');
    expect(document.querySelector('ed-openapi-import .error')?.textContent).toContain('404');
    type(url, 'javascript:alert(1)');
    url.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(document.querySelector('ed-openapi-import .error')?.textContent).toContain('Indirizzo non valido');
    expect(requested).toEqual(['/swagger-ui.html']);
    type(url, '/v3/api-docs');
    url.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => document.querySelectorAll('ed-openapi-import .op').length === 2, 'operazioni');
    expect(document.querySelector('ed-openapi-import .api')?.textContent).toContain('Gestionale');
    const importButton = () => document.querySelector('[data-openapi-import]') as HTMLButtonElement;
    expect(importButton().disabled).toBe(true);
    ([...document.querySelectorAll<HTMLButtonElement>('ed-openapi-import .bulk button')][0]).click();
    await settle();
    expect(importButton().textContent).toContain('Importa 2 data source');
    importButton().click();
    await until(() => getAt(store.doc(), ['dataSources', 'listClienti']) !== undefined, 'importazione');
    expect(getAt(store.doc(), ['dataSources', 'listClienti'])).toEqual({ type: 'rest', method: 'GET', url: '/api/clienti' });
    expect(getAt(store.doc(), ['dataSources', 'createCliente'])).toEqual({ type: 'rest', method: 'POST', url: '/api/clienti', body: '{{ form }}' });
    expect(store.samples()['listClienti']).toEqual([{ nome: 'Rossi' }, { nome: 'Rossi' }]);
    expect(localStorage.getItem('lc.editor.openapi.url')).toBe('/v3/api-docs');
    // Un solo passo da annullare.
    store.undo();
    expect(getAt(store.doc(), ['dataSources', 'listClienti'])).toBeUndefined();
  });

  it('proprietà: percorso dell’elemento con i contenitori cliccabili e filtro per nome', async () => {
    (el.querySelector('ed-palette button[data-type="section"]') as HTMLButtonElement).click();
    await settle();
    (el.querySelector('ed-palette button[data-type="table"]') as HTMLButtonElement).click();
    await settle();
    const crumbs = () => [...el.querySelectorAll('ed-inspector .crumbs li')].map((li) => li.textContent?.trim());
    expect(crumbs()).toEqual(['Schermata', 'Sezione', 'Tabella']);
    expect(el.querySelector('ed-inspector .crumbs [aria-current="location"]')?.textContent).toBe('Tabella');
    const filter = el.querySelector('[data-prop-filter]') as HTMLInputElement;
    type(filter, 'sour');
    await settle();
    expect([...el.querySelectorAll('ed-inspector ed-fields > .prop')].map((p) => p.getAttribute('data-prop'))).toEqual(['source']);
    type(filter, 'xyz');
    await settle();
    expect(el.querySelector('ed-inspector .empty')?.textContent).toContain('Nessuna proprietà');
    // Un clic sul contenitore nel percorso lo seleziona; il filtro riparte vuoto.
    ([...el.querySelectorAll<HTMLButtonElement>('ed-inspector .crumbs button')].find((b) => b.textContent === 'Sezione') as HTMLButtonElement).click();
    await settle();
    expect(store.selection()).toEqual(['components', 0]);
    expect((el.querySelector('[data-prop-filter]') as HTMLInputElement).value).toBe('');
    expect(crumbs()).toEqual(['Schermata', 'Sezione']);
  });

  it('menu Visualizza (lati, problemi, vista) e Aiuto (scorciatoie, anche con F1; informazioni)', async () => {
    (el.querySelector('ed-menu-bar [data-menu="view"]') as HTMLButtonElement).click();
    await settle();
    const item = (id: string) => el.querySelector(`ed-menu-bar [data-item="${id}"]`) as HTMLButtonElement;
    expect([...el.querySelectorAll('ed-menu-bar [data-item^="pin-"] .label')].map((l) => l.textContent)).toEqual(['«Componenti» fissato', '«Struttura» fissato', '«Proprietà» fissato']);
    expect([item('pin-palette').getAttribute('role'), item('pin-palette').getAttribute('aria-checked')]).toEqual(['menuitemcheckbox', 'true']);
    expect([item('view-preview').getAttribute('role'), item('view-preview').getAttribute('aria-checked')]).toEqual(['menuitemradio', 'true']);
    item('pin-inspector').click();
    await settle();
    expect((el.querySelector('.editor') as HTMLElement).style.getPropertyValue('--ed-right')).toBe('30px');
    await menuCommand('view', 'issues');
    expect(el.querySelector('ed-issues')).toBeNull();
    await menuCommand('view', 'view-json');
    expect(store.view()).toBe('json');
    (el.querySelector('ed-menu-bar [data-menu="view"]') as HTMLButtonElement).click();
    await settle();
    expect([item('pin-inspector').getAttribute('aria-checked'), item('issues').getAttribute('aria-checked'), item('view-json').getAttribute('aria-checked')]).toEqual(['false', 'false', 'true']);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await settle();
    // F1 apre le scorciatoie.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    await until(() => !!document.querySelector('.shortcuts dt'), 'scorciatoie');
    expect([...document.querySelectorAll('.shortcuts h3')].map((h) => h.textContent)).toEqual(['Generali', 'Struttura (fuori dai campi di testo)', 'Barra dei menu', 'Pannelli e anteprima']);
    expect([...document.querySelectorAll('.shortcuts kbd')].map((k) => k.textContent)).toContain('Maiusc+F10');
    await menuCommand('help', 'about');
    await until(() => !!document.querySelector('.about lc-kinetix-wordmark'), 'informazioni');
  });

  it('lati ridimensionabili: il bordo si sposta da tastiera e si ricorda; Invio torna alla larghezza prevista', async () => {
    const splitter = el.querySelector('ed-dock-side.left .splitter') as HTMLElement;
    expect([splitter.getAttribute('role'), splitter.getAttribute('aria-valuenow')]).toEqual(['separator', '280']);
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(splitter.getAttribute('aria-valuenow')).toBe('312');
    expect((el.querySelector('.editor') as HTMLElement).style.getPropertyValue('--ed-left')).toBe('312px');
    expect(JSON.parse(localStorage.getItem('lc.editor.dock')!).leftWidth).toBe(312);
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await settle();
    expect(splitter.getAttribute('aria-valuenow')).toBe('640');
    // A destra le frecce sono invertite: verso l'area centrale (sinistra) il lato cresce.
    const right = el.querySelector('ed-dock-side.right .splitter') as HTMLElement;
    right.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(right.getAttribute('aria-valuenow')).toBe('336');
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(splitter.getAttribute('aria-valuenow')).toBe('280');
  });

  it('traduzioni: si aggiunge una lingua (con il codice controllato), ha la sua colonna e l’anteprima la può usare', async () => {
    (el.querySelector('ed-palette button[data-type="text"]') as HTMLButtonElement).click();
    await settle();
    store.makeTranslatable(['components', 0, 'text']);
    tab(3);
    await settle();
    const code = el.querySelector('[data-add-language]') as HTMLInputElement;
    code.value = 'Klingon';
    code.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(el.querySelector('ed-texts .error')?.textContent).toContain('Lingua non riconosciuta');
    // I suggerimenti hanno il nome nella lingua dell'editor; basta scrivere il nome.
    const suggestions = [...el.querySelectorAll<HTMLOptionElement>('#ed-language-suggestions option')].map((o) => o.value);
    expect(suggestions).toContain('Francese (fr)');
    expect(suggestions).not.toContain('Italiano (it)');
    code.value = 'francese';
    code.dispatchEvent(new Event('input'));
    code.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect([...el.querySelectorAll('ed-texts th.locale')].map((th) => th.textContent?.trim().split(' ')[0])).toEqual(['IT', 'EN', 'FR']);
    expect([...el.querySelectorAll('ed-texts .language .name')].map((n) => n.textContent)).toEqual(['Italiano', 'Inglese', 'Francese']);
    const fr = el.querySelector('ed-texts input[aria-label$=" fr"]') as HTMLInputElement;
    expect(fr.getAttribute('aria-invalid')).toBe('true');
    fr.value = 'Nouveau texte';
    fr.dispatchEvent(new Event('change'));
    await settle();
    expect(store.translations()['fr']).toEqual({ 'nuova_schermata.nuovo_testo': 'Nouveau texte' });
    // L'anteprima in francese.
    tab(0);
    await settle();
    expect(el.querySelector('ed-preview nz-select.language')?.getAttribute('aria-label')).toBe('Lingua dell’anteprima');
    await untilState('ed-preview', (st) => st.locale === 'it' && !!st.translations['fr'], 'traduzioni francesi nell’anteprima');
    // Scelta la lingua aggiunta, l'anteprima la usa; tolta, torna a quella dell'editor.
    const preview = fixture.debugElement.query(By.directive(PreviewComponent)).componentInstance as unknown as { chooseLocale(l: string): void };
    preview.chooseLocale('fr');
    await untilState('ed-preview', (st) => st.locale === 'fr', 'anteprima in francese');
    store.removeLanguage('fr');
    await untilState('ed-preview', (st) => st.locale === 'it', 'di nuovo in italiano');
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

  it('dall’anteprima: spostare un componente e cambiarne la larghezza in una griglia', async () => {
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    store.select([]);
    (el.querySelector('ed-palette button[data-type="grid"]') as HTMLButtonElement).click();
    await untilState('ed-preview', (st) => !!st.screen, 'anteprima');
    // Il pulsante entra nella griglia, poi occupa due colonne.
    await fromFrame('ed-preview', { type: 'lc-preview:move', id: 'button-1', targetId: 'grid-1', zone: 'inside' });
    expect(getAt(store.doc(), ['components', 0, 'type'])).toBe('grid');
    expect(getAt(store.doc(), ['components', 0, 'components', 0, 'id'])).toBe('button-1');
    await fromFrame('ed-preview', { type: 'lc-preview:resize', id: 'button-1', property: 'span', value: 2 });
    expect(getAt(store.doc(), ['components', 0, 'components', 0, 'span'])).toBe(2);
    // Un contenitore non entra in sé stesso; valori fuori misura non passano.
    await fromFrame('ed-preview', { type: 'lc-preview:move', id: 'grid-1', targetId: 'button-1', zone: 'after' });
    expect(getAt(store.doc(), ['components', 0, 'type'])).toBe('grid');
    await fromFrame('ed-preview', { type: 'lc-preview:resize', id: 'button-1', property: 'span', value: 40 });
    expect(getAt(store.doc(), ['components', 0, 'components', 0, 'span'])).toBe(2);
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
    // Parametri, Registro, Seleziona e Ricarica: solo icona, il nome per i lettori di schermo, allineati a destra.
    const selectButton = el.querySelector('ed-preview .bar button[data-command="select"]') as HTMLButtonElement;
    expect([selectButton.getAttribute('aria-label'), selectButton.textContent?.trim()]).toEqual(['Seleziona', '']);
    expect(el.querySelector('ed-preview .bar button[data-command="reload"]')?.getAttribute('aria-label')).toBe('Ricarica');
    expect([...el.querySelectorAll('ed-preview .bar .actions button')].map((b) => [b.getAttribute('data-command'), b.querySelector('.anticon') !== null])).toEqual([
      ['params', true],
      ['log', true],
      ['select', true],
      ['reload', true],
    ]);
    expect(el.querySelector('ed-preview .bar button[data-command="params"]')?.getAttribute('aria-label')).toBe('Parametri');
    selectButton.click();
    await untilState('ed-preview', (st) => st.selectMode, 'modalità selezione');
    await fromFrame('ed-preview', { type: 'lc-preview:event', event: { kind: 'request', text: 'GET /api/elenco' } });
    const logButton = el.querySelector('ed-preview .bar button[data-command="log"]') as HTMLButtonElement;
    expect(logButton.getAttribute('aria-label')).toBe('Registro (1)');
    expect(logButton.querySelector('.count')?.textContent).toBe('1');
    // Larghezze: solo icone, con il nome (e i pixel) per i lettori di schermo.
    const widths = [...el.querySelectorAll<HTMLButtonElement>('ed-preview .widths button')];
    expect(widths.map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed'), b.textContent?.trim()])).toEqual([
      ['Desktop', 'true', ''],
      ['Tablet (768 px)', 'false', ''],
      ['Telefono (375 px)', 'false', ''],
    ]);
    widths[1].click();
    await settle();
    expect(widths[1].getAttribute('aria-pressed')).toBe('true');
    expect((el.querySelector('ed-preview iframe') as HTMLIFrameElement).style.width).toBe('768px');
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
    await menuCommand('file', 'registry');
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
    await menuCommand('file', 'registry');
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
    await menuCommand('file', 'registry');
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
