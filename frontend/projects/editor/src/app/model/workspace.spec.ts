import { TestBed } from '@angular/core/testing';
import { Confirmation, I18n, Notifier } from 'core';
import { vi } from 'vitest';
import { EDITOR_MESSAGES } from '../messages';
import { draftKey } from './document-state';
import { EditorStore } from './editor-store';
import { RegistrySession } from './registry-session';
import { SavedDocuments } from './saved-documents';
import { ThemeStore } from './theme-store';
import { Project } from './project';
import { MemoryFolder } from './project-folder';
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

  it('restores the windows of a project, their documents and the active one at the next visit; another project has its own', () => {
    const first = TestBed.inject(Workspace);
    first.attach('browser:orders');
    const a = first.open('screen', { schemaVersion: '1.0', screen: 'orders', components: [] });
    const b = first.open('theme');
    first.minimize(b.id);
    first.place(a.id, { x: 40, y: 30, width: 500, height: 400 });
    a.injector.get(EditorStore).addNode('alert');
    TestBed.tick();
    const second = reload();
    expect(second.windows()).toEqual([]);
    second.attach('browser:orders');
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
    expect([a.id, b.id]).not.toContain(second.open('navigation').id);
    // Another project: its own windows (none yet); back to the first one, its windows again.
    TestBed.tick();
    second.attach('browser:invoices');
    expect(second.windows()).toEqual([]);
    second.attach('browser:orders');
    expect(second.windows().map((w) => w.kind)).toEqual(['screen', 'theme', 'navigation']);
  });

  it('a window of a resource is saved in its file; a new identifier renames the file, an identifier in use is refused', async () => {
    const project = TestBed.inject(Project);
    const folder = new MemoryFolder('p', {
      'project.json': JSON.stringify({ schemaVersion: '1.0', project: 'p', name: 'P', languages: ['en'], defaultLanguage: 'en' }),
      'screens/orders.json': JSON.stringify({ schemaVersion: '1.0', screen: 'orders', components: [] }),
      'screens/taken.json': JSON.stringify({ schemaVersion: '1.0', screen: 'taken', components: [] }),
    });
    await project.open(folder);
    const workspace = TestBed.inject(Workspace);
    workspace.attach(project.key()!);
    const win = await workspace.openResource({ kind: 'screen', id: 'orders', path: 'screens/orders.json' });
    expect(await workspace.openResource({ kind: 'screen', id: 'orders', path: 'screens/orders.json' })).toBe(win);
    const store = win.injector.get(EditorStore);
    store.setValue(['title'], 'Orders');
    await workspace.saveToProject(win);
    expect(JSON.parse(folder.files.get('screens/orders.json')!).title).toBe('Orders');
    expect(TestBed.inject(SavedDocuments).isSaved(win.id, store.doc())).toBe(true);
    store.setValue(['screen'], 'taken');
    await expect(workspace.saveToProject(win)).rejects.toThrow('a resource «taken» already exists in the project');
    store.setValue(['screen'], 'order-list');
    await workspace.saveToProject(win);
    expect([...folder.files.keys()].filter((p) => p.startsWith('screens/')).sort()).toEqual(['screens/order-list.json', 'screens/taken.json']);
    expect(win.path()).toBe('screens/order-list.json');
    expect(project.resources().map((r) => r.id)).toEqual(['project', 'order-list', 'taken']);
  });

  it('the data sources of the project as the screens see them: saved, with the changes of the open windows', async () => {
    const project = TestBed.inject(Project);
    const folder = new MemoryFolder('p', {
      'project.json': JSON.stringify({ schemaVersion: '1.0', project: 'p', name: 'P', languages: ['en'], defaultLanguage: 'en' }),
      'datasources/orders.json': JSON.stringify({ schemaVersion: '1.0', datasources: 'orders', sources: { list: { type: 'rest', method: 'GET', url: '/api/orders' } } }),
    });
    await project.open(folder);
    const workspace = TestBed.inject(Workspace);
    workspace.attach(project.key()!);
    expect(workspace.dataSources()['orders'].sources['list'].url).toBe('/api/orders');
    const win = await workspace.openResource({ kind: 'datasources', id: 'orders', path: 'datasources/orders.json' });
    win.state.setValue(['sources', 'list', 'url'], '/api/v2/orders');
    expect(workspace.dataSources()['orders'].sources['list'].url).toBe('/api/v2/orders');
    // Not valid: the saved version counts.
    win.state.setValue(['sources', 'list', 'method'], 'FETCH');
    expect(workspace.dataSources()['orders'].sources['list'].url).toBe('/api/orders');
  });

  it('the drafts of the editor before the workspace open in windows at the first start', () => {
    localStorage.setItem('lc.editor.draft', JSON.stringify({ doc: { schemaVersion: '1.0', screen: 'kept', components: [] }, samples: {}, translations: {} }));
    localStorage.setItem('lc.editor.mode', 'screen');
    const workspace = reload();
    workspace.attach('browser:first');
    expect(workspace.windows().map((w) => [w.kind, workspace.name(w), w.path()])).toEqual([['screen', 'kept', null]]);
    expect(localStorage.getItem('lc.editor.draft')).toBeNull();
    expect(localStorage.getItem('lc.editor.mode')).toBeNull();
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem(`${WORKSPACE_KEY}:browser:first`)!).windows).toHaveLength(1);
    // The windows of the workspace without projects (the previous version) go to the first project opened, once.
    localStorage.setItem(WORKSPACE_KEY, localStorage.getItem(`${WORKSPACE_KEY}:browser:first`)!);
    workspace.attach('browser:second');
    expect(workspace.windows()).toHaveLength(1);
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull();
  });

  it('recognises the kind of a document from its identifier property', () => {
    expect(documentKind({ screen: 'a', components: [] })).toBe('screen');
    expect(documentKind({ navigation: 'app', areas: [] })).toBe('navigation');
    expect(documentKind({ theme: 'dark', tokens: {} })).toBe('theme');
    expect(documentKind({ messages: {} })).toBeNull();
    expect(documentKind([])).toBeNull();
  });
});
