import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import layout from '../../public/examples/vetrina-layout.json';
import { I18n } from 'core';
import { App } from './app';
import { appConfig } from './app.config';
import { getIn } from './model/doc-ops';
import { EditorStore } from './model/editor-store';
import { NavigationStore } from './model/navigation-store';

const FILES: Record<string, unknown> = { 'examples/index.json': ['vetrina-layout'], 'examples/vetrina-layout.json': layout };

describe('editor delle schermate', () => {
  let fixture: ComponentFixture<App>;
  let el: HTMLElement;
  let store: EditorStore;

  beforeEach(async () => {
    localStorage.clear();
    if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => undefined;
    vi.stubGlobal('fetch', async (url: string) => {
      const body = FILES[url];
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    });
    TestBed.configureTestingModule({ providers: appConfig.providers });
    fixture = TestBed.createComponent(App);
    el = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(EditorStore);
    await settle();
  });

  afterEach(() => {
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
  const preview = (): HTMLElement => el.querySelector('ed-preview .frame') as HTMLElement;
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
    await until(() => !!preview().textContent?.includes('Riepilogo'), 'titolo nell’anteprima');
    // Dentro la sezione selezionata finisce il nodo successivo.
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    await until(() => !!preview().querySelector('lc-section lc-alert'), 'messaggio dentro la sezione');
    expect(store.selection()).toEqual(['components', 0, 'components', 0]);
    expect(el.querySelector('.status')?.textContent).toContain('Valida');
  });

  it('un errore si vede nelle proprietà, nell’elenco dei problemi e nella struttura; l’anteprima resta all’ultima versione valida', async () => {
    (el.querySelector('ed-palette button[data-type="text"]') as HTMLButtonElement).click();
    await until(() => !!preview().querySelector('lc-text'), 'testo nell’anteprima');
    type(el.querySelector('#prop-text') as HTMLTextAreaElement, '{{ 1 + }}');
    await settle();
    expect(el.querySelector('.status')?.textContent).toContain('Errori: 1');
    expect(el.querySelector('ed-inspector .prop.invalid .issue')).not.toBeNull();
    expect(el.querySelector('ed-outline .mark.error')).not.toBeNull();
    expect(el.querySelector('ed-preview nz-alert')).not.toBeNull();
    expect(preview().querySelector('lc-text')?.textContent).toContain('Nuovo testo');
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
    expect(getIn(store.doc(), ['components', 0, 'source'])).toBe('ordini');
    tab(0);
    await until(() => !!preview().querySelector('lc-table tbody')?.textContent?.includes('Prima riga'), 'riga di esempio');
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
    expect(getIn(store.doc(), ['screen'])).toBe('da-json');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await settle();
    expect(getIn(store.doc(), ['screen'])).toBe('nuova-schermata');
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
    expect(getIn(store.doc(), ['components', 0, 'columns', 1, 'label'])).toBe('Note');
    // Una colonna nuova in fondo, poi spostata in cima.
    (columns().querySelector(':scope > .list > button') as HTMLButtonElement).click();
    await settle();
    expect(getIn(store.doc(), ['components', 0, 'columns', 2])).toEqual({ field: 'campo3', label: 'Descrizione' });
    const up = columns().querySelectorAll(':scope > .list > .items > .item')[2].querySelector('button[aria-label^="Sposta su"]') as HTMLButtonElement;
    up.click();
    await settle();
    expect(getIn(store.doc(), ['components', 0, 'columns', 1, 'field'])).toBe('campo3');
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
    await until(() => document.querySelectorAll('.ant-dropdown-menu-item').length === 7, 'varianti dei passi');
    ([...document.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item')].find((i) => i.textContent?.includes('refresh')) as HTMLElement).click();
    await settle();
    expect(getIn(store.doc(), ['components', 1, 'onClick', 1])).toEqual({ refresh: '' });
    // Il passo nuovo è aperto: il data source si scrive nel suo campo.
    type(steps.querySelector('#prop-onClick-1-refresh') as HTMLInputElement, 'elenco');
    await settle();
    expect(getIn(store.doc(), ['components', 1, 'onClick', 1])).toEqual({ refresh: 'elenco' });
    expect(store.issues()).toEqual([]);
  });

  it('dall’anteprima alla struttura: Alt+clic o modalità selezione scelgono il componente senza attivarlo', async () => {
    (el.querySelector('ed-palette button[data-type="button"]') as HTMLButtonElement).click();
    store.select([]);
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    await until(() => !!preview().querySelector('lc-node[data-node-id="button-1"] button'), 'pulsante nell’anteprima');
    expect(store.selection()).toEqual(['components', 1]);
    const button = preview().querySelector('lc-node[data-node-id="button-1"] button') as HTMLButtonElement;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
    await settle();
    expect(store.selection()).toEqual(['components', 0]);
    expect(document.querySelector('.ant-message-notice')).toBeNull();
    // Modalità selezione: un clic normale seleziona il messaggio.
    ([...el.querySelectorAll('ed-preview .bar button')].find((b) => b.textContent?.includes('Seleziona')) as HTMLButtonElement).click();
    await settle();
    (preview().querySelector('lc-node[data-node-id="alert-1"] lc-alert') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(store.selection()).toEqual(['components', 1]);
  });

  it('selezionando un nodo in una scheda nascosta l’anteprima apre quella scheda', async () => {
    (el.querySelector('ed-palette button[data-type="tabs"]') as HTMLButtonElement).click();
    store.select(['components', 0, 'tabs', 1]);
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    store.select(['components', 0]);
    await until(() => preview().querySelector('.ant-tabs-tab-active')?.textContent?.trim() === 'Scheda 1', 'prima scheda attiva');
    store.select(['components', 0, 'tabs', 1, 'components', 0]);
    await until(() => preview().querySelector('.ant-tabs-tab-active')?.textContent?.trim() === 'Scheda 2', 'seconda scheda aperta');
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
    expect(getIn(store.doc(), ['components', 0, 'text'])).toBe("{{ t('nuova_schermata.messaggio_per_l_utente', 'Messaggio per l’utente') }}");
    const english = row().querySelector('input[aria-label$=" en"]') as HTMLInputElement;
    expect(english.getAttribute('aria-invalid')).toBe('true');
    english.value = 'Message for the user';
    english.dispatchEvent(new Event('change'));
    await settle();
    expect(row().querySelector('input[aria-label$=" en"]')?.getAttribute('aria-invalid')).toBeNull();
    TestBed.inject(I18n).setLocale('en');
    tab(0);
    await until(() => !!preview().querySelector('lc-alert')?.textContent?.includes('Message for the user'), 'anteprima in inglese');
  });

  it('navigazione: struttura, campi dallo schema, menu vero con un profilo simulato', async () => {
    ([...el.querySelectorAll<HTMLElement>('.mode .ant-segmented-item')].find((i) => i.textContent?.includes('Navigazione')) as HTMLElement).click();
    await until(() => !!el.querySelector('ed-navigation-editor'), 'editor della navigazione');
    const nav = TestBed.inject(NavigationStore);
    const menu = (): string => el.querySelector('ed-navigation-editor lc-sidebar')?.textContent?.replace(/\s+/g, ' ') ?? '';
    await until(() => menu().includes('Nuova voce'), 'menu nell’anteprima');
    // Una voce che richiede un permesso.
    nav.select(['useCases', 0, 'items', 0]);
    await settle();
    expect(el.querySelector('ed-navigation-editor .kind')?.textContent).toBe('Voce');
    type(el.querySelector('ed-navigation-editor #prop-label') as HTMLInputElement, 'Ordini');
    type(el.querySelector('ed-navigation-editor #prop-requires') as HTMLInputElement, 'ordini.ordine.leggi');
    await until(() => menu().includes('Ordini'), 'etichetta nuova nel menu');
    // Profilo senza il permesso: la voce sparisce.
    (el.querySelector('ed-navigation-editor .profile nz-switch') as HTMLElement).click();
    await settle();
    (el.querySelector('ed-navigation-editor .permissions input') as HTMLInputElement).click();
    await until(() => !menu().includes('Ordini'), 'voce nascosta');
    // Il gruppo si aggiunge dalla barra della struttura; Ctrl+Z vale per la navigazione.
    ([...el.querySelectorAll<HTMLButtonElement>('ed-navigation-editor .add button')].find((b) => b.textContent?.includes('Gruppo')) as HTMLButtonElement).click();
    await settle();
    expect(nav.target()).toEqual({ kind: 'group', level: 1 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    await settle();
    expect(getIn(nav.doc(), ['useCases', 0, 'items'])).toHaveLength(1);
    // Problemi della navigazione in basso: la voce iniziale apre una schermata che non è tra quelle note.
    expect(el.querySelector('.bottom')?.textContent).toContain('Schermata «nuova-schermata» non trovata tra quelle note');
  });

  it('tema: i token si modificano dai campi, l’anteprima li applica solo a sé stessa', async () => {
    (el.querySelector('ed-palette button[data-type="alert"]') as HTMLButtonElement).click();
    ([...el.querySelectorAll<HTMLElement>('.mode .ant-segmented-item')].find((i) => i.textContent?.includes('Tema')) as HTMLElement).click();
    await until(() => !!el.querySelector('ed-theme-editor .frame lc-alert'), 'schermata nell’anteprima del tema');
    const frame = el.querySelector('ed-theme-editor .frame') as HTMLElement;
    expect(frame.style.getPropertyValue('--lc-color-primary')).toBe('#1f5fbf');
    const primary = el.querySelector('ed-theme-editor #prop-tokens-colors-primary') as HTMLInputElement;
    expect(primary.previousElementSibling?.getAttribute('type')).toBe('color');
    type(primary, '#aa3300');
    await until(() => frame.style.getPropertyValue('--lc-color-primary') === '#aa3300', 'colore nuovo nell’anteprima');
    expect(document.documentElement.style.getPropertyValue('--lc-color-primary')).not.toBe('#aa3300');
    // Un colore non valido è un errore e l'anteprima resta all'ultimo tema valido.
    type(primary, 'rosso');
    await settle();
    expect(el.querySelector('.status')?.textContent).toContain('Errori: 1');
    expect(frame.style.getPropertyValue('--lc-color-primary')).toBe('#aa3300');
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
    expect(getIn(store.doc(), ['components', 0, 'visibleIf'])).toBe('{{ user.username }}');
    expect(store.issues()).toEqual([]);
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
