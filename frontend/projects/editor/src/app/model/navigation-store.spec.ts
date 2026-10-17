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
    TestBed.inject(I18n).addMessages('en', EDITOR_MESSAGES['en']);
    store = TestBed.inject(NavigationStore);
    store.newNavigation();
  });

  it('recognises areas, groups and items, with their fields', () => {
    const doc = navigation as unknown as Json;
    expect(navTargetAt(doc, [])).toEqual({ kind: 'root' });
    expect(navTargetAt(doc, ['areas', 0])).toEqual({ kind: 'area' });
    expect(navTargetAt(doc, ['areas', 0, 'items', 0])).toEqual({ kind: 'group', level: 1 });
    expect(navTargetAt(doc, ['areas', 0, 'items', 0, 'children', 0])).toEqual({ kind: 'leaf' });
    expect(navTargetAt(doc, ['areas', 0, 'items', 0, 'children', 2])).toEqual({ kind: 'group', level: 2 });
    expect(canAddGroup(doc, ['areas', 0, 'items', 0])).toBe(true);
    expect(canAddGroup(doc, ['areas', 0, 'items', 0, 'children', 2])).toBe(false);
    expect(navProperties({ kind: 'leaf' }).map((p) => p.name)).toEqual(['id', 'label', 'icon', 'screen', 'params', 'requires', 'visibleIf']);
    expect(navProperties({ kind: 'root' }).map((p) => p.name)).toEqual(['schemaVersion', 'navigation', 'default', 'badges']);
    store.load(doc);
    expect(store.issues()).toEqual([]);
  });

  it('adds areas, groups and items in the right place, and no groups beyond the second level', () => {
    expect(store.issues()).toEqual([]);
    store.addArea();
    expect(store.selection()).toEqual(['areas', 1]);
    store.addItem('group');
    expect(store.selection()).toEqual(['areas', 1, 'items', 1]);
    store.addItem('group');
    expect(store.selection()).toEqual(['areas', 1, 'items', 1, 'children', 1]);
    // Inside a subgroup only items go: a new group goes next to it, as another subgroup.
    expect(store.itemPoint('group')).toEqual({ list: ['areas', 1, 'items', 1, 'children'], index: 2 });
    store.addItem('leaf');
    expect(store.selection()).toEqual(['areas', 1, 'items', 1, 'children', 1, 'children', 1]);
    // On an item: the new one goes next to it.
    store.addItem('leaf');
    expect(store.selection()).toEqual(['areas', 1, 'items', 1, 'children', 1, 'children', 2]);
    expect(store.issues()).toEqual([]);
    store.select([]);
    expect(store.itemPoint('leaf')).toBeNull();
  });

  it('duplicates with new ids, moves, deletes; reports repeated ids, unknown screens and areas', () => {
    store.duplicate(['areas', 0]);
    expect(getIn(store.doc(), ['areas', 1, 'id'])).toBe('area-2');
    expect(getIn(store.doc(), ['areas', 1, 'items', 0, 'id'])).toBe('item-2');
    store.move(['areas', 1], -1);
    expect(getIn(store.doc(), ['areas', 0, 'id'])).toBe('area-2');
    store.setValue(['areas', 0, 'id'], 'area-1');
    expect(store.issues()).toContainEqual(expect.objectContaining({ pointer: '/areas/1/id', severity: 'error' }));
    store.remove(['areas', 1]);
    store.knownScreens.set(['order-list']);
    store.setValue(['default'], 'missing');
    expect(store.issues().map((i) => [i.pointer, i.severity])).toEqual([
      ['/areas/0/items/0/screen', 'warning'],
      ['/default', 'warning'],
    ]);
    expect(store.suggestions('screen')).toEqual(['order-list']);
    expect(store.suggestions('icon')).toContain('file-plus');
  });
});
