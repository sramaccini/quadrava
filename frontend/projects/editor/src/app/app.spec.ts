import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import layout from '../../public/examples/vetrina-layout.json';
import { App } from './app';
import { appConfig } from './app.config';
import { getIn } from './model/doc-ops';
import { EditorStore } from './model/editor-store';

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
