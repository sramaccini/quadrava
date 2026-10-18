import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Confirmation, I18n, Notifier } from 'core';
import { vi } from 'vitest';
import { EDITOR_MESSAGES } from '../messages';
import { DataSourcesStore } from './datasources-store';
import { EditorStore } from './editor-store';
import { Project, resourceAt, resourcePath } from './project';
import { ProjectCommands } from './project-commands';
import { MemoryFolder } from './project-folder';
import { MessagesStore } from './messages-store';
import { ProjectStore } from './project-store';
import { KnownDataSources, KnownTranslations } from './shared-state';
import { Workspace, documentProviders } from './workspace';

const MANIFEST = JSON.stringify({ schemaVersion: '1.0', project: 'shop', name: 'Shop', languages: ['en', 'it'], defaultLanguage: 'en', themes: ['light'] });
const ORDERS = JSON.stringify({
  schemaVersion: '1.0',
  datasources: 'orders',
  sources: { list: { type: 'rest', method: 'GET', url: '/api/orders' }, approve: { type: 'rest', method: 'POST', url: '/api/orders/{{id}}/approve' } },
});

describe('project resources', () => {
  it('every kind has its file, and a file says which resource it holds', () => {
    expect(resourcePath('screen', 'order-list')).toBe('screens/order-list.json');
    expect(resourcePath('datasources', 'orders')).toBe('datasources/orders.json');
    expect(resourcePath('theme', 'dark')).toBe('themes/dark.json');
    expect(resourcePath('navigation', 'whatever')).toBe('navigation.json');
    expect(resourcePath('project', 'x')).toBe('project.json');
    expect(resourceAt('screens/order-list.json')).toEqual({ kind: 'screen', id: 'order-list', path: 'screens/order-list.json' });
    expect(resourceAt('i18n/pt-BR.json')).toEqual({ kind: 'messages', id: 'pt-BR', path: 'i18n/pt-BR.json' });
    expect(resourceAt('index.json')).toBeNull();
    expect(resourceAt('screens/Order List.json')).toBeNull();
    expect(resourceAt('images/logo.json')).toBeNull();
  });
});

describe('Project', () => {
  let toasts: string[];
  let confirm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    toasts = [];
    confirm = vi.fn(async () => true);
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }));
    TestBed.configureTestingModule({
      providers: [
        { provide: Notifier, useValue: { toast: (m: string) => toasts.push(m) } },
        { provide: Confirmation, useValue: { confirm } },
      ],
    });
    TestBed.inject(I18n).addMessages('en', EDITOR_MESSAGES['en']);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('opens a folder with a valid project.json, lists its resources and keeps its data sources at hand', async () => {
    const project = TestBed.inject(Project);
    await expect(project.open(new MemoryFolder('empty'))).rejects.toThrow('not a Quadrava project');
    await expect(project.open(new MemoryFolder('bad', { 'project.json': '{"schemaVersion":"1.0"}' }))).rejects.toThrow('project.json is not valid');
    await project.open(new MemoryFolder('shop', { 'project.json': MANIFEST, 'datasources/orders.json': ORDERS, 'screens/b.json': '{}', 'screens/a.json': '{}', 'notes.json': '{}' }));
    expect(project.manifest()?.name).toBe('Shop');
    expect(project.resources().map((r) => r.path)).toEqual(['project.json', 'screens/a.json', 'screens/b.json', 'datasources/orders.json']);
    expect(Object.keys(project.dataSources()['orders'].sources)).toEqual(['list', 'approve']);
    expect(project.key()).toBe('memory:shop');
  });

  it('creates a project in an empty folder: manifest and navigation; writes and removes resources', async () => {
    const project = TestBed.inject(Project);
    const folder = new MemoryFolder('new');
    await project.create(folder, { schemaVersion: '1.0', project: 'new', name: 'New', languages: ['en'], defaultLanguage: 'en' }, { schemaVersion: '1.0', navigation: 'app', areas: [] });
    expect([...folder.files.keys()].sort()).toEqual(['navigation.json', 'project.json']);
    expect(folder.files.get('project.json')!.endsWith('}\n')).toBe(true);
    await expect(project.create(folder, project.manifest()!, {})).rejects.toThrow('already holds a project');
    await project.write({ kind: 'datasources', id: 'orders', path: 'datasources/orders.json' }, JSON.parse(ORDERS));
    expect(project.has('datasources', 'orders')).toBe(true);
    expect(project.dataSources()['orders']).toBeDefined();
    await project.remove({ kind: 'datasources', id: 'orders', path: 'datasources/orders.json' });
    expect(folder.files.has('datasources/orders.json')).toBe(false);
    expect(project.dataSources()).toEqual({});
    await expect(project.remove({ kind: 'project', id: 'project', path: 'project.json' })).rejects.toThrow('cannot be deleted');
  });

  it('commands: create, import (asking before replacing), delete a resource with its window', async () => {
    const folder = new MemoryFolder('shop', { 'project.json': MANIFEST });
    const commands = TestBed.inject(ProjectCommands);
    const workspace = TestBed.inject(Workspace);
    expect(await commands.open(folder)).toBe(true);
    const win = await commands.createResource('datasources', 'Calls of the orders service', 'orders');
    expect(win?.path()).toBe('datasources/orders.json');
    expect(JSON.parse(folder.files.get('datasources/orders.json')!)).toMatchObject({ datasources: 'orders', description: 'Calls of the orders service' });
    // Import over an existing resource: asked first; refused, nothing changes.
    confirm.mockResolvedValueOnce(false);
    expect(await commands.importDocument(JSON.parse(ORDERS), 'orders.json')).toBeNull();
    expect(JSON.parse(folder.files.get('datasources/orders.json')!).sources.list.url).toBe('/api/list');
    // Accepted: written and loaded in the window already open.
    const imported = await commands.importDocument(JSON.parse(ORDERS), 'orders.json');
    expect(imported).toBe(win);
    expect(win!.injector.get(DataSourcesStore).sourceNames()).toEqual(['list', 'approve']);
    expect(toasts.at(-1)).toBe('Imported orders.json into datasources/orders.json');
    expect(await commands.importDocument({ messages: {} }, 'x.json')).toBeNull();
    expect(await commands.deleteResource({ kind: 'datasources', id: 'orders', path: 'datasources/orders.json' }, 'orders')).toBe(true);
    expect(workspace.windows()).toEqual([]);
    expect(folder.files.has('datasources/orders.json')).toBe(false);
    // Closing the project with unsaved changes asks first.
    const screen = await commands.createResource('screen', 'Orders', 'orders');
    screen!.state.setValue(['title'], 'Changed');
    confirm.mockResolvedValueOnce(false);
    expect(await commands.close()).toBe(false);
    expect(await commands.close()).toBe(true);
    expect(TestBed.inject(Project).isOpen()).toBe(false);
  });

  it('the screens check their references against the data sources of the project', () => {
    const known = TestBed.inject(KnownDataSources);
    const store = createEnvironmentInjector(documentProviders('screen', 'd1'), TestBed.inject(EnvironmentInjector)).get(EditorStore);
    store.setValue(['dataSources'], { list: { ref: 'orders/list' }, gone: { ref: 'orders/gone' }, other: { ref: 'customers/list' } });
    // Without a project the references are not checked.
    expect(store.issues().filter((i) => i.pointer.endsWith('/ref'))).toEqual([]);
    known.documents.set({ orders: JSON.parse(ORDERS) });
    expect(store.issues().filter((i) => i.pointer.endsWith('/ref')).map((i) => [i.pointer, i.message, i.severity])).toEqual([
      ['/dataSources/gone/ref', 'The data source orders/gone is not in the project', 'warning'],
      ['/dataSources/other/ref', 'The data sources document «customers» is not in the project', 'warning'],
    ]);
  });

  it('a data sources document: renames and removes data sources with their sample data; checks the schema and expressions', () => {
    const store = createEnvironmentInjector(documentProviders('datasources', 'd2'), TestBed.inject(EnvironmentInjector)).get(DataSourcesStore);
    store.load(JSON.parse(ORDERS));
    expect(store.issues()).toEqual([]);
    store.setSample('list', [{ id: 1 }]);
    expect(store.renameSource('list', 'all')).toBe(true);
    expect(store.renameSource('all', 'approve')).toBe(false);
    expect(store.renameSource('all', '1 bad')).toBe(false);
    expect(store.samples()).toEqual({ all: [{ id: 1 }] });
    expect(store.addSource()).toBe('data');
    store.removeSource('all');
    expect(store.sourceNames()).toEqual(['approve', 'data']);
    store.setValue(['sources', 'data', 'url'], '/api/{{ broken(');
    expect(store.issues().map((i) => i.pointer)).toContain('/sources/data/url');
    store.setValue(['sources', 'data', 'method'], 'FETCH');
    expect(store.errorCount()).toBeGreaterThan(1);
  });

  it('the manifest: the default language among the languages, the themes in the project', async () => {
    const project = TestBed.inject(Project);
    await project.open(new MemoryFolder('shop', { 'project.json': MANIFEST, 'themes/light.json': '{}' }));
    const store = createEnvironmentInjector(documentProviders('project', 'd3'), TestBed.inject(EnvironmentInjector)).get(ProjectStore);
    expect(store.doc()).toMatchObject({ project: 'shop' });
    expect(store.issues()).toEqual([]);
    expect(store.suggestions('defaultLanguage')).toEqual(['en', 'it']);
    store.setValue(['defaultLanguage'], 'fr');
    store.setValue(['themes'], ['light', 'dark']);
    expect(store.issues().map((i) => [i.pointer, i.severity])).toEqual([
      ['/defaultLanguage', 'error'],
      ['/themes/1', 'warning'],
    ]);
  });

  it('a catalogue: plain texts with valid keys; the keys of the default language without a text are flagged', () => {
    TestBed.inject(KnownTranslations).project.set({ languages: ['en', 'it'], defaultLanguage: 'en', catalogues: { en: { 'a.one': 'One', 'a.two': 'Two' } } });
    const store = createEnvironmentInjector(documentProviders('messages', 'd4'), TestBed.inject(EnvironmentInjector)).get(MessagesStore);
    store.language.set('it');
    store.load({ 'a.one': 'Uno' });
    expect(store.issues().map((i) => [i.pointer, i.severity])).toEqual([['/a.two', 'warning']]);
    store.setValue(['bad key'], 'x');
    expect(store.errorCount()).toBeGreaterThan(0);
    // The default language is the reference: nothing is missing there.
    store.language.set('en');
    store.load({ 'a.one': 'One' });
    expect(store.issues()).toEqual([]);
  });

  it('saving the settings creates the catalogues of the languages added', async () => {
    const folder = new MemoryFolder('shop', { 'project.json': MANIFEST, 'i18n/en.json': '{}' });
    const commands = TestBed.inject(ProjectCommands);
    await commands.open(folder);
    const settings = await TestBed.inject(Workspace).openResource({ kind: 'project', id: 'project', path: 'project.json' });
    settings.state.setValue(['languages'], ['en', 'it', 'fr']);
    expect(await commands.save(settings)).toBe(true);
    expect(JSON.parse(folder.files.get('project.json')!).languages).toEqual(['en', 'it', 'fr']);
    expect([...folder.files.keys()].filter((p) => p.startsWith('i18n/')).sort()).toEqual(['i18n/en.json', 'i18n/fr.json', 'i18n/it.json']);
    expect(TestBed.inject(Project).catalogues()['fr']).toEqual({});
  });
});
