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
  });
});
