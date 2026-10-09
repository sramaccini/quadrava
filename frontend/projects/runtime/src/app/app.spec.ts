import { Location } from '@angular/common';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import detail from '../../public/examples/ordine-dettaglio.json';
import list from '../../public/examples/ordini-elenco.json';
import navigationDoc from '../../public/examples/navigation.json';
import invoices from '../../public/examples/fatture-elenco.json';
import newInvoice from '../../public/examples/fattura-nuova.json';
import newPackage from '../../public/examples/pacchetto-nuovo.json';
import packages from '../../public/examples/pacchetti-elenco.json';
import expenses from '../../public/examples/spese-elenco.json';
import chiaro from '../../public/examples/themes/chiaro.json';
import scuro from '../../public/examples/themes/scuro.json';
import { NavigationService } from './navigation.service';
import { openSelect, stubViewportHeight } from './select-testing';
import { App } from './app';
import { appConfig } from './app.config';

/** Prova end-to-end della demo: menu, router, schermate JSON reali, porte finte, catalogo standard e temi. */
describe('App (demo)', () => {
  const files: Record<string, unknown> = {
    'examples/navigation.json': navigationDoc,
    'examples/ordini-elenco.json': list,
    'examples/ordine-dettaglio.json': detail,
    'examples/fatture-elenco.json': invoices,
    'examples/fattura-nuova.json': newInvoice,
    'examples/pacchetto-nuovo.json': newPackage,
    'examples/pacchetti-elenco.json': packages,
    'examples/spese-elenco.json': expenses,
    'examples/themes/chiaro.json': chiaro,
    'examples/themes/scuro.json': scuro,
  };

  let restoreViewport: () => void;
  beforeAll(() => (restoreViewport = stubViewportHeight()));
  afterAll(() => restoreViewport());

  beforeEach(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const body = files[url];
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    });
    TestBed.configureTestingModule({ providers: appConfig.providers });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
    document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
    document.getElementById('lc-nz-dark-theme')?.remove();
  });

  async function until(fixture: ComponentFixture<App>, condition: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout: ${label}\nURL: ${TestBed.inject(Location).path()}\n${(fixture.nativeElement as HTMLElement).innerHTML.slice(0, 1800)}`);
  }

  async function start(user = 'operatore'): Promise<{ fixture: ComponentFixture<App>; el: HTMLElement; url: () => string }> {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    const url = (): string => TestBed.inject(Location).path();
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    if (user !== 'operatore') {
      await until(fixture, () => !!headerSelect(el, 0), 'barra superiore');
      await choose(fixture, headerSelect(el, 0), user);
    }
    return { fixture, el, url };
  }

  const buttonsOf = (el: HTMLElement): string[] => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
  const headerSelect = (el: HTMLElement, index: number): HTMLElement => el.querySelectorAll('nz-header nz-select')[index] as HTMLElement;
  const useCaseSelect = (el: HTMLElement): HTMLElement | null => el.querySelector('lc-sidebar nz-select');
  /** Casi d'uso offerti all'utente (letti dallo stato del menu, non dal menu a tendina). */
  const useCases = (): string[] => TestBed.inject(NavigationService).runtime()?.useCases().map((u) => u.label) ?? [];
  const sideLabels = (el: HTMLElement): string[] =>
    [...el.querySelectorAll('lc-sidebar a.leaf .label, lc-sidebar .ant-menu-submenu-title')].map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim());
  /** Sceglie una voce di un menu a tendina di NG-ZORRO dal suo testo. */
  const choose = async (fixture: ComponentFixture<App>, select: HTMLElement, label: string): Promise<void> => {
    const options = await openSelect(select, async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    });
    (options.find((o) => (o.textContent ?? '').trim() === label) as HTMLElement).click();
  };
  const toast = (): Element | null => document.body.querySelector('.ant-message-notice');
  const clickLabel = (el: HTMLElement, selector: string, text: string): void => {
    ([...el.querySelectorAll(selector)].find((n) => n.textContent?.trim().startsWith(text)) as HTMLElement).click();
  };
  const heading = (el: HTMLElement): string | undefined => el.querySelector('h1')?.textContent?.trim();
  const rows = (el: HTMLElement): number => el.querySelectorAll('main tbody tr:not(.ant-table-placeholder)').length;

  it('all’avvio apre il caso d’uso predefinito e applica il tema', async () => {
    const { fixture, el, url } = await start();
    await until(fixture, () => rows(el) > 0, 'elenco fatture');
    expect(url()).toBe('/consultazione-fatture/fatture-elenco');
    expect(heading(el)).toBe('Fatture');
    expect(document.documentElement.style.getPropertyValue('--lc-color-primary')).toBe('#1f5fbf');
    expect(el.querySelector('lc-sidebar a[aria-current="page"]')?.textContent).toContain('Elenco fatture');
  });

  it('l’intestazione di pagina mostra le briciole di pane dal menu e il logo sta sopra il menu', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'elenco fatture');
    const crumbs = [...el.querySelectorAll('main nz-breadcrumb-item')].map((n) => (n.textContent ?? '').replace('/', '').trim());
    expect(crumbs).toEqual(['Consultazione Fatture', 'Elenco fatture']);
    expect(el.querySelector('lc-sidebar .logo img')?.getAttribute('src')).toBe('logo.svg');
  });

  it('il menu utente mostra il nome e termina la sessione con l’ultima voce, poi si può accedere di nuovo', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'elenco fatture');
    expect(el.querySelector('lc-user-menu .name')?.textContent?.trim()).toBe('operatore');
    (el.querySelector('lc-user-menu button.trigger') as HTMLButtonElement).click();
    await until(fixture, () => document.querySelectorAll('.ant-dropdown li[nz-menu-item]').length > 0, 'menu utente');
    const items = [...document.querySelectorAll<HTMLElement>('.ant-dropdown li[nz-menu-item]')];
    expect(items.at(-1)?.textContent?.trim()).toBe('Esci');
    items.at(-1)!.click();
    await until(fixture, () => !!el.querySelector('.signed-out'), 'sessione terminata');
    expect(el.querySelector('lc-sidebar')).toBeNull();
    (el.querySelector('.signed-out button') as HTMLButtonElement).click();
    await until(fixture, () => !el.querySelector('.signed-out'), 'di nuovo collegato');
  });

  it('i casi d’uso dipendono dai permessi del profilo', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => useCases().length > 0, 'selettore');
    expect(useCases()).toEqual(['Inserimento Fattura', 'Consultazione Fatture', 'Vetrina componenti']);
    await choose(fixture, headerSelect(el, 0), 'responsabile');
    await until(fixture, () => useCases().length === 5, 'quattro casi d’uso');
    expect(useCases()).toEqual(['Inserimento Fattura', 'Consultazione Fatture', 'Creazione pacchetto', 'Revisione Spese', 'Vetrina componenti']);
  });

  it('cambiare caso d’uso porta alla sua prima voce e aggiorna l’URL', async () => {
    const { fixture, el, url } = await start();
    await until(fixture, () => useCases().length > 0, 'selettore');
    await choose(fixture, useCaseSelect(el)!, 'Inserimento Fattura');
    await until(fixture, () => heading(el) === 'Nuova fattura', 'form nuova fattura');
    expect(url()).toBe('/inserimento-fattura/fattura-nuova?tipo=attiva');
    // il tipo arriva dai parametri della voce di menu
    expect(el.querySelector('main nz-select .ant-select-selection-item')?.textContent?.trim()).toBe('attiva');
    // il menu mostra i tre livelli: gruppo, sottogruppo, voce
    expect(sideLabels(el)).toContain('Fattura passiva');
    clickLabel(el, 'lc-sidebar .ant-menu-submenu-title', 'Da ordine');
    await until(fixture, () => sideLabels(el).includes("Scegli l'ordine"), 'terzo livello');
  });

  it('inserire una fattura la salva in bozza e porta all’elenco delle bozze', async () => {
    const { fixture, el, url } = await start();
    await until(fixture, () => useCases().length > 0, 'selettore');
    await choose(fixture, useCaseSelect(el)!, 'Inserimento Fattura');
    await until(fixture, () => heading(el) === 'Nuova fattura', 'form nuova fattura');
    const input = (name: string): HTMLInputElement => [...el.querySelectorAll('main input')].find((i) => i.id.endsWith(`-${name}`)) as HTMLInputElement;
    const type = (name: string, value: string): void => {
      input(name).value = value;
      input(name).dispatchEvent(new Event('input'));
    };
    // senza dati obbligatori il salvataggio non parte e compaiono gli errori
    (el.querySelector('main .actions button') as HTMLButtonElement).click();
    await until(fixture, () => el.querySelectorAll('main .ant-form-item-explain-error').length > 0, 'errori di validazione');
    type('numero', 'FT-2026-900');
    type('cliente', 'Gialli Srl');
    type('importo', '1200');
    (el.querySelector('main .actions button') as HTMLButtonElement).click();
    await until(fixture, () => heading(el) === 'Fatture' && rows(el) > 0, 'elenco delle bozze');
    expect(url()).toBe('/inserimento-fattura/fatture-elenco?stato=bozza');
    expect(el.querySelector('main')?.textContent).toContain('FT-2026-900');
    // con ?stato fisso il filtro non compare
    expect(el.querySelector('main nz-select')).toBeNull();
  });

  it('la revisione spese: voce con parametri, approvazione e messaggio', async () => {
    const { fixture, el, url } = await start('responsabile');
    await until(fixture, () => useCases().length === 5, 'quattro casi d’uso');
    await choose(fixture, useCaseSelect(el)!, 'Revisione Spese');
    await until(fixture, () => rows(el) > 0, 'elenco spese');
    expect(url()).toBe('/revisione-spese/spese-elenco?stato=da-revisionare');
    const before = rows(el);
    expect(buttonsOf(el)).toContain('Respingi');
    clickLabel(el, 'main button', 'Approva');
    await until(fixture, () => !!toast(), 'conferma');
    expect(toast()?.textContent).toContain('Spesa approvata');
    await until(fixture, () => rows(el) === before - 1, 'riga sparita dall’elenco da revisionare');
    // l'altra voce, stessa schermata con altri parametri, mostra le spese revisionate
    clickLabel(el, 'lc-sidebar a.leaf', 'Revisionate');
    await until(fixture, () => url().endsWith('stato=revisionata') && rows(el) > 0, 'spese revisionate');
    expect(buttonsOf(el)).not.toContain('Respingi');
  });

  it('l’operatore non può aprire una schermata senza permesso nemmeno scrivendo l’URL', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'elenco fatture');
    await TestBed.inject(Router).navigateByUrl('/revisione-spese/spese-elenco?stato=da-revisionare');
    await until(fixture, () => !!el.querySelector('main [role=alert]'), 'rifiuto');
    expect(el.querySelector('main')?.textContent).toContain('Non hai i permessi');
    expect(rows(el)).toBe(0);
  });

  it('il tema scuro cambia le variabili CSS', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'elenco fatture');
    await choose(fixture, headerSelect(el, 1), 'scuro');
    await until(fixture, () => document.documentElement.style.getPropertyValue('--lc-color-primary') === '#6aa6ff', 'tema scuro');
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('dark');
    // il ponte verso NG-ZORRO imposta i suoi colori e carica lo stylesheet scuro
    await until(fixture, () => document.documentElement.style.getPropertyValue('--ant-primary-color') === '#6aa6ff', 'colori di NG-ZORRO');
    expect(document.getElementById('lc-nz-dark-theme')?.getAttribute('href')).toBe('nz-dark.css');
    await choose(fixture, headerSelect(el, 1), 'chiaro');
    await until(fixture, () => document.documentElement.style.getPropertyValue('--ant-primary-color') === '#1f5fbf', 'tema chiaro');
    expect(document.getElementById('lc-nz-dark-theme')).toBeNull();
  });

  it('naviga al dettaglio di un ordine e mostra il form con i campi protetti', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'elenco fatture');
    await TestBed.inject(Router).navigateByUrl('/consultazione-fatture/ordini-elenco');
    await until(fixture, () => rows(el) > 0, 'elenco ordini');
    clickLabel(el, 'main button', 'Apri');
    await until(fixture, () => heading(el) === 'Dettaglio ordine', 'dettaglio');
    await until(fixture, () => (el.querySelector('main input[type=text]') as HTMLInputElement | null)?.value === 'Rossi Srl', 'valori del form');
    expect(el.querySelector('main')?.textContent).not.toContain('iban');
    expect((el.querySelector('main .actions button') as HTMLButtonElement).disabled).toBe(true);
  });
});
