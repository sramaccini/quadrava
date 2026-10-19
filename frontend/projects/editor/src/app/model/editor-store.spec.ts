import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { I18n } from 'core';
import { EDITOR_MESSAGES } from '../messages';
import { getIn, type Json } from './doc-ops';
import { EditorStore } from './editor-store';
import { listItem, nodeProperties } from './schema-info';
import { defaultItem } from './templates';
import { documentProviders } from './workspace';

describe('EditorStore', () => {
  let store: EditorStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: documentProviders('screen', 'd1') });
    TestBed.inject(I18n).addMessages('en', EDITOR_MESSAGES['en']);
    store = TestBed.inject(EditorStore);
    store.newScreen();
  });

  const components = (): Json[] => getIn(store.doc(), ['components']) as Json[];

  it('starts from an empty, valid screen', () => {
    expect(store.issues()).toEqual([]);
    expect(store.definition()).not.toBeNull();
    expect(store.target()).toEqual({ kind: 'screen' });
  });

  it('adds inside the selected container or after the node, and creates the data source it needs', () => {
    store.addNode('section');
    expect(store.selection()).toEqual(['components', 0]);
    store.addNode('table');
    expect(store.selection()).toEqual(['components', 0, 'components', 0]);
    expect(getIn(store.doc(), ['dataSources', 'list'])).toEqual({ type: 'rest', method: 'GET', url: '/api/list' });
    store.addNode('text');
    expect(store.selection()).toEqual(['components', 0, 'components', 1]);
    store.select([]);
    store.addNode('alert');
    expect(components().map((c) => (c as { type: string }).type)).toEqual(['section', 'alert']);
    expect(store.issues()).toEqual([]);
  });

  it('undo and redo; close changes to the same property are a single step', () => {
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

  it('duplicates with new identifiers, moves, cuts and pastes into another container', () => {
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
    // Pasting the same node again gives new identifiers.
    store.paste();
    expect(getIn(store.doc(), ['components', 1, 'components', 1, 'id'])).toBe('text-3');
    expect(store.issues()).toEqual([]);
  });

  it('deletes and selects the nearby element; tabs and steps are added from their node', () => {
    store.addNode('tabs');
    store.addContainerItem(['components', 0]);
    expect(store.selection()).toEqual(['components', 0, 'tabs', 2]);
    expect(getIn(store.doc(), ['components', 0, 'tabs', 2, 'label'])).toBe('Tab 3');
    store.addNode('text');
    expect(store.selection()).toEqual(['components', 0, 'tabs', 2, 'components', 0]);
    store.remove(['components', 0, 'tabs', 2, 'components', 0]);
    expect(store.selection()).toEqual(['components', 0, 'tabs', 2]);
    store.remove(['components', 0]);
    expect(store.selection()).toEqual([]);
  });

  it('reports schema errors, expressions, repeated identifiers and missing data sources', () => {
    store.addNode('text');
    store.setValue(['components', 0, 'text'], undefined);
    expect(store.issues()).toContainEqual(expect.objectContaining({ owner: ['components', 0], severity: 'error' }));
    expect(store.definition()).toBeNull();
    store.setValue(['components', 0, 'text'], '{{ 1 + }}');
    expect(store.issues().some((i) => i.pointer === '/components/0/text')).toBe(true);
    store.setValue(['components', 0, 'text'], 'ok');
    store.duplicate(['components', 0]);
    store.setValue(['components', 1, 'id'], 'text-1');
    expect(store.issues()).toContainEqual(expect.objectContaining({ pointer: '/components/1/id', message: 'Identifier “text-1” is repeated', severity: 'error' }));
    store.setValue(['components', 1, 'id'], undefined);
    // An `id` in the arguments of steps is a value, not an identifier: the same one in two buttons is not repeated.
    store.setValue(['components', 0, 'onClick'], [{ call: 'save', args: { id: '{{ row.id }}' } }]);
    store.setValue(['components', 1, 'onClick'], [{ call: 'save', args: { id: '{{ row.id }}' } }]);
    expect(store.issues().filter((i) => i.message.includes('repeated'))).toEqual([]);
    store.setValue(['components', 0, 'onClick'], undefined);
    store.setValue(['components', 1, 'onClick'], undefined);
    store.addNode('table');
    store.removeSource('list');
    expect(store.issues()).toEqual([expect.objectContaining({ pointer: '/components/2/source', severity: 'warning', message: 'Data source “list” is not defined' })]);
    // Warnings do not prevent the preview.
    expect(store.definition()).not.toBeNull();
  });

  it('renames a data source updating nodes, steps and sample data', () => {
    store.addNode('table');
    store.addNode('button');
    store.setValue(['components', 1, 'onClick'], [{ refresh: 'list' }]);
    store.setSample('list', [{ id: 1 }]);
    expect(store.renameSource('list', 'orders')).toBe(true);
    expect(getIn(store.doc(), ['components', 0, 'source'])).toBe('orders');
    expect(getIn(store.doc(), ['components', 1, 'onClick'])).toEqual([{ refresh: 'orders' }]);
    expect(store.sourceNames()).toEqual(['orders']);
    expect(store.samples()).toEqual({ orders: [{ id: 1 }] });
    expect(store.renameSource('orders', '1x')).toBe(false);
    expect(store.addSource()).toBe('data');
    expect(store.renameSource('data', 'orders')).toBe(false);
  });

  it('makes a text translatable and keeps count of the missing translations', () => {
    store.addNode('text');
    // The screen title and the new text are plain texts.
    expect(store.textsToFix()).toBe(2);
    const key = store.makeTranslatable(['components', 0, 'text']);
    expect(key).toBe('new_screen.new_text');
    expect(getIn(store.doc(), ['components', 0, 'text'])).toBe("{{ t('new_screen.new_text', 'New text') }}");
    expect(store.translations()).toEqual({ en: { 'new_screen.new_text': 'New text' } });
    // Italian is missing.
    expect(store.textsToFix()).toBe(2);
    store.setTranslation('it', key!, 'Nuovo testo');
    expect(store.textsToFix()).toBe(1);
    expect(TestBed.inject(I18n).raw(key!, 'it')).toBe('Nuovo testo');
    // A second equal text gets a different key.
    store.duplicate(['components', 0]);
    store.setValue(['components', 1, 'text'], 'New text');
    expect(store.makeTranslatable(['components', 1, 'text'])).toBe('new_screen.new_text_2');
    expect(store.issues()).toEqual([]);
  });

  it('translation languages: they are added (valid codes), count among the missing ones, are imported and removed', () => {
    expect(store.languages()).toEqual(['en', 'it']);
    expect(store.addLanguage('FR')).toBe(false);
    expect(store.addLanguage('francese')).toBe(false);
    expect(store.addLanguage('it')).toBe(false);
    expect(store.addLanguage('fr')).toBe(true);
    expect(store.addLanguage('pt-BR')).toBe(true);
    store.addNode('text');
    const key = store.makeTranslatable(['components', 0, 'text'])!;
    const entry = { path: ['components', 0, 'text'], property: 'text', value: '', kind: 'key' as const, key, fallback: 'New text' };
    expect(store.missingLocales(entry)).toEqual(['it', 'fr', 'pt-BR']);

    // Import: the format of «Export translations»; a new language is added.
    expect(store.importTranslations({ fr: { [key]: 'Nouveau texte' }, de: { [key]: 'Neuer Text' } })).toBe(2);
    expect(store.languages()).toEqual(['en', 'it', 'fr', 'pt-BR', 'de']);
    expect(store.missingLocales(entry)).toEqual(['it', 'pt-BR']);
    expect(TestBed.inject(I18n).raw(key, 'de')).toBe('Neuer Text');
    expect(store.importTranslations({ FR: { a: 'b' } })).toBeNull();
    expect(store.importTranslations({ fr: { a: 1 } })).toBeNull();
    expect(store.importTranslations(['x'])).toBeNull();

    // The default one cannot be removed; removing a language loses its translations written here.
    expect(store.removeLanguage('en')).toBe(false);
    expect(store.removeLanguage('de')).toBe(true);
    expect(store.languages()).not.toContain('de');
    expect(store.translations()['de']).toBeUndefined();
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lc.editor.doc.d1')!).languages).toEqual(['en', 'it', 'fr', 'pt-BR']);
  });

  it('default language: it is changed among the present languages; it applies to fallbacks, «Make translatable» and the languages to remove', () => {
    expect(store.defaultLanguage()).toBe('en');
    expect(store.setDefaultLanguage('fr')).toBe(false);
    expect(store.setDefaultLanguage('it')).toBe(true);
    expect(store.languages()).toEqual(['it', 'en']);
    store.addNode('text');
    const key = store.makeTranslatable(['components', 0, 'text'])!;
    expect(store.translations()).toEqual({ it: { [key]: 'New text' } });
    const entry = { path: ['components', 0, 'text'], property: 'text', value: '', kind: 'key' as const, key, fallback: 'New text' };
    expect(store.missingLocales(entry)).toEqual(['en']);
    expect(store.removeLanguage('it')).toBe(false);
    expect(store.removeLanguage('en')).toBe(true);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lc.editor.doc.d1')!).defaultLanguage).toBe('it');
  });

  it('selection of several sibling nodes: Ctrl adds and removes, Shift a range; they are wrapped or deleted together', () => {
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
    // Range from the anchor (the last one chosen without Shift), backwards too.
    store.select(['components', 1]);
    store.selectRange(['components', 3]);
    expect(store.multi()).toEqual([['components', 1], ['components', 2], ['components', 3]]);
    store.selectRange(['components', 0]);
    expect(store.multi()).toEqual([['components', 0], ['components', 1]]);
    // Outside the list it starts again from a simple selection.
    store.select([]);
    store.addNode('section');
    store.select(['components', 0]);
    store.toggleSelect(['components', 1]);
    store.toggleSelect(['components', 4, 'components', 0]);
    expect(store.multi()).toEqual([]);

    // Wrapping in a grid: in place of the first, in order; a single step to undo.
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
    // Deleting together.
    store.select(['components', 0]);
    store.toggleSelect(['components', 3]);
    store.removeMany(store.multi());
    expect(components().map((c) => (c as { type: string }).type)).toEqual(['alert', 'button', 'section']);
    store.undo();
    expect(components()).toHaveLength(5);
  });

  it('wraps a node in a new container, which takes its position in the previous container', () => {
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
    // Tabs and steps are not wrapped.
    store.addNode('tabs');
    const before = store.doc();
    store.wrap(['components', 1, 'tabs', 0], 'box');
    expect(store.doc()).toBe(before);
  });

  it('steps before and after calls: run suggests the sequences and reports the missing ones; if and run start valid', () => {
    store.addNode('button');
    store.setValue(['actions'], { save: [{ toast: 'ok' }] });
    expect(store.suggestions('run')).toEqual(['save']);
    store.setValue(['components', 0, 'onClick'], [{ run: 'save' }, { run: 'missing' }]);
    expect(store.issues().map((i) => [i.pointer, i.severity])).toEqual([['/components/0/onClick/1/run', 'warning']]);
    // The templates of new steps (as «Add» creates them choosing the variant) are valid for the schema.
    const steps = listItem(nodeProperties('button').find((p) => p.name === 'onClick')!);
    const variant = (key: string) => (steps && 'variants' in steps ? steps.variants.find((v) => v.key === key)! : null)!;
    const t = (k: string) => k;
    store.setValue(['components', 0, 'onClick'], [defaultItem(variant('if').fields, 0, t), defaultItem(variant('call').fields, 0, t)]);
    expect(getIn(store.doc(), ['components', 0, 'onClick', 0])).toEqual({ if: '{{ true }}', then: { toast: 'ed.tpl.clicked' } });
    expect(store.issues().filter((i) => i.severity === 'error')).toEqual([]);
    store.setValue(['components', 0, 'onClick'], [defaultItem(variant('run').fields, 0, t)]);
    expect(store.issues().map((i) => i.severity)).toEqual(['warning']);
  });

    it('saves the draft in the browser and takes it back', () => {
    store.addNode('alert');
    TestBed.tick();
    const saved = JSON.parse(localStorage.getItem('lc.editor.doc.d1')!);
    expect(saved.doc.components[0].type).toBe('alert');
  });

  it('every open document has its own store and draft; the copied node is shared', () => {
    const other = createEnvironmentInjector(documentProviders('screen', 'd2'), TestBed.inject(EnvironmentInjector)).get(EditorStore);
    store.addNode('alert');
    store.copy(['components', 0]);
    expect(other.doc()).toMatchObject({ components: [] });
    other.paste();
    TestBed.tick();
    expect(getIn(other.doc(), ['components', 0, 'type'])).toBe('alert');
    expect(JSON.parse(localStorage.getItem('lc.editor.doc.d2')!).doc.components[0].type).toBe('alert');
    expect(JSON.parse(localStorage.getItem('lc.editor.doc.d1')!).doc.components.length).toBe(1);
  });
});
