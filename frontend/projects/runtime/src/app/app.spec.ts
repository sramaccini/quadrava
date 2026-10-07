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
      choose(headerSelect(el, 0), user);
    }
    return { fixture, el, url };
  }

  const buttonsOf = (el: HTMLElement): string[] => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
  const headerSelect = (el: HTMLElement, index: number): HTMLSelectElement => el.querySelectorAll('header select')[index] as HTMLSelectElement;
  const useCaseSelect = (el: HTMLElement): HTMLSelectElement | null => el.querySelector('lc-sidebar select');
  const useCases = (el: HTMLElement): string[] => [...(useCaseSelect(el)?.options ?? [])].map((o) => o.textContent?.trim() ?? '');
  const sideLabels = (el: HTMLElement): string[] => [...el.querySelectorAll('lc-sidebar .row .label')].map((n) => n.textContent?.trim() ?? '');
  const choose = (s: HTMLSelectElement, value: string): void => {
    s.value = value;
    s.dispatchEvent(new Event('change'));
  };
  const clickLabel = (el: HTMLElement, selector: string, text: string): void => {
    ([...el.querySelectorAll(selector)].find((n) => n.textContent?.trim().startsWith(text)) as HTMLElement).click();
  };
  const rows = (el: HTMLElement): number => el.querySelectorAll('main tbody tr').length;

  it('all’avvio apre il caso d’uso predefinito e applica il tema', async () => {
    const { fixture, el, url } = await start();
    await until(fixture, () => rows(el) > 0, 'elenco fatture');
    expect(url()).toBe('/consultazione-fatture/fatture-elenco');
    expect(el.querySelector('h1')?.textContent).toBe('Fatture');
    expect(document.documentElement.style.getPropertyValue('--lc-color-primary')).toBe('#1f5fbf');
    expect(el.querySelector('lc-sidebar a[aria-current="page"]')?.textContent).toContain('Elenco fatture');
  });

  it('i casi d’uso dipendono dai permessi del profilo', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => useCases(el).length > 0, 'selettore');
    expect(useCases(el)).toEqual(['Inserimento Fattura', 'Consultazione Fatture', 'Vetrina componenti']);
    choose(headerSelect(el, 0), 'responsabile');
    await until(fixture, () => useCases(el).length === 5, 'quattro casi d’uso');
    expect(useCases(el)).toEqual(['Inserimento Fattura', 'Consultazione Fatture', 'Creazione pacchetto', 'Revisione Spese', 'Vetrina componenti']);
  });

  it('cambiare caso d’uso porta alla sua prima voce e aggiorna l’URL', async () => {
    const { fixture, el, url } = await start();
    await until(fixture, () => useCases(el).length > 0, 'selettore');
    choose(useCaseSelect(el)!, 'inserimento-fattura');
    await until(fixture, () => el.querySelector('h1')?.textContent === 'Nuova fattura', 'form nuova fattura');
    expect(url()).toBe('/inserimento-fattura/fattura-nuova?tipo=attiva');
    // il tipo arriva dai parametri della voce di menu
    expect((el.querySelector('main select') as HTMLSelectElement).value).toBe('attiva');
    // il menu mostra i tre livelli: gruppo, sottogruppo, voce
    expect(sideLabels(el)).toContain('Fattura passiva');
    clickLabel(el, 'lc-sidebar button.group', 'Da ordine');
    await until(fixture, () => sideLabels(el).includes("Scegli l'ordine"), 'terzo livello');
  });

  it('inserire una fattura la salva in bozza e porta all’elenco delle bozze', async () => {
    const { fixture, el, url } = await start();
    await until(fixture, () => useCases(el).length > 0, 'selettore');
    choose(useCaseSelect(el)!, 'inserimento-fattura');
    await until(fixture, () => el.querySelector('h1')?.textContent === 'Nuova fattura', 'form nuova fattura');
    const input = (name: string): HTMLInputElement => [...el.querySelectorAll('main input')].find((i) => i.id.endsWith(`-${name}`)) as HTMLInputElement;
    const type = (name: string, value: string): void => {
      input(name).value = value;
      input(name).dispatchEvent(new Event('input'));
    };
    // senza dati obbligatori il salvataggio non parte e compaiono gli errori
    (el.querySelector('main .actions button') as HTMLButtonElement).click();
    await until(fixture, () => el.querySelectorAll('main .lc-error').length > 0, 'errori di validazione');
    type('numero', 'FT-2026-900');
    type('cliente', 'Gialli Srl');
    type('importo', '1200');
    (el.querySelector('main .actions button') as HTMLButtonElement).click();
    await until(fixture, () => el.querySelector('h1')?.textContent === 'Fatture' && rows(el) > 0, 'elenco delle bozze');
    expect(url()).toBe('/inserimento-fattura/fatture-elenco?stato=bozza');
    expect(el.querySelector('main')?.textContent).toContain('FT-2026-900');
    // con ?stato fisso il filtro non compare
    expect(el.querySelector('main select')).toBeNull();
  });

  it('la revisione spese: voce con parametri, approvazione e messaggio', async () => {
    const { fixture, el, url } = await start('responsabile');
    await until(fixture, () => useCases(el).length === 5, 'quattro casi d’uso');
    choose(useCaseSelect(el)!, 'revisione-spese');
    await until(fixture, () => rows(el) > 0, 'elenco spese');
    expect(url()).toBe('/revisione-spese/spese-elenco?stato=da-revisionare');
    const before = rows(el);
    expect(buttonsOf(el)).toContain('Respingi');
    clickLabel(el, 'main button', 'Approva');
    await until(fixture, () => !!el.querySelector('.toast'), 'conferma');
    expect(el.querySelector('.toast')?.textContent).toContain('Spesa approvata');
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
    choose(headerSelect(el, 1), 'scuro');
    await until(fixture, () => document.documentElement.style.getPropertyValue('--lc-color-primary') === '#6aa6ff', 'tema scuro');
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('dark');
  });

  it('naviga al dettaglio di un ordine e mostra il form con i campi protetti', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'elenco fatture');
    await TestBed.inject(Router).navigateByUrl('/consultazione-fatture/ordini-elenco');
    await until(fixture, () => rows(el) > 0, 'elenco ordini');
    clickLabel(el, 'main button', 'Apri');
    await until(fixture, () => el.querySelector('h1')?.textContent === 'Dettaglio ordine', 'dettaglio');
    await until(fixture, () => (el.querySelector('main input[type=text]') as HTMLInputElement | null)?.value === 'Rossi Srl', 'valori del form');
    expect(el.querySelector('main')?.textContent).not.toContain('iban');
    expect((el.querySelector('main .actions button') as HTMLButtonElement).disabled).toBe(true);
  });
});
