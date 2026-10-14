import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import navigationDoc from '../../public/examples/navigation.json';
import base from '../../public/examples/vetrina-base.json';
import form from '../../public/examples/vetrina-form.json';
import tables from '../../public/examples/vetrina-tabelle.json';
import layout from '../../public/examples/vetrina-layout.json';
import detail from '../../public/examples/ordine-dettaglio.json';
import chiaro from '../../public/examples/themes/chiaro.json';
import scuro from '../../public/examples/themes/scuro.json';
import { DemoDiagnostics } from '../demo/demo-ports';
import { openSelect, stubViewportHeight } from './select-testing';
import catalogIt from '../../public/examples/i18n/it.json';
import catalogEn from '../../public/examples/i18n/en.json';
import { I18n } from 'core';
import { App } from './app';
import { appConfig } from './app.config';

/** La vetrina deve funzionare davvero: ogni schermata si apre senza errori e i suoi esempi fanno quello che dicono. */
describe('Vetrina dei componenti', () => {
  const files: Record<string, unknown> = {
    'examples/navigation.json': navigationDoc,
    'examples/vetrina-base.json': base,
    'examples/vetrina-form.json': form,
    'examples/vetrina-tabelle.json': tables,
    'examples/vetrina-layout.json': layout,
    'examples/ordine-dettaglio.json': detail,
    'examples/i18n/it.json': catalogIt,
    'examples/i18n/en.json': catalogEn,
    'examples/themes/chiaro.json': chiaro,
    'examples/themes/scuro.json': scuro,
  };

  let restoreViewport: () => void;
  beforeAll(() => (restoreViewport = stubViewportHeight()));
  afterAll(() => restoreViewport());

  beforeEach(() => {
    // Lingua della demo fissata: jsdom dichiara un browser in inglese.
    localStorage.setItem('lc.language', 'it');
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
  });

  async function until(fixture: ComponentFixture<App>, condition: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout: ${label}\n${(fixture.nativeElement as HTMLElement).querySelector('main')?.innerHTML.slice(0, 1500)}`);
  }

  async function open(path: string, user = 'operatore'): Promise<{ fixture: ComponentFixture<App>; el: HTMLElement }> {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    await until(fixture, () => !!el.querySelector('nz-header nz-select'), 'barra superiore');
    if (user !== 'operatore') await pick(fixture, el.querySelector('nz-header nz-select') as HTMLElement, user);
    await TestBed.inject(Router).navigateByUrl(path);
    await until(fixture, () => !!el.querySelector('main h2'), 'contenuto');
    return { fixture, el };
  }

  /** Sceglie una voce di un menu a tendina di NG-ZORRO dal suo testo. */
  async function pick(fixture: ComponentFixture<App>, select: HTMLElement, label: string): Promise<void> {
    const options = await openSelect(select, async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    });
    (options.find((o) => (o.textContent ?? '').trim() === label) as HTMLElement).click();
  }
  const toast = (): Element | null => document.body.querySelector('.ant-message-notice');
  const main = (el: HTMLElement): string => el.querySelector('main')?.textContent ?? '';
  const button = (el: HTMLElement, text: string): HTMLButtonElement | undefined =>
    [...el.querySelectorAll('main button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
  const rows = (el: HTMLElement, table = 0): number => el.querySelectorAll('main nz-table')[table]?.querySelectorAll('tbody tr:not(.ant-table-placeholder)').length ?? 0;
  const plain = (text: string | null | undefined): string => (text ?? '').replace(/[\u00a0\u202f\s]+/g, ' ').trim();
  // Una finestra appena chiusa resta nel documento fino alla fine dell'animazione: conta l'ultima.
  const dialog = (): HTMLElement | null => [...document.body.querySelectorAll<HTMLElement>('.ant-modal-confirm')].at(-1) ?? null;
  const answer = (action: 'confirm' | 'cancel'): void => {
    const buttons = [...document.body.querySelectorAll<HTMLElement>('.ant-modal-confirm-btns')].at(-1)!.querySelectorAll<HTMLButtonElement>('button');
    (action === 'cancel' ? buttons[0] : buttons[1]).click();
  };
  const field = (el: HTMLElement, name: string): HTMLInputElement | HTMLSelectElement | null =>
    [...el.querySelectorAll('main input, main select')].find((i) => i.id.endsWith(`-${name}`)) as HTMLInputElement | undefined ?? null;
  const type = async (fixture: ComponentFixture<App>, el: HTMLElement, name: string, value: string): Promise<void> => {
    const f = field(el, name)!;
    const select = f.closest('nz-select') as HTMLElement | null;
    if (select) return pick(fixture, select, value);
    f.value = value;
    f.dispatchEvent(new Event('input'));
  };

  it('il caso d’uso compare nel menu e le tre schermate si aprono senza errori', async () => {
    const diagnostics = TestBed.inject(DemoDiagnostics);
    for (const [path, titolo] of [
      ['/vetrina/vetrina-base', 'Componenti base'],
      ['/vetrina/vetrina-form', 'Form'],
      ['/vetrina/vetrina-tabelle', 'Filtri e tabelle'],
      ['/vetrina/vetrina-layout', 'Schede, dettaglio e messaggi'],
    ]) {
      const { el, fixture } = await open(path);
      await until(fixture, () => main(el).includes(titolo), titolo);
      expect(el.querySelector('lc-sidebar')?.textContent).toContain('Componenti base');
      fixture.destroy();
    }
    expect(diagnostics.events(), JSON.stringify(diagnostics.events())).toEqual([]);
  });

  describe('componenti base', () => {
    it('il contatore cambia il testo e abilita il pulsante condizionato dallo stato', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-base');
      expect(main(el)).toContain('Hai premuto il pulsante 0 volte');
      expect(button(el, 'Abilitato dopo')!.disabled).toBe(true);
      button(el, 'Incrementa')!.click();
      await until(fixture, () => main(el).includes('1 volte'), 'primo incremento');
      await new Promise((r) => setTimeout(r, 30)); // il pulsante resta occupato finché l'azione non termina
      button(el, 'Incrementa')!.click();
      await until(fixture, () => main(el).includes('2 volte'), 'secondo incremento');
      expect(button(el, 'Abilitato dopo')!.disabled).toBe(false);
    });

    it('la chiamata che fallisce mostra solo il messaggio di onError e ferma la sequenza', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-base');
      button(el, 'Chiamata che fallisce')!.click();
      await until(fixture, () => !!toast(), 'toast');
      expect(toast()?.textContent).toContain('Errore gestito');
      await new Promise((r) => setTimeout(r, 300));
      expect(el.textContent).not.toContain('non compare mai');
    });

    it('la visibilità segue i permessi del profilo', async () => {
      const { el } = await open('/vetrina/vetrina-base');
      expect(button(el, 'Visibile solo con il permesso')).toBeUndefined();
      expect(button(el, 'Nascosto a chi può leggere')).toBeDefined();
      const admin = await open('/vetrina/vetrina-base', 'amministratore');
      expect(button(admin.el, 'Visibile solo con il permesso')).toBeDefined();
      expect(button(admin.el, 'Nascosto a chi può leggere')).toBeUndefined();
    });
  });

  describe('form', () => {
    it('i campi obbligatori e le regole mostrano gli errori solo dopo l’invio', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-form');
      expect(el.querySelectorAll('main .ant-form-item-explain-error').length).toBe(0);
      button(el, 'Invia')!.click();
      await until(fixture, () => el.querySelectorAll('main .ant-form-item-explain-error').length > 0, 'errore del nome');
      await type(fixture, el, 'nome', 'Mario');
      await type(fixture, el, 'eta', '12');
      button(el, 'Invia')!.click();
      await until(fixture, () => main(el).includes("L'età deve essere tra 18 e 120"), 'regola sull’età');
      await type(fixture, el, 'eta', '40');
      button(el, 'Invia')!.click();
      await until(fixture, () => !!toast(), 'invio riuscito');
      expect(toast()?.textContent).toContain('Dati inviati');
    });

    it('il campo partita IVA compare solo per i business e diventa obbligatorio', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-form');
      expect(field(el, 'partitaIva')).toBeNull();
      await type(fixture, el, 'categoria', 'Business');
      await until(fixture, () => !!field(el, 'partitaIva'), 'campo condizionale');
      await type(fixture, el, 'nome', 'Mario');
      button(el, 'Invia')!.click();
      await until(fixture, () => main(el).includes('Campo obbligatorio'), 'partita IVA obbligatoria');
      await type(fixture, el, 'partitaIva', '123');
      button(el, 'Invia')!.click();
      await until(fixture, () => main(el).includes('La partita IVA ha 11 cifre'), 'regola partita IVA');
    });

    it('il form di modifica carica i dati e protegge IBAN e salvataggio secondo i permessi', async () => {
      const operator = await open('/vetrina/vetrina-form');
      await until(operator.fixture, () => (field(operator.el, 'cliente') as HTMLInputElement | null)?.value === 'Rossi Srl', 'dati caricati');
      expect(field(operator.el, 'iban')).toBeNull();
      expect(button(operator.el, 'Salva')!.disabled).toBe(true);
      operator.fixture.destroy();
      const admin = await open('/vetrina/vetrina-form', 'amministratore');
      await until(admin.fixture, () => (field(admin.el, 'cliente') as HTMLInputElement | null)?.value === 'Rossi Srl', 'dati caricati');
      expect(field(admin.el, 'iban')).not.toBeNull();
      await until(admin.fixture, () => button(admin.el, 'Salva')!.disabled === false, 'salvataggio abilitato');
    });
  });

  describe('filtri e tabelle', () => {
    it('il filtro ricarica la tabella e la paginazione scorre le pagine', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-tabelle');
      await until(fixture, () => rows(el, 0) === 8, 'prima pagina');
      (el.querySelector('main .ant-pagination-next button') as HTMLButtonElement).click();
      await until(fixture, () => el.querySelector('main .ant-pagination-item-active')?.textContent?.trim() === '2' && rows(el, 0) === 8, 'seconda pagina');
      await type(fixture, el, 'stato', 'Approvato');
      // Filtrate stanno in una pagina sola: si torna alla prima e le pagine spariscono.
      await until(fixture, () => rows(el, 0) === 7 && !el.querySelector('main lc-table-footer .ant-pagination'), 'filtro applicato');
    });

    it('le azioni di riga rispettano permessi e stato della riga', async () => {
      const operator = await open('/vetrina/vetrina-tabelle');
      await until(operator.fixture, () => rows(operator.el, 0) > 0, 'righe');
      expect(button(operator.el, 'Approva')).toBeUndefined();
      operator.fixture.destroy();
      const manager = await open('/vetrina/vetrina-tabelle', 'responsabile');
      await until(manager.fixture, () => rows(manager.el, 0) > 0, 'righe');
      const approve = [...manager.el.querySelectorAll('main button')].filter((b) => b.textContent?.trim() === 'Approva');
      expect(approve.length).toBeGreaterThan(0);
      expect(approve.length).toBeLessThan(8); // solo gli ordini "inviato"
      const before = approve.length;
      (approve[0] as HTMLButtonElement).click();
      // L'approvazione chiede conferma: se si annulla non cambia nulla.
      await until(manager.fixture, () => !!dialog(), 'finestra di conferma');
      expect(dialog()?.textContent).toMatch(/Approvare l'ordine ORD-\d{4}\?/);
      answer('cancel');
      await new Promise((r) => setTimeout(r, 300));
      expect(toast()).toBeNull();
      expect([...manager.el.querySelectorAll('main button')].filter((b) => b.textContent?.trim() === 'Approva').length).toBe(before);
      (approve[0] as HTMLButtonElement).click();
      await until(manager.fixture, () => !!dialog(), 'seconda finestra di conferma');
      answer('confirm');
      await until(manager.fixture, () => !!toast(), 'conferma');
      await until(manager.fixture, () => [...manager.el.querySelectorAll('main button')].filter((b) => b.textContent?.trim() === 'Approva').length === before - 1, 'riga aggiornata');
    });

    it('la tabella semplice mostra un array di righe', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-tabelle');
      await until(fixture, () => rows(el, 1) === 2, 'pacchetti');
      expect(main(el)).toContain('Chiusura settembre');
    });
    it('i formati di cella: percentuale e badge degli ordini, importo, data e sì/no delle fatture', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-tabelle');
      await until(fixture, () => rows(el, 0) > 0 && rows(el, 2) > 0, 'righe');
      const first = [...el.querySelectorAll('main nz-table')[0].querySelectorAll('tbody tr')[0].querySelectorAll('td')].map((c) => plain(c.textContent));
      expect(first[3]).toBe('0 %');
      expect(el.querySelector('main nz-table tbody tr nz-tag')?.className).toContain('ant-tag-');
      const invoice = [...el.querySelectorAll('main nz-table')[2].querySelectorAll('tbody tr')[0].querySelectorAll('td')].map((c) => plain(c.textContent));
      expect(invoice[2]).toMatch(/^\d+,00 €$/);
      expect(invoice[3]).toMatch(/^\d{2}\/09\/26$/);
      expect(invoice[4]).toBe('No');
      expect(invoice[5]).toBe('Inviata');
    });
  });

  describe('schede, dettaglio e messaggi', () => {
    const tabs = (el: HTMLElement): string[] => [...el.querySelectorAll('main [role=tab]')].map((t) => plain(t.textContent));
    const openTab = async (fixture: ComponentFixture<App>, el: HTMLElement, label: string): Promise<void> => {
      ([...el.querySelectorAll('main [role=tab]')].find((t) => plain(t.textContent) === label) as HTMLElement).click();
      await until(fixture, () => !(el.querySelector('main [role=tabpanel][aria-hidden=false]') === null), label);
    };

    it('l\'operatore vede il dettaglio dell\'ordine, il messaggio di sola lettura e tre schede', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-layout');
      await until(fixture, () => main(el).includes('ORD-0001'), 'dettaglio');
      expect(tabs(el)).toEqual(["Dati dell'ordine", 'Fatture pagate', 'Azioni con conferma']);
      expect(el.querySelector('main lc-alert .ant-alert-error')?.textContent).toContain('non può modificare');
      const pairs = [...el.querySelectorAll('main .ant-descriptions-item-label')].map((l) => plain(`${l.textContent} ${l.nextElementSibling?.textContent}`));
      expect(pairs).toContain('Sconto 0 %');
      expect(main(el)).not.toContain('IBAN');
    });

    it('il responsabile non vede più il messaggio; l\'amministratore ha anche IBAN e la scheda riservata', async () => {
      const manager = await open('/vetrina/vetrina-layout', 'responsabile');
      await until(manager.fixture, () => main(manager.el).includes('ORD-0001'), 'dettaglio');
      expect(manager.el.querySelector('main lc-alert .ant-alert-error')).toBeNull();
      manager.fixture.destroy();
      const admin = await open('/vetrina/vetrina-layout', 'amministratore');
      await until(admin.fixture, () => main(admin.el).includes('ORD-0001'), 'dettaglio');
      expect(tabs(admin.el)).toEqual(["Dati dell'ordine", 'Fatture pagate', 'Azioni con conferma', 'Dati riservati']);
      expect(main(admin.el)).toContain('IBAN');
      expect(main(admin.el)).toContain('IT60X0542811101');
    });

    it('la scheda delle fatture mostra importo, data e sì/no formattati', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-layout');
      await openTab(fixture, el, 'Fatture pagate');
      await until(fixture, () => rows(el, 0) > 0, 'fatture pagate');
      const cells = [...el.querySelectorAll('main nz-table tbody tr')[0].querySelectorAll('td')].map((c) => plain(c.textContent));
      expect(cells[1]).toMatch(/,00 €$/);
      expect(cells[2]).toMatch(/^\d{2}\/09\/26$/);
      expect(cells[3]).toBe('Sì');
    });

    it('l\'azione con conferma: Annulla non fa nulla, Conferma esegue e avvisa', async () => {
      const { fixture, el } = await open('/vetrina/vetrina-layout');
      await openTab(fixture, el, 'Azioni con conferma');
      button(el, 'Elimina la bozza')!.click();
      await until(fixture, () => !!dialog(), 'finestra');
      expect(dialog()?.textContent).toContain('bozza di operatore');
      answer('cancel');
      await new Promise((r) => setTimeout(r, 300));
      expect(toast()).toBeNull();
      button(el, 'Elimina la bozza')!.click();
      await until(fixture, () => !!dialog(), 'seconda finestra');
      answer('confirm');
      await until(fixture, () => !!toast(), 'conferma');
      expect(toast()?.textContent).toContain('Bozza eliminata');
    });
  });

  it('cambiando lingua cambiano titolo, menu, testi della schermata e scritte del guscio', async () => {
    const { fixture, el } = await open('/inserimento-fattura/vetrina-base');
    await until(fixture, () => !!el.querySelector('h1') && el.querySelector('h1')!.textContent!.includes('Vetrina: componenti base'), 'titolo in italiano');
    expect(el.querySelector('lc-sidebar')!.textContent).toContain('Inserimento Fattura');
    TestBed.inject(I18n).setLocale('en');
    await until(fixture, () => el.querySelector('h1')!.textContent!.includes('Showcase: basic components'), 'titolo in inglese');
    expect(el.querySelector('lc-sidebar')!.textContent).toContain('Invoice entry');
    expect(el.textContent).toContain('Active language: en');
    expect(el.textContent).toContain('Language');
    expect(document.documentElement.lang).toBe('en');
  });
});
