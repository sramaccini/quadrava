import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { DemoDiagnostics } from '../demo/demo-ports';
import { stubViewportHeight } from './select-testing';
import { cells, headerCell, openShowcase, setupShowcase, teardownShowcase } from './showcase-testing';

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
  });
});
