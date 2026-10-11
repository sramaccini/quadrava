import { TestBed } from '@angular/core/testing';
import { I18n } from 'core';
import navigation from '../../../../runtime/public/examples/navigation.json';
import { EDITOR_MESSAGES } from '../messages';
import { getIn, type Json } from './doc-ops';
import { canAddGroup, navProperties, navTargetAt, NavigationStore } from './navigation-store';

describe('NavigationStore', () => {
  let store: NavigationStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.inject(I18n).addMessages('it', EDITOR_MESSAGES['it']);
    store = TestBed.inject(NavigationStore);
    store.newNavigation();
  });

  it('riconosce casi d’uso, gruppi e voci, con i loro campi', () => {
    const doc = navigation as unknown as Json;
    expect(navTargetAt(doc, [])).toEqual({ kind: 'root' });
    expect(navTargetAt(doc, ['useCases', 0])).toEqual({ kind: 'useCase' });
    expect(navTargetAt(doc, ['useCases', 0, 'items', 0])).toEqual({ kind: 'group', level: 1 });
    expect(navTargetAt(doc, ['useCases', 0, 'items', 0, 'children', 0])).toEqual({ kind: 'leaf' });
    expect(navTargetAt(doc, ['useCases', 0, 'items', 0, 'children', 2])).toEqual({ kind: 'group', level: 2 });
    expect(canAddGroup(doc, ['useCases', 0, 'items', 0])).toBe(true);
    expect(canAddGroup(doc, ['useCases', 0, 'items', 0, 'children', 2])).toBe(false);
    expect(navProperties({ kind: 'leaf' }).map((p) => p.name)).toEqual(['id', 'label', 'icon', 'screen', 'params', 'requires', 'visibleIf']);
    expect(navProperties({ kind: 'root' }).map((p) => p.name)).toEqual(['schemaVersion', 'navigation', 'default']);
    store.load(doc);
    expect(store.issues()).toEqual([]);
  });

  it('aggiunge casi d’uso, gruppi e voci nel punto giusto, e non gruppi oltre il secondo livello', () => {
    expect(store.issues()).toEqual([]);
    store.addUseCase();
    expect(store.selection()).toEqual(['useCases', 1]);
    store.addItem('group');
    expect(store.selection()).toEqual(['useCases', 1, 'items', 1]);
    store.addItem('group');
    expect(store.selection()).toEqual(['useCases', 1, 'items', 1, 'children', 1]);
    // Dentro un sottogruppo vanno solo voci: un gruppo nuovo va accanto, come altro sottogruppo.
    expect(store.itemPoint('group')).toEqual({ list: ['useCases', 1, 'items', 1, 'children'], index: 2 });
    store.addItem('leaf');
    expect(store.selection()).toEqual(['useCases', 1, 'items', 1, 'children', 1, 'children', 1]);
    // Su una voce: la nuova va accanto.
    store.addItem('leaf');
    expect(store.selection()).toEqual(['useCases', 1, 'items', 1, 'children', 1, 'children', 2]);
    expect(store.issues()).toEqual([]);
    store.select([]);
    expect(store.itemPoint('leaf')).toBeNull();
  });

  it('duplica con id nuovi, sposta, elimina; segnala id ripetuti, schermate e casi d’uso sconosciuti', () => {
    store.duplicate(['useCases', 0]);
    expect(getIn(store.doc(), ['useCases', 1, 'id'])).toBe('caso-2');
    expect(getIn(store.doc(), ['useCases', 1, 'items', 0, 'id'])).toBe('voce-2');
    store.move(['useCases', 1], -1);
    expect(getIn(store.doc(), ['useCases', 0, 'id'])).toBe('caso-2');
    store.setValue(['useCases', 0, 'id'], 'caso-1');
    expect(store.issues()).toContainEqual(expect.objectContaining({ pointer: '/useCases/1/id', severity: 'error' }));
    store.remove(['useCases', 1]);
    store.knownScreens.set(['ordini-elenco']);
    store.setValue(['default'], 'inesistente');
    expect(store.issues().map((i) => [i.pointer, i.severity])).toEqual([
      ['/useCases/0/items/0/screen', 'warning'],
      ['/default', 'warning'],
    ]);
    expect(store.suggestions('screen')).toEqual(['ordini-elenco']);
    expect(store.suggestions('icon')).toContain('file-plus');
  });
});
