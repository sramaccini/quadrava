import { TestBed } from '@angular/core/testing';
import { Confirmation, I18n, Notifier } from 'core';
import { vi } from 'vitest';
import { EDITOR_MESSAGES } from '../messages';
import { draftKey } from './document-state';
import { EditorStore } from './editor-store';
import { RegistrySession } from './registry-session';
import { SavedDocuments } from './saved-documents';
import { ThemeStore } from './theme-store';
import { WORKSPACE_KEY, Workspace, documentKind } from './workspace';

describe('Workspace', () => {
  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        { provide: Notifier, useValue: { toast: () => undefined } },
        { provide: Confirmation, useValue: { confirm: async () => true } },
      ],
    });
    TestBed.inject(I18n).addMessages('en', EDITOR_MESSAGES['en']);
  }

  beforeEach(() => {
    localStorage.clear();
    // No registry: the check of the registry session finds nothing.
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    setup();
  });

  afterEach(() => vi.unstubAllGlobals());

  /** A new visit: the services start again from what is in the browser storage. */
  function reload(): Workspace {
    TestBed.resetTestingModule();
    setup();
    return TestBed.inject(Workspace);
  }

  it('starts empty; every document opens in its own window, with its own store, in front of the others', () => {
    const workspace = TestBed.inject(Workspace);
    expect(workspace.windows()).toEqual([]);
    expect(workspace.active()).toBeNull();
    const a = workspace.open('screen', { schemaVersion: '1.0', screen: 'orders', components: [] });
    const b = workspace.open('screen');
    const theme = workspace.open('theme');
    expect(workspace.active()).toBe(theme);
    expect(a.injector.get(EditorStore)).not.toBe(b.injector.get(EditorStore));
    expect(workspace.name(a)).toBe('orders');
    expect(workspace.name(b)).toBe('new-screen');
    expect([a, b, theme].map((w) => workspace.layer(w.id))).toEqual([1, 2, 3]);
    // Opened documents have no changes to save.
    expect(TestBed.inject(SavedDocuments).isSaved(a.id, a.state.doc())).toBe(true);
    // Focus: in front and active; the order of the windows in the page does not change (the iframes do not reload).
    workspace.focus(a.id);
    expect(workspace.active()).toBe(a);
    expect([a, b, theme].map((w) => workspace.layer(w.id))).toEqual([3, 1, 2]);
    expect(workspace.windows()).toEqual([a, b, theme]);
    expect(workspace.lastOf('screen')).toBe(a);
    expect(workspace.latest('theme', ThemeStore)).toBe(theme.injector.get(ThemeStore));
    expect(workspace.latest('navigation', ThemeStore)).toBeNull();
  });

  it('minimizes to the bottom of the stack, maximizes, cycles like Ctrl+F6', () => {
    const workspace = TestBed.inject(Workspace);
    const [a, b, c] = [workspace.open('screen'), workspace.open('navigation'), workspace.open('theme')];
    workspace.minimize(c.id);
    expect(c.minimized()).toBe(true);
    expect(workspace.active()).toBe(b);
    expect(workspace.order()).toEqual([c.id, a.id, b.id]);
    workspace.toggleMaximize(b.id);
    expect(b.maximized()).toBe(true);
    // A new window opens maximized when the active one is maximized, as in MDI applications.
    const d = workspace.open('screen');
    expect(d.maximized()).toBe(true);
    workspace.cycle(1);
    expect(workspace.active()).toBe(b);
    expect(workspace.order().at(0)).toBe(d.id);
    workspace.cycle(-1);
    expect(workspace.active()).toBe(d);
    // The minimized window comes back when focused.
    workspace.focus(c.id);
    expect(c.minimized()).toBe(false);
  });

  it('closing forgets the store, the draft, the saved state and the registry version of the document', () => {
    const workspace = TestBed.inject(Workspace);
    const registry = TestBed.inject(RegistrySession);
    const a = workspace.open('screen', { schemaVersion: '1.0', screen: 'orders', components: [] });
    const b = workspace.open('theme');
    registry.setOrigin(a.id, { kind: 'screen', id: 'orders' }, 'abc');
    TestBed.tick();
    expect(localStorage.getItem(draftKey(a.id))).not.toBeNull();
    workspace.focus(a.id);
    workspace.close(a.id);
    expect(workspace.windows()).toEqual([b]);
    expect(workspace.active()).toBe(b);
    expect(localStorage.getItem(draftKey(a.id))).toBeNull();
    expect(registry.basedOn(a.id, { kind: 'screen', id: 'orders' })).toBeNull();
    expect(JSON.parse(localStorage.getItem('lc.editor.saved')!)[a.id]).toBeUndefined();
  });

  it('places the windows inside the area, tiles and cascades them', () => {
    const workspace = TestBed.inject(Workspace);
    workspace.resizeArea({ width: 1000, height: 600 });
    const [a, b] = [workspace.open('screen'), workspace.open('navigation')];
    workspace.place(a.id, { x: 900, y: 500, width: 400, height: 300 });
    expect(a.bounds()).toEqual({ x: 600, y: 300, width: 400, height: 300 });
    workspace.toggleMaximize(b.id);
    workspace.tile();
    expect([a.bounds(), b.bounds()]).toEqual([
      { x: 0, y: 0, width: 500, height: 600 },
      { x: 500, y: 0, width: 500, height: 600 },
    ]);
    expect(b.maximized()).toBe(false);
    workspace.cascade();
    expect(b.bounds().x - a.bounds().x).toBe(28);
    // The area shrinks: the windows come back inside it.
    workspace.resizeArea({ width: 700, height: 500 });
    expect(b.bounds().x + b.bounds().width).toBeLessThanOrEqual(700);
  });

  it('restores the windows, their documents and the active one at the next visit', () => {
    const first = TestBed.inject(Workspace);
    const a = first.open('screen', { schemaVersion: '1.0', screen: 'orders', components: [] });
    const b = first.open('theme');
    first.minimize(b.id);
    first.place(a.id, { x: 40, y: 30, width: 500, height: 400 });
    a.injector.get(EditorStore).addNode('alert');
    TestBed.tick();
    const second = reload();
    TestBed.tick();
    expect(second.windows().map((w) => [w.id, w.kind, w.minimized()])).toEqual([
      [a.id, 'screen', false],
      [b.id, 'theme', true],
    ]);
    const restored = second.windows()[0];
    expect(second.active()).toBe(restored);
    expect(restored.bounds()).toEqual({ x: 40, y: 30, width: 500, height: 400 });
    expect(restored.injector.get(EditorStore).doc()).toMatchObject({ screen: 'orders', components: [{ type: 'alert' }] });
    // The change made before the reload is still to save; new identifiers do not reuse the old ones.
    expect(TestBed.inject(SavedDocuments).isSaved(restored.id, restored.state.doc())).toBe(false);
    expect(second.open('navigation').id).toBe('d3');
  });

  it('the drafts of the editor before the workspace open in windows at the first start', () => {
    localStorage.setItem('lc.editor.draft', JSON.stringify({ doc: { schemaVersion: '1.0', screen: 'kept', components: [] }, samples: {}, translations: {} }));
    localStorage.setItem('lc.editor.mode', 'screen');
    const workspace = reload();
    expect(workspace.windows().map((w) => [w.kind, workspace.name(w)])).toEqual([['screen', 'kept']]);
    expect(localStorage.getItem('lc.editor.draft')).toBeNull();
    expect(localStorage.getItem('lc.editor.mode')).toBeNull();
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).windows).toHaveLength(1);
  });

  it('recognises the kind of a document from its identifier property', () => {
    expect(documentKind({ screen: 'a', components: [] })).toBe('screen');
    expect(documentKind({ navigation: 'app', areas: [] })).toBe('navigation');
    expect(documentKind({ theme: 'dark', tokens: {} })).toBe('theme');
    expect(documentKind({ messages: {} })).toBeNull();
    expect(documentKind([])).toBeNull();
  });
});
