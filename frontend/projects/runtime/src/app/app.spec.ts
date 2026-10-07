import { TestBed, type ComponentFixture } from '@angular/core/testing';
import detail from '../../public/examples/ordine-dettaglio.json';
import list from '../../public/examples/ordini-elenco.json';
import chiaro from '../../public/examples/themes/chiaro.json';
import scuro from '../../public/examples/themes/scuro.json';
import { App } from './app';
import { appConfig } from './app.config';

/** Prova end-to-end della demo: schermate JSON reali, porte finte, catalogo standard e temi. */
describe('App (demo)', () => {
  const files: Record<string, unknown> = {
    'examples/ordini-elenco.json': list,
    'examples/ordine-dettaglio.json': detail,
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
    for (let i = 0; i < 150; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout: ${label}\n${(fixture.nativeElement as HTMLElement).innerHTML.slice(0, 1500)}`);
  }

  const buttonsOf = (el: HTMLElement): string[] => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
  const select = (el: HTMLElement, index: number): HTMLSelectElement => el.querySelectorAll('header select')[index] as HTMLSelectElement;
  const choose = (s: HTMLSelectElement, value: string): void => {
    s.value = value;
    s.dispatchEvent(new Event('change'));
  };

  it('mostra l’elenco ordini e applica il tema chiaro', async () => {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    await until(fixture, () => el.querySelectorAll('tbody tr').length === 8, 'righe della tabella');
    expect(el.querySelector('h1')?.textContent).toBe('Ordini');
    expect(document.documentElement.style.getPropertyValue('--lc-color-primary')).toBe('#1f5fbf');
    expect(buttonsOf(el)).toContain('Apri');
    expect(buttonsOf(el)).not.toContain('Approva');
  });

  it('il profilo responsabile vede Approva e il tema scuro cambia le variabili', async () => {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    await until(fixture, () => el.querySelectorAll('tbody tr').length === 8, 'righe della tabella');
    choose(select(el, 0), 'responsabile');
    await until(fixture, () => buttonsOf(el).includes('Approva'), 'pulsante Approva');
    choose(select(el, 1), 'scuro');
    await until(fixture, () => document.documentElement.style.getPropertyValue('--lc-color-primary') === '#6aa6ff', 'tema scuro');
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('dark');
  });

  it('approvare un ordine mostra il messaggio e fa sparire il pulsante dalla riga', async () => {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    await until(fixture, () => el.querySelectorAll('tbody tr').length === 8, 'righe della tabella');
    choose(select(el, 0), 'responsabile');
    await until(fixture, () => buttonsOf(el).includes('Approva'), 'pulsante Approva');
    const before = buttonsOf(el).filter((b) => b === 'Approva').length;
    ([...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Approva') as HTMLButtonElement).click();
    await until(fixture, () => !!el.querySelector('.toast'), 'messaggio di conferma');
    expect(el.querySelector('.toast')?.textContent).toContain('approvato');
    await until(fixture, () => buttonsOf(el).filter((b) => b === 'Approva').length === before - 1, 'riga aggiornata');
  });

  it('naviga al dettaglio e mostra il form con i valori e i campi protetti', async () => {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    await until(fixture, () => el.querySelectorAll('tbody tr').length === 8, 'righe della tabella');
    ([...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Apri') as HTMLButtonElement).click();
    await until(fixture, () => el.querySelector('h1')?.textContent === 'Dettaglio ordine', 'schermata dettaglio');
    await until(fixture, () => (el.querySelector('input[type=text]') as HTMLInputElement | null)?.value === 'Rossi Srl', 'valori del form');
    // l'operatore non ha ordini.iban.leggi: il campo IBAN non c'è
    expect(el.textContent).not.toContain('iban');
    // senza ordini.scrivi il pulsante Salva è disabilitato
    expect((el.querySelector('form .actions button') as HTMLButtonElement).disabled).toBe(true);
    // l'amministratore vede IBAN e può salvare
    choose(select(el, 0), 'amministratore');
    await until(fixture, () => el.textContent?.includes('iban') ?? false, 'campo iban');
    await until(fixture, () => !(el.querySelector('form .actions button') as HTMLButtonElement).disabled, 'Salva abilitato');
  });

  it('segnala una schermata non valida invece di disegnarla', async () => {
    files['examples/ordini-elenco.json'] = { schemaVersion: '1.0', screen: 'x', components: [{ type: 'table' }] };
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    await until(fixture, () => !!el.querySelector('.problem'), 'segnalazione');
    expect(el.querySelector('.problem')?.textContent).toContain('non è valida');
    files['examples/ordini-elenco.json'] = list;
  });
});
