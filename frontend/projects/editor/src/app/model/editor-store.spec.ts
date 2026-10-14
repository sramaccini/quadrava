import { TestBed } from '@angular/core/testing';
import { I18n } from 'core';
import { EDITOR_MESSAGES } from '../messages';
import { getIn, type Json } from './doc-ops';
import { EditorStore } from './editor-store';
import { listItem, nodeProperties } from './schema-info';
import { defaultItem } from './templates';

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

  it('rende traducibile un testo e tiene il conto delle traduzioni mancanti', () => {
    store.addNode('text');
    // Il titolo della schermata e il testo nuovo sono testi semplici.
    expect(store.textsToFix()).toBe(2);
    const key = store.makeTranslatable(['components', 0, 'text']);
    expect(key).toBe('nuova_schermata.nuovo_testo');
    expect(getIn(store.doc(), ['components', 0, 'text'])).toBe("{{ t('nuova_schermata.nuovo_testo', 'Nuovo testo') }}");
    expect(store.translations()).toEqual({ it: { 'nuova_schermata.nuovo_testo': 'Nuovo testo' } });
    // Manca l'inglese.
    expect(store.textsToFix()).toBe(2);
    store.setTranslation('en', key!, 'New text');
    expect(store.textsToFix()).toBe(1);
    expect(TestBed.inject(I18n).raw(key!, 'en')).toBe('New text');
    // Un secondo testo uguale riceve una chiave diversa.
    store.duplicate(['components', 0]);
    store.setValue(['components', 1, 'text'], 'Nuovo testo');
    expect(store.makeTranslatable(['components', 1, 'text'])).toBe('nuova_schermata.nuovo_testo_2');
    expect(store.issues()).toEqual([]);
  });

  it('lingue delle traduzioni: si aggiungono (codici validi), contano nelle mancanti, si importano e si tolgono', () => {
    expect(store.languages()).toEqual(['it', 'en']);
    expect(store.addLanguage('FR')).toBe(false);
    expect(store.addLanguage('francese')).toBe(false);
    expect(store.addLanguage('en')).toBe(false);
    expect(store.addLanguage('fr')).toBe(true);
    expect(store.addLanguage('pt-BR')).toBe(true);
    store.addNode('text');
    const key = store.makeTranslatable(['components', 0, 'text'])!;
    const entry = { path: ['components', 0, 'text'], property: 'text', value: '', kind: 'key' as const, key, fallback: 'Nuovo testo' };
    expect(store.missingLocales(entry)).toEqual(['en', 'fr', 'pt-BR']);

    // Import: il formato di «Esporta traduzioni»; una lingua nuova si aggiunge.
    expect(store.importTranslations({ fr: { [key]: 'Nouveau texte' }, de: { [key]: 'Neuer Text' } })).toBe(2);
    expect(store.languages()).toEqual(['it', 'en', 'fr', 'pt-BR', 'de']);
    expect(store.missingLocales(entry)).toEqual(['en', 'pt-BR']);
    expect(TestBed.inject(I18n).raw(key, 'de')).toBe('Neuer Text');
    expect(store.importTranslations({ FR: { a: 'b' } })).toBeNull();
    expect(store.importTranslations({ fr: { a: 1 } })).toBeNull();
    expect(store.importTranslations(['x'])).toBeNull();

    // La predefinita non si toglie; togliendo una lingua si perdono le sue traduzioni scritte qui.
    expect(store.removeLanguage('it')).toBe(false);
    expect(store.removeLanguage('de')).toBe(true);
    expect(store.languages()).not.toContain('de');
    expect(store.translations()['de']).toBeUndefined();
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lc.editor.draft')!).languages).toEqual(['it', 'en', 'fr', 'pt-BR']);
  });

  it('lingua predefinita: si cambia tra le lingue presenti; vale per i ripieghi, «Rendi traducibile» e le lingue da togliere', () => {
    expect(store.defaultLanguage()).toBe('it');
    expect(store.setDefaultLanguage('fr')).toBe(false);
    expect(store.setDefaultLanguage('en')).toBe(true);
    expect(store.languages()).toEqual(['en', 'it']);
    store.addNode('text');
    const key = store.makeTranslatable(['components', 0, 'text'])!;
    expect(store.translations()).toEqual({ en: { [key]: 'Nuovo testo' } });
    const entry = { path: ['components', 0, 'text'], property: 'text', value: '', kind: 'key' as const, key, fallback: 'Nuovo testo' };
    expect(store.missingLocales(entry)).toEqual(['it']);
    expect(store.removeLanguage('en')).toBe(false);
    expect(store.removeLanguage('it')).toBe(true);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lc.editor.draft')!).defaultLanguage).toBe('en');
  });

  it('selezione di più nodi fratelli: Ctrl aggiunge e toglie, Maiusc un intervallo; si avvolgono o si eliminano insieme', () => {
    for (const kind of ['text', 'alert', 'button', 'text']) {
      store.select([]);
      store.addNode(kind);
    }
    store.select(['components', 0]);
    store.toggleSelect(['components', 2]);
    expect(store.multi()).toEqual([['components', 0], ['components', 2]]);
    expect(store.selection()).toEqual(['components', 2]);
    store.toggleSelect(['components', 0]);
    expect(store.multi()).toEqual([]);
    expect(store.selection()).toEqual(['components', 2]);
    // Intervallo dal punto fermo (l'ultimo scelto senza Maiusc), anche all'indietro.
    store.select(['components', 1]);
    store.selectRange(['components', 3]);
    expect(store.multi()).toEqual([['components', 1], ['components', 2], ['components', 3]]);
    store.selectRange(['components', 0]);
    expect(store.multi()).toEqual([['components', 0], ['components', 1]]);
    // Fuori dall'elenco si riparte da una selezione semplice.
    store.select([]);
    store.addNode('section');
    store.select(['components', 0]);
    store.toggleSelect(['components', 1]);
    store.toggleSelect(['components', 4, 'components', 0]);
    expect(store.multi()).toEqual([]);

    // Avvolgere in una griglia: al posto del primo, nell'ordine; un solo passo da annullare.
    store.select(['components', 1]);
    store.selectRange(['components', 2]);
    store.wrapMany(store.multi(), 'grid');
    expect(components().map((c) => (c as { type: string }).type)).toEqual(['text', 'grid', 'text', 'section']);
    expect(((components()[1] as { components: { type: string }[] }).components).map((c) => c.type)).toEqual(['alert', 'button']);
    expect(store.selection()).toEqual(['components', 1]);
    expect(store.multi()).toEqual([]);
    expect(store.issues()).toEqual([]);
    store.undo();
    expect(components().map((c) => (c as { type: string }).type)).toEqual(['text', 'alert', 'button', 'text', 'section']);
    // Eliminare insieme.
    store.select(['components', 0]);
    store.toggleSelect(['components', 3]);
    store.removeMany(store.multi());
    expect(components().map((c) => (c as { type: string }).type)).toEqual(['alert', 'button', 'section']);
    store.undo();
    expect(components()).toHaveLength(5);
  });

  it('avvolge un nodo in un contenitore nuovo, che ne prende la posizione nel contenitore di prima', () => {
    store.addNode('grid');
    store.addNode('text');
    store.setValue(['components', 0, 'components', 0, 'span'], 2);
    store.wrap(['components', 0, 'components', 0], 'section');
    const wrapper = getIn(store.doc(), ['components', 0, 'components', 0]) as Record<string, Json>;
    expect(wrapper).toMatchObject({ type: 'section', span: 2, components: [{ type: 'text' }] });
    expect((wrapper['components'] as Record<string, Json>[])[0]['span']).toBeUndefined();
    expect(store.selection()).toEqual(['components', 0, 'components', 0]);
    expect(store.issues()).toEqual([]);
    store.undo();
    expect(getIn(store.doc(), ['components', 0, 'components', 0, 'type'])).toBe('text');
    // Le schede e i passi non si avvolgono.
    store.addNode('tabs');
    const before = store.doc();
    store.wrap(['components', 1, 'tabs', 0], 'box');
    expect(store.doc()).toBe(before);
  });

  it('passi prima e dopo le chiamate: run suggerisce le sequenze e segnala quelle che mancano; if e run nascono validi', () => {
    store.addNode('button');
    store.setValue(['actions'], { salva: [{ toast: 'ok' }] });
    expect(store.suggestions('run')).toEqual(['salva']);
    store.setValue(['components', 0, 'onClick'], [{ run: 'salva' }, { run: 'manca' }]);
    expect(store.issues().map((i) => [i.pointer, i.severity])).toEqual([['/components/0/onClick/1/run', 'warning']]);
    // I modelli dei passi nuovi (come li crea «Aggiungi» scegliendo la variante) sono validi per lo schema.
    const steps = listItem(nodeProperties('button').find((p) => p.name === 'onClick')!);
    const variant = (key: string) => (steps && 'variants' in steps ? steps.variants.find((v) => v.key === key)! : null)!;
    const t = (k: string) => k;
    store.setValue(['components', 0, 'onClick'], [defaultItem(variant('if').fields, 0, t), defaultItem(variant('call').fields, 0, t)]);
    expect(getIn(store.doc(), ['components', 0, 'onClick', 0])).toEqual({ if: '{{ true }}', then: { toast: 'ed.tpl.clicked' } });
    expect(store.issues().filter((i) => i.severity === 'error')).toEqual([]);
    store.setValue(['components', 0, 'onClick'], [defaultItem(variant('run').fields, 0, t)]);
    expect(store.issues().map((i) => i.severity)).toEqual(['warning']);
  });

    it('salva la bozza nel browser e la riprende', () => {
    store.addNode('alert');
    TestBed.tick();
    const saved = JSON.parse(localStorage.getItem('lc.editor.draft')!);
    expect(saved.doc.components[0].type).toBe('alert');
  });
});
