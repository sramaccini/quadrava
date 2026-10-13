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
      // Il form parte con il cliente 12, che non è tra le prime righe: il campo ne mostra comunque il nome.
      await until(() => form.querySelector('lc-lookup .ant-select-selection-item')?.textContent?.trim() === 'Marino Edilizia', 'nome del valore iniziale');
      await openSelect(form.querySelector('lc-lookup nz-select')!, settle);
      const search = form.querySelector('input.ant-select-selection-search-input') as HTMLInputElement;
      search.value = 'mila';
      search.dispatchEvent(new Event('input'));
      const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
      // Il valore già scelto resta in elenco accanto ai risultati della ricerca.
      await until(() => options().map((o) => o.textContent?.trim()).join('|') === 'Marino Edilizia|Rossi Srl', 'risultato della ricerca');
      options()[1].click();
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
      // L'articolo della riga iniziale è un codice: il lookup ne mostra il nome chiesto al servizio.
      await until(() => rows()[0].querySelector('lc-lookup .ant-select-selection-item')?.textContent?.trim() === 'Toner stampante', 'articolo iniziale');
      ([...repeater.querySelectorAll('button')].find((b) => b.textContent?.includes('Aggiungi un articolo')) as HTMLButtonElement).click();
      await settle();
      const save = (): void => ([...form.querySelectorAll(':scope > form > .actions button')].find((b) => b.textContent?.trim() === 'Salva') as HTMLButtonElement).click();
      save();
      await until(() => repeater.querySelectorAll('.cell-error').length === 2, 'errori della riga nuova');
      const second = rows()[1];
      await openSelect(second.querySelector('lc-lookup nz-select')!, settle);
      await until(() => [...document.querySelectorAll('.ant-select-item-option')].some((o) => o.textContent?.trim() === 'Graffette'), 'articoli');
      ([...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((o) => o.textContent?.trim() === 'Graffette'))!.click();
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

  describe('campi a sé', () => {
    it('i campi affiancati filtrano la tabella; gli altri scrivono nello stato che il testo mostra', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/vetrina/vetrina-input');
      await until(() => cells(el, 0, 0).length === 8, 'fatture');
      const row = el.querySelector('main lc-section .body.row') as HTMLElement;
      expect([...row.querySelectorAll('nz-form-label')].map((l) => plainText(l.textContent))).toEqual(['Tipo', 'Stato', 'Cliente']);
      // Tipo: Passiva.
      await openSelect(row.querySelector('nz-select')!, settle);
      await until(() => document.querySelectorAll('.ant-select-item-option').length > 0, 'opzioni');
      const options = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
      expect(options.map((o) => plainText(o.textContent))).toEqual(['Attiva', 'Passiva']);
      options[1].click();
      await until(() => cells(el, 0, 2).length > 0 && cells(el, 0, 2).every((c) => c === 'Passiva'), 'solo passive');
      // Nome e quantità finiscono nel riepilogo; l'interruttore avvisa e sblocca le note.
      const input = (label: string) => [...el.querySelectorAll('main lc-input')].find((i) => plainText(i.querySelector('nz-form-label')?.textContent) === label) as HTMLElement;
      const nome = input('Nome').querySelector('input') as HTMLInputElement;
      nome.value = 'Anna';
      nome.dispatchEvent(new Event('change'));
      await until(() => plainText(el.querySelector('[data-node-id="riepilogo"]')?.textContent) === 'Ciao Anna: 1 pezzi, consegna —', 'riepilogo');
      const note = input('Motivo dell’urgenza (attivo solo se urgente)').querySelector('textarea') as HTMLTextAreaElement;
      expect(note.readOnly).toBe(true);
      (input('Urgente').querySelector('nz-switch button') as HTMLButtonElement).click();
      await until(() => !note.readOnly && !!document.querySelector('.ant-message-notice'), 'urgente');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Segnata come urgente');
    });
  });

  describe('validazione dei campi a sé', () => {
    it('«Conferma» controlla il gruppo: senza nome si ferma e lo dice, con i dati giusti procede', { timeout: 20000 }, async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-input');
      const button = [...el.querySelectorAll<HTMLButtonElement>('main lc-button button')].find((b) => plainText(b.textContent).startsWith('Conferma'))!;
      button.click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'avviso');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Controlla i campi evidenziati');
      expect([...el.querySelectorAll('main .ant-form-item-explain-error')].map((e) => plainText(e.textContent))).toContain('Campo obbligatorio');
      const nome = [...el.querySelectorAll('main lc-input')].find((i) => plainText(i.querySelector('nz-form-label')?.textContent) === 'Nome')!.querySelector('input') as HTMLInputElement;
      nome.value = 'Anna';
      nome.dispatchEvent(new Event('change'));
      button.click();
      await until(() => [...document.querySelectorAll('.ant-message-notice')].some((n) => n.textContent?.includes('Dati corretti')), 'conferma');
    });
  });

  describe('contenitori di layout', () => {
    it('border con filtro a ovest e tabella al centro, griglia e box con proporzioni', { timeout: 20000 }, async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-contenitori');
      await until(() => cells(el, 0, 0).length === 8, 'fatture');
      const regions = [...el.querySelectorAll<HTMLElement>('main lc-border .region')];
      expect(regions.map((r) => r.dataset['region'])).toEqual(['north', 'west', 'center', 'east', 'south']);
      expect(regions[2].querySelector('nz-table')).not.toBeNull();
      // Il filtro a ovest scrive nello stato da cui dipende la tabella al centro.
      const radios = [...regions[1].querySelectorAll<HTMLElement>('label[nz-radio]')];
      expect(radios.map((r) => plainText(r.textContent))).toEqual(['Bozza', 'Inviata', 'Pagata']);
      (radios[2].querySelector('input') as HTMLInputElement).click();
      await until(() => cells(el, 0, 2).length > 0 && cells(el, 0, 2).every((c) => c === 'Pagata'), 'solo pagate');
      expect([...el.querySelectorAll<HTMLElement>('main lc-grid .grid > lc-node')].map((n) => n.style.getPropertyValue('--lc-span'))).toEqual(['2', '1', '3']);
      expect((el.querySelector('[data-node-id="sezione-due-terzi"]') as HTMLElement).style.flex).toBe('2 1 0px');
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

  describe('cruscotto', () => {
    it('gli indicatori mostrano i valori del riepilogo, formattati e con le note', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-cruscotto');
      const values = (): string[] => [...el.querySelectorAll('main lc-stats .value')].map((v) => plainText(v.textContent));
      await until(() => values().length === 4 && values()[0] !== '…', 'indicatori');
      expect(values()).toEqual(['11.275,00 €', '5975,00 €', '10', '2818,75 €']);
      expect([...el.querySelectorAll('main lc-stats .caption')].map((c) => plainText(c.textContent))).toEqual(['+12,5 % rispetto al mese scorso', 'su 14 in tutto']);
      // Nessun errore di espressione mentre i dati arrivano.
      await new Promise((r) => setTimeout(r, 0));
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });

    it('grafici: barre per due serie su dodici mesi, linea e torta per stato tradotta', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-cruscotto');
      const charts = (): Element[] => [...el.querySelectorAll('main lc-chart')];
      await until(() => charts().length === 4 && charts()[0].querySelectorAll('rect.mark').length === 24 && charts()[3].querySelectorAll('path.mark').length === 3, 'grafici');
      // Combinato: 24 pezzi di barra impilati (12 colonne) e la linea del margine sull'asse destro.
      expect(new Set([...charts()[1].querySelectorAll('rect.mark')].map((r) => r.getAttribute('x'))).size).toBe(12);
      expect(charts()[1].querySelectorAll('circle')).toHaveLength(12);
      expect(charts()[1].querySelector('text.axis.right')?.textContent?.trim()).toMatch(/%$/);
      expect([...charts()[1].querySelectorAll('.legend li')].map((li) => li.textContent?.trim())).toEqual(['Fatture attive', 'Fatture passive', 'Margine (asse destro)']);
      expect(charts()[2].querySelectorAll('circle')).toHaveLength(12);
      expect([...charts()[3].querySelectorAll('.legend li')].map((li) => li.textContent?.trim())).toEqual(['Bozza', 'Inviata', 'Pagata']);
      expect(charts()[3].querySelector('text.total')?.textContent?.trim()).toBe('14');
      expect(charts()[0].querySelector('table caption')?.textContent).toContain('Fatture attive e passive per mese');
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });
  });

  describe('procedure e viste', () => {
    it('procedura a passi: i dati del primo passo arrivano al riepilogo e la richiesta si invia', async () => {
      const { el, until, settle } = await openShowcase('/vetrina/vetrina-viste');
      const wizard = el.querySelector('main lc-wizard') as HTMLElement;
      const button = (text: string): HTMLButtonElement | undefined => [...wizard.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
      expect(button('Avanti')!.disabled).toBe(true);
      const input = wizard.querySelector('input[type="text"]') as HTMLInputElement;
      input.value = 'Nuovo monitor';
      input.dispatchEvent(new Event('input'));
      (wizard.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2]).click();
      await settle();
      button('Continua')!.click();
      await until(() => !!wizard.querySelector('section')?.textContent?.includes('Oggetto: Nuovo monitor. Priorità: alta.'), 'riepilogo');
      button('Avanti')!.click();
      await until(() => !!button('Invia la richiesta'), 'passo di invio');
      button('Invia la richiesta')!.click();
      await until(() => !!wizard.querySelector('nz-alert')?.textContent?.includes('La richiesta «Nuovo monitor» è stata inviata.'), 'esito');
      expect(button('Avanti')).toBeUndefined();
      button('Nuova richiesta')!.click();
      await until(() => !!wizard.querySelector('lc-form') && button('Avanti')?.disabled === true, 'di nuovo al primo passo, da compilare');
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });

    it('vista ad albero: la scelta di una categoria aggiorna lo stato e mostra un messaggio', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-viste');
      const titles = (): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('main lc-tree .title')];
      await until(() => titles().some((t) => t.textContent?.trim() === 'Informatica'), 'albero');
      titles().find((t) => t.textContent?.trim() === 'Manutenzione')!.click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'messaggio');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Manutenzione: 18 voci di spesa');
      await until(() => !!el.querySelector('main')?.textContent?.includes('Codice scelto: ser-man'), 'stato aggiornato');
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });

    it('calendario: scadenze del mese con «+n», apertura di una scadenza e mese successivo', async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-viste');
      const events = (): HTMLButtonElement[] => [...el.querySelectorAll<HTMLButtonElement>('main lc-calendar button.event')];
      await until(() => events().length > 0, 'scadenze');
      // Il giorno 8 ha quattro scadenze: tre visibili e «+1 altri».
      expect(el.querySelector('main lc-calendar .more')?.textContent?.trim()).toBe('+1 altri');
      events().find((b) => b.textContent?.includes('Stipendi'))!.click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'messaggio');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Stipendi: 1470,00');
      const title = el.querySelector('main lc-calendar .header h3')?.textContent;
      (el.querySelector('main lc-calendar button[aria-label="Mese successivo"]') as HTMLButtonElement).click();
      await until(() => el.querySelector('main lc-calendar .header h3')?.textContent !== title && events().length > 0, 'mese successivo');
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });
  });

  describe('datatable', () => {
    it('movimenti raggruppati per conto, con totali; un filtro per stato e il raggruppamento cambiano la vista', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/vetrina/vetrina-datatable');
      const dt = (): HTMLElement => el.querySelector('main lc-data-table') as HTMLElement;
      const groups = (): string[] => [...dt().querySelectorAll('tr.group-row .group-label')].map((g) => plainText(g.textContent));
      await until(() => groups().length > 0, 'gruppi');
      expect(plainText(dt().querySelector('.count')?.textContent)).toBe('60 di 60 righe');
      expect(groups()[0]).toMatch(/^Conto: Banca Intesa \(\d+\)$/);
      expect(dt().querySelector('tfoot')?.textContent).toContain('Totale');
      // Filtro: solo i movimenti da verificare.
      (([...dt().querySelectorAll<HTMLElement>('th')].find((th) => th.textContent?.trim().startsWith('Stato'))!.querySelector('nz-filter-trigger span')) as HTMLElement).click();
      const panel = (): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('.ant-dropdown .filter-panel')].find((p) => p.getAttribute('aria-label') === 'Filtra Stato');
      await until(() => !!panel(), 'filtro');
      const options = [...panel()!.querySelectorAll<HTMLElement>('label[nz-checkbox]')];
      expect(options.map((o) => plainText(o.textContent))).toEqual(['Da verificare', 'Registrato']);
      (options[0].querySelector('input') as HTMLInputElement).click();
      await until(() => plainText(dt().querySelector('.count')?.textContent) !== '60 di 60 righe', 'filtrati');
      expect(plainText(dt().querySelector('.count')?.textContent)).toBe('7 di 60 righe');
      document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
      // Raggruppamento: anche per categoria.
      await openSelect(dt().querySelector('.toolbar nz-select')!, settle);
      await until(() => document.querySelectorAll('.ant-select-item-option').length > 0, 'opzioni');
      ([...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((o) => o.textContent?.trim() === 'Categoria'))!.click();
      await until(() => groups().some((g) => g.startsWith('Categoria:')), 'due livelli');
      // La riga «Verifica» è abilitata solo per i movimenti da verificare.
      const verify = [...dt().querySelectorAll<HTMLButtonElement>('lc-row-actions .actions > span button')];
      expect(verify.length).toBeGreaterThan(0);
      expect(verify.every((b) => !b.disabled)).toBe(true);
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });
  });

  describe('datatable lato server', () => {
    it('200.000 movimenti: gruppi dal servizio, apertura di un gruppo, verifica di una riga con refresh', { timeout: 30000 }, async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-datatable');
      const sdt = (): HTMLElement => el.querySelector('main lc-server-data-table') as HTMLElement;
      const groups = (): string[] => [...sdt().querySelectorAll('tr.group-row .group-label')].map((g) => plainText(g.textContent));
      await until(() => groups().length === 4, 'gruppi');
      expect(plainText(sdt().querySelector('.count')?.textContent)).toBe('4 gruppi');
      expect(groups()[0]).toBe('Conto: Banca Intesa (50.000)');
      (sdt().querySelector('tr.group-row button.toggle') as HTMLButtonElement).click();
      await until(() => sdt().querySelectorAll('tbody tr:not(.group-row):not(.note-row)').length === 15, 'righe del gruppo');
      expect(sdt().querySelector('tr.note-row button')?.textContent).toContain('49.985');
      // La prima riga da verificare del gruppo: Verifica, poi refresh e messaggio.
      const verify = [...sdt().querySelectorAll<HTMLButtonElement>('lc-row-actions .actions > span button')].find((b) => !b.disabled);
      if (verify) {
        verify.click();
        await until(() => !!document.querySelector('.ant-message-notice'), 'messaggio');
        expect(document.querySelector('.ant-message-notice')?.textContent).toContain('verificato');
      }
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });
  });
});
