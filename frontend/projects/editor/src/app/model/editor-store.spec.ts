import { TestBed } from '@angular/core/testing';
import { I18n } from 'core';
import { EDITOR_MESSAGES } from '../messages';
import { getIn, type Json } from './doc-ops';
import { EditorStore } from './editor-store';

describe('EditorStore', () => {
  let store: EditorStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.inject(I18n).addMessages('it', EDITOR_MESSAGES['it']);
    store = TestBed.inject(EditorStore);
    store.newScreen();
  });

  const components = (): Json[] => getIn(store.doc(), ['components']) as Json[];

  it('parte da una schermata vuota e valida', () => {
    expect(store.issues()).toEqual([]);
    expect(store.definition()).not.toBeNull();
    expect(store.target()).toEqual({ kind: 'screen' });
  });

  it('aggiunge dentro il contenitore selezionato o dopo il nodo, e crea il data source che serve', () => {
    store.addNode('section');
    expect(store.selection()).toEqual(['components', 0]);
    store.addNode('table');
    expect(store.selection()).toEqual(['components', 0, 'components', 0]);
    expect(getIn(store.doc(), ['dataSources', 'elenco'])).toEqual({ type: 'rest', method: 'GET', url: '/api/elenco' });
    store.addNode('text');
    expect(store.selection()).toEqual(['components', 0, 'components', 1]);
    store.select([]);
    store.addNode('alert');
    expect(components().map((c) => (c as { type: string }).type)).toEqual(['section', 'alert']);
    expect(store.issues()).toEqual([]);
  });

  it('annulla e ripete; le modifiche ravvicinate alla stessa proprietà sono un solo passo', () => {
    store.addNode('text');
    store.setValue(['components', 0, 'text'], 'C');
    store.setValue(['components', 0, 'text'], 'Ci');
    store.setValue(['components', 0, 'text'], 'Ciao');
    store.undo();
    expect(getIn(store.doc(), ['components', 0, 'text'])).not.toBe('Ciao');
    expect(getIn(store.doc(), ['components', 0, 'text'])).not.toBe('Ci');
    store.undo();
    expect(components()).toEqual([]);
    expect(store.selection()).toEqual([]);
    store.redo();
    store.redo();
    expect(getIn(store.doc(), ['components', 0, 'text'])).toBe('Ciao');
    expect(store.canRedo()).toBe(false);
  });

  it('duplica con identificativi nuovi, sposta, taglia e incolla in un altro contenitore', () => {
    store.addNode('text');
    store.duplicate(['components', 0]);
    expect(components().map((c) => (c as { id: string }).id)).toEqual(['text-1', 'text-2']);
    store.move(['components', 1], -1);
    expect(store.selection()).toEqual(['components', 0]);
    expect((components()[0] as { id: string }).id).toBe('text-2');
    store.select([]);
    store.addNode('section');
    store.cut(['components', 0]);
    expect(components()).toHaveLength(2);
    store.select(['components', 1]);
    store.paste();
    expect(getIn(store.doc(), ['components', 1, 'components', 0, 'id'])).toBe('text-2');
    // Incollare di nuovo lo stesso nodo dà identificativi nuovi.
    store.paste();
    expect(getIn(store.doc(), ['components', 1, 'components', 1, 'id'])).toBe('text-3');
    expect(store.issues()).toEqual([]);
  });

  it('elimina e sceglie l’elemento vicino; schede e passi si aggiungono dal loro nodo', () => {
    store.addNode('tabs');
    store.addContainerItem(['components', 0]);
    expect(store.selection()).toEqual(['components', 0, 'tabs', 2]);
    expect(getIn(store.doc(), ['components', 0, 'tabs', 2, 'label'])).toBe('Scheda 3');
    store.addNode('text');
    expect(store.selection()).toEqual(['components', 0, 'tabs', 2, 'components', 0]);
    store.remove(['components', 0, 'tabs', 2, 'components', 0]);
    expect(store.selection()).toEqual(['components', 0, 'tabs', 2]);
    store.remove(['components', 0]);
    expect(store.selection()).toEqual([]);
  });

  it('segnala errori di schema, espressioni, identificativi ripetuti e data source mancanti', () => {
    store.addNode('text');
    store.setValue(['components', 0, 'text'], undefined);
    expect(store.issues()).toContainEqual(expect.objectContaining({ owner: ['components', 0], severity: 'error' }));
    expect(store.definition()).toBeNull();
    store.setValue(['components', 0, 'text'], '{{ 1 + }}');
    expect(store.issues().some((i) => i.pointer === '/components/0/text')).toBe(true);
    store.setValue(['components', 0, 'text'], 'ok');
    store.duplicate(['components', 0]);
    store.setValue(['components', 1, 'id'], 'text-1');
    expect(store.issues()).toContainEqual(expect.objectContaining({ pointer: '/components/1/id', message: 'Identificativo «text-1» ripetuto', severity: 'error' }));
    store.setValue(['components', 1, 'id'], undefined);
    store.addNode('table');
    store.removeSource('elenco');
    expect(store.issues()).toEqual([expect.objectContaining({ pointer: '/components/2/source', severity: 'warning', message: 'Data source «elenco» non definito' })]);
    // Gli avvisi non impediscono l'anteprima.
    expect(store.definition()).not.toBeNull();
  });

  it('rinomina un data source aggiornando nodi, passi e dati di esempio', () => {
    store.addNode('table');
    store.addNode('button');
    store.setValue(['components', 1, 'onClick'], [{ refresh: 'elenco' }]);
    store.setSample('elenco', [{ id: 1 }]);
    expect(store.renameSource('elenco', 'ordini')).toBe(true);
    expect(getIn(store.doc(), ['components', 0, 'source'])).toBe('ordini');
    expect(getIn(store.doc(), ['components', 1, 'onClick'])).toEqual([{ refresh: 'ordini' }]);
    expect(store.sourceNames()).toEqual(['ordini']);
    expect(store.samples()).toEqual({ ordini: [{ id: 1 }] });
    expect(store.renameSource('ordini', '1x')).toBe(false);
    expect(store.addSource()).toBe('dati');
    expect(store.renameSource('dati', 'ordini')).toBe(false);
  });

  it('salva la bozza nel browser e la riprende', () => {
    store.addNode('alert');
    TestBed.tick();
    const saved = JSON.parse(localStorage.getItem('lc.editor.draft')!);
    expect(saved.doc.components[0].type).toBe('alert');
  });
});
