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
  });
});
