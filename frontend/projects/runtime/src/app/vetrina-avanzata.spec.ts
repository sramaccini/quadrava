import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { DemoDiagnostics } from '../demo/demo-ports';
import { openSelect, stubViewportHeight } from './select-testing';
import { cells, headerCell, openShowcase, plainText, setupShowcase, teardownShowcase } from './showcase-testing';

/** Le schermate della vetrina per i componenti aggiunti dopo la prima versione: si aprono senza errori e fanno quello che dicono. */
describe('Vetrina: componenti avanzati', () => {
  let restoreViewport: () => void;
  beforeAll(() => (restoreViewport = stubViewportHeight()));
  afterAll(() => restoreViewport());
  beforeEach(() => setupShowcase());
  afterEach(() => teardownShowcase());

  describe('tabelle avanzate', () => {
    it('ordinamento: lato server per gli ordini, in pagina per le fatture', async () => {
      const diagnostics = TestBed.inject(DemoDiagnostics);
      const { el, until } = await openShowcase('/vetrina/vetrina-tabelle-avanzate');
      // Ordini: all'apertura numero decrescente, deciso dal servizio.
      await until(() => cells(el, 0, 0).length === 8, 'ordini');
      expect(cells(el, 0, 0)[0]).toBe('ORD-0021');
      headerCell(el, 0, 'Cliente').click();
      await until(() => cells(el, 0, 1)[0] === 'Bianchi SpA', 'ordini per cliente');
      // Fatture: ordinamento in pagina sull'importo.
      await until(() => cells(el, 1, 0).length === 8, 'fatture');
      headerCell(el, 1, 'Importo (€)').click();
      await until(() => cells(el, 1, 3)[0]?.startsWith('250'), 'importo crescente');
      headerCell(el, 1, 'Importo (€)').click();
      await until(() => /^1.?195/.test(cells(el, 1, 3)[0] ?? ''), 'importo decrescente');
      expect(diagnostics.events(), JSON.stringify(diagnostics.events())).toEqual([]);
    });

    it('selezione: due bozze inviate insieme, con conferma; con una fattura già inviata l’azione resta disabilitata', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-tabelle-avanzate');
      const table = (): Element => el.querySelectorAll('main nz-table')[2];
      const boxes = (): HTMLInputElement[] => [...table().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      const send = (): HTMLButtonElement => [...el.querySelectorAll<HTMLButtonElement>('main .bulk button')].find((b) => b.textContent?.includes('Invia le selezionate'))!;
      await until(() => cells(el, 2, 1).length === 8, 'fatture');
      expect(cells(el, 2, 3).slice(0, 4)).toEqual(['Bozza', 'Inviata', 'Pagata', 'Bozza']);
      boxes()[2].click(); // riga 2: inviata
      await until(() => !!el.querySelector('main .bulk .count')?.textContent?.includes('1 riga'), 'una riga');
      expect(send().disabled).toBe(true);
      boxes()[2].click();
      boxes()[1].click();
      boxes()[4].click();
      await until(() => !!el.querySelector('main .bulk .count')?.textContent?.includes('2 righe'), 'due righe');
      expect(send().disabled).toBe(false);
      send().click();
      await until(() => !!document.querySelector('.ant-modal-confirm-btns'), 'conferma');
      expect(document.querySelector('.ant-modal-confirm-content')?.textContent).toContain('Inviare 2 fatture?');
      ([...document.querySelectorAll('.ant-modal-confirm-btns')].at(-1)!.querySelectorAll('button')[1] as HTMLButtonElement).click();
      await until(() => cells(el, 2, 3)[0] === 'Inviata' && cells(el, 2, 3)[3] === 'Inviata', 'fatture inviate');
      expect(el.querySelector('main .bulk .count')?.textContent).toContain('Nessuna riga selezionata');
    });

    it('menu delle azioni: un pulsante per riga, le altre azioni nel menu «⋯»', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-tabelle-avanzate');
      await until(() => cells(el, 3, 0).length === 8, 'fatture');
      const rows = [...el.querySelectorAll('main nz-table')[3].querySelectorAll('tbody tr')];
      const inline = (i: number): string[] => [...rows[i].querySelectorAll('.actions > span button')].map((b) => b.textContent!.trim());
      expect(inline(0)).toEqual(['Invia']);
      expect(inline(1)).toEqual(['Invia']);
      expect((rows[1].querySelector('.actions > span button') as HTMLButtonElement).disabled).toBe(true);
      (rows[1].querySelector('button.more') as HTMLButtonElement).click();
      const items = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ant-dropdown li.lc-row-action')];
      await until(() => items().length === 2, 'menu della seconda riga');
      expect(items().map((i) => i.textContent!.trim())).toEqual(['Duplica', 'Sollecita il pagamento']);
      items()[1].click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'messaggio');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Sollecito inviato a Bianchi SpA');
    });

    it('righe espandibili: l’area mostra i dati della riga e il pulsante apre l’ordine', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-tabelle-avanzate');
      await until(() => cells(el, 4, 1).length === 8, 'ordini');
      const rows = (): Element[] => [...el.querySelectorAll('main nz-table')[4].querySelectorAll('tbody tr:not(.lc-extra-row)')];
      // ORD-0021 è approvato: non si espande.
      expect(rows()[0].querySelector('button.ant-table-row-expand-icon')).toBeNull();
      (rows()[1].querySelector('button.ant-table-row-expand-icon') as HTMLButtonElement).click();
      (rows()[2].querySelector('button.ant-table-row-expand-icon') as HTMLButtonElement).click();
      await until(() => el.querySelectorAll('main nz-table')[4].querySelectorAll('tr.lc-extra-row').length === 2, 'due aree aperte');
      const areas = [...el.querySelectorAll('main nz-table')[4].querySelectorAll('tr.lc-extra-row')];
      expect(areas[0].textContent).toContain('Cliente Neri Group, sconto 10 %.');
      expect(areas[0].textContent).not.toContain('Ordine in bozza');
      expect(areas[1].textContent).toContain('Ordine in bozza');
      ([...areas[1].querySelectorAll('button')].find((b) => b.textContent?.includes('Apri l’ordine')) as HTMLButtonElement).click();
      await until(() => TestBed.inject(Location).path().startsWith('/vetrina/ordine-dettaglio'), 'navigazione');
      expect(TestBed.inject(Location).path()).toContain('id=19');
    });

    it('numeri, collegamenti e totali: riga dei totali sulle righe caricate e numero cliccabile', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-tabelle-avanzate');
      await until(() => cells(el, 5, 0).length === 8, 'fatture');
      expect(cells(el, 5, 2).slice(0, 3)).toEqual(['1', '2', '3']);
      const totals = [...el.querySelectorAll('main nz-table')[5].querySelectorAll('tfoot tr.totals td')].map((td) => plainText(td.textContent));
      expect(totals).toEqual(['Totale', 'N. 8', '21', 'Media 19 %', '5780,00 €']);
      (el.querySelectorAll('main nz-table')[5].querySelector('tbody button.cell-link') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'messaggio');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Hai aperto la fattura FT-2026-001');
    });
  });

  describe('campi e form', () => {
    const pick = async (until: (c: () => boolean, l: string) => Promise<void>, settle: () => Promise<void>, select: Element, labels: string[]): Promise<void> => {
      await openSelect(select, settle);
      await until(() => document.querySelectorAll('.ant-select-item-option').length > 0, 'opzioni');
      const options = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
      for (const label of labels) { const option = options.find((o) => o.textContent?.trim() === label); if (!option) throw new Error('opzioni: ' + JSON.stringify(options.map((o) => o.textContent))); option.click(); }
      await until(() => true, 'scelta');
    };

    it('nuovi tipi di campo: il form raccoglie area di testo, radio, interruttore e selezione multipla', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/vetrina/vetrina-campi');
      const form = el.querySelector('main lc-form') as HTMLElement;
      expect((form.querySelector('nz-date-picker input') as HTMLInputElement).value).toBe('20/10/2026 09:30');
      const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'Citofonare Rossi';
      textarea.dispatchEvent(new Event('input'));
      const radios = [...form.querySelectorAll<HTMLElement>('label[nz-radio]')];
      expect(radios.map((r) => r.textContent?.trim())).toEqual(['Bassa', 'Normale', 'Alta']);
      (radios[2].querySelector('input') as HTMLInputElement).click();
      (form.querySelector('nz-switch button') as HTMLButtonElement).click();
      await pick(until, settle, form.querySelector('nz-select')!, ['SMS']);
      ([...form.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Invia') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'messaggio');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Priorità alta, spedizione urgente, avvisi su 2 canali');
    });

    it('nuovi tipi nei filtri: più stati insieme e tipo con «Tutti»', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/vetrina/vetrina-campi');
      await until(() => cells(el, 1, 0).length === 8, 'fatture');
      const bar = el.querySelector('main lc-filter-bar') as HTMLElement;
      await pick(until, settle, bar.querySelector('nz-select')!, ['Bozza', 'Pagata']);
      await until(() => cells(el, 1, 2).every((c) => c === 'Bozza' || c === 'Pagata') && cells(el, 1, 2).includes('Pagata'), 'due stati');
      const radios = [...bar.querySelectorAll<HTMLInputElement>('nz-radio-group input')];
      radios[2].click();
      await until(() => cells(el, 1, 1).length > 0 && cells(el, 1, 1).every((c) => c === 'Passiva'), 'solo passive');
      radios[0].click();
      await until(() => cells(el, 1, 1).includes('Attiva'), 'tutti i tipi');
    });

    it('lookup: cerca i clienti mentre si scrive, nel form e nei filtri', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/vetrina/vetrina-campi');
      const form = el.querySelectorAll('main lc-form')[1] as HTMLElement;
      await openSelect(form.querySelector('lc-lookup nz-select')!, settle);
      const search = form.querySelector('input.ant-select-selection-search-input') as HTMLInputElement;
      search.value = 'mila';
      search.dispatchEvent(new Event('input'));
      const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
      await until(() => options().length === 1 && options()[0].textContent?.trim() === 'Rossi Srl', 'risultato della ricerca');
      options()[0].click();
      ([...form.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Conferma') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'messaggio');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Cliente scelto: id 1');
      document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
      // Nei filtri il valore è il nome del cliente e la tabella si filtra.
      const bar = el.querySelector('main lc-filter-bar') as HTMLElement;
      await openSelect(bar.querySelector('lc-lookup nz-select')!, settle);
      await until(() => options().some((o) => o.textContent?.trim() === 'Bianchi SpA'), 'clienti');
      options().find((o) => o.textContent?.trim() === 'Bianchi SpA')!.click();
      await until(() => cells(el, 1, 0).length > 0 && cells(el, 1, 0).length < 8, 'fatture di Bianchi');
      expect(cells(el, 1, 0)).toEqual(['FT-2026-002', 'FT-2026-006', 'FT-2026-010', 'FT-2026-014']);
    });

    it('caricamento di file: il file parte subito, il servizio risponde con un id e il form lo salva', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-campi');
      const field = el.querySelector('main lc-file-field') as HTMLElement;
      const input = field.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true, value: [new File(['%PDF-1.7'], 'contratto.pdf', { type: 'application/pdf' })] });
      input.dispatchEvent(new Event('change'));
      await until(() => field.querySelector('.name')?.textContent?.trim() === 'contratto.pdf', 'file caricato');
      const form = field.closest('lc-form') as HTMLElement;
      ([...form.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Salva') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'messaggio');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Allegato contratto.pdf salvato (id 1)');
    });

    it('griglia: il form dell’anagrafica è a tre colonne e i campi larghi occupano più colonne', async () => {
      const { el } = await openShowcase('/vetrina/vetrina-campi');
      const form = [...el.querySelectorAll<HTMLElement>('main lc-form form')].find((f) => f.classList.contains('grid'))!;
      expect(form.style.getPropertyValue('--lc-form-columns')).toBe('3');
      const spans = [...form.querySelectorAll<HTMLElement>(':scope > nz-form-item')].map((i) => i.style.getPropertyValue('--lc-field-span'));
      expect(spans).toEqual(['2', '1', '2', '1', '1', '1', '1', '3']);
    });

    it('righe ripetibili: una riga nuova va completata prima di salvare', async () => {
      const { el, until, settle } = await openShowcase('/vetrina/vetrina-campi');
      const repeater = el.querySelector('main lc-repeater') as HTMLElement;
      const form = repeater.closest('lc-form') as HTMLElement;
      const rows = (): HTMLElement[] => [...repeater.querySelectorAll<HTMLElement>('tbody tr')];
      expect(rows()).toHaveLength(1);
      expect((rows()[0].querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Risma carta A4');
      ([...repeater.querySelectorAll('button')].find((b) => b.textContent?.includes('Aggiungi un articolo')) as HTMLButtonElement).click();
      await settle();
      const save = (): void => ([...form.querySelectorAll(':scope > form > .actions button')].find((b) => b.textContent?.trim() === 'Salva') as HTMLButtonElement).click();
      save();
      await until(() => repeater.querySelectorAll('.cell-error').length === 2, 'errori della riga nuova');
      const second = rows()[1];
      const article = second.querySelector('input[type="text"]') as HTMLInputElement;
      article.value = 'Graffette';
      article.dispatchEvent(new Event('input'));
      const quantity = second.querySelector('input[type="number"]') as HTMLInputElement;
      quantity.value = '3';
      quantity.dispatchEvent(new Event('input'));
      await settle();
      save();
      await until(() => !!document.querySelector('.ant-message-notice'), 'messaggio');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Ordine salvato con 2 righe');
    });

    it('dialog con form: nuovo contatto e modifica di una riga, con ricarica della tabella', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/vetrina/vetrina-campi');
      await until(() => cells(el, 0, 0).length === 2, 'contatti');
      const dialog = (): HTMLElement => [...document.querySelectorAll<HTMLElement>('.lc-dialog-form .ant-modal')].at(-1)!;
      const fill = (name: string, value: string): void => {
        const input = [...dialog().querySelectorAll<HTMLInputElement>('input')].find((i) => i.id.endsWith('-' + name))!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };
      const save = (): void => ([...dialog().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Salva') as HTMLButtonElement).click();
      ([...el.querySelectorAll('main button')].find((b) => b.textContent?.trim() === 'Nuovo contatto') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.lc-dialog-form .ant-modal input'), 'finestra');
      expect(dialog().querySelector('h2')?.textContent?.trim()).toBe('Nuovo contatto');
      fill('nome', 'Sara Greco');
      fill('email', 'sara.greco');
      save();
      await until(() => !!dialog().querySelector('.ant-form-item-explain-error'), 'e-mail non valida');
      expect(dialog().querySelector('.ant-form-item-explain-error')?.textContent).toContain('Indirizzo e-mail non valido');
      fill('email', 'sara.greco@example.com');
      save();
      await until(() => cells(el, 0, 0).includes('Sara Greco'), 'contatto creato');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Contatto creato');
      // Modifica: la finestra parte con i dati della riga.
      const rows = [...el.querySelectorAll('main nz-table')[0].querySelectorAll('tbody tr')];
      (rows[0].querySelector('.actions button') as HTMLButtonElement).click();
      await until(() => dialog().querySelector('h2')?.textContent?.trim() === 'Modifica Anna Conti', 'finestra di modifica');
      await settle();
      expect([...dialog().querySelectorAll<HTMLInputElement>('input')].find((i) => i.id.endsWith('-email'))?.value).toBe('anna.conti@example.com');
      fill('email', 'anna@example.com');
      save();
      await until(() => cells(el, 0, 1)[0] === 'anna@example.com', 'contatto aggiornato');
    });
  });

  describe('dettaglio', () => {
    it('i campi con tooltip hanno l’icona di aiuto con il testo tradotto', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-layout');
      await until(() => el.querySelectorAll('main lc-detail .help').length === 2, 'icone di aiuto');
      expect([...el.querySelectorAll('main lc-detail .help')].map((h) => h.getAttribute('aria-label'))).toEqual([
        'Percentuale applicata al totale dell’ordine',
        'Bozza, inviato al cliente o approvato',
      ]);
    });
  });
});
