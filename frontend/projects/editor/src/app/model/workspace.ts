import { EnvironmentInjector, Injectable, computed, createEnvironmentInjector, effect, inject, signal, type Provider, type Type, type WritableSignal } from '@angular/core';
import type { DataSourcesDefinition } from 'schema';
import { isObject, type Json } from './doc-ops';
import { DataSourceList, DataSourcesStore } from './datasources-store';
import { DOCUMENT_ID, DocumentState, draftKey } from './document-state';
import { EditorStore } from './editor-store';
import { FileAccess } from './file-access';
import { NavigationStore } from './navigation-store';
import { Project, RESOURCE_ID, documentId, resourceAt, resourcePath, type ProjectResource } from './project';
import { ProjectStore } from './project-store';
import { RegistrySession } from './registry-session';
import { SavedDocuments, type EditorKind } from './saved-documents';
import { ThemeStore } from './theme-store';
import { cascadeBounds, clampBounds, isBounds, tileBounds, type Area, type Bounds } from './window-layout';

export const WORKSPACE_KEY = 'lc.editor.workspace';
const KINDS: EditorKind[] = ['project', 'screen', 'datasources', 'navigation', 'theme'];
const STORES: Record<EditorKind, Type<DocumentState>> = {
  project: ProjectStore,
  screen: EditorStore,
  datasources: DataSourcesStore,
  navigation: NavigationStore,
  theme: ThemeStore,
};
/** Identifier of a window: `d` and letters or digits (it names the draft in the browser storage). */
const WINDOW_ID = /^d[0-9a-z]+$/;

/**
 * The providers of a document of the given kind: its identifier and its store, also as `DocumentState` (the fields generated
 * from the schema and the JSON view work on it, whatever the kind) and, for screens and data sources documents, as
 * `DataSourceList` (the «Data sources» panel).
 */
export function documentProviders(kind: EditorKind, id: string): Provider[] {
  const store = STORES[kind];
  const providers: Provider[] = [{ provide: DOCUMENT_ID, useValue: id }, store, { provide: DocumentState, useExisting: store }];
  if (kind === 'screen' || kind === 'datasources') providers.push({ provide: DataSourceList, useExisting: store });
  return providers;
}

/** Kind of a document read from a file: from its identifier property (`screen`, `datasources`, `navigation`, `theme`, `project`). */
export function documentKind(doc: Json): EditorKind | null {
  if (!isObject(doc)) return null;
  return KINDS.find((kind) => typeof doc[kind] === 'string') ?? null;
}

/** Drafts of the editor before the workspace (one document per kind), opened in windows the first time. */
const LEGACY_DRAFTS: [string, EditorKind][] = [
  ['lc.editor.draft', 'screen'],
  ['lc.editor.navigation', 'navigation'],
  ['lc.editor.theme', 'theme'],
];

/**
 * A document open in the workspace, in its own window. The injector holds the store of the document: the editor of the
 * window and the side panels (when the window is the active one) are created with it. `path` is the file of the resource
 * in the project (null for a document not saved in the project yet).
 */
export interface DocumentWindow {
  readonly id: string;
  readonly kind: EditorKind;
  readonly injector: EnvironmentInjector;
  readonly state: DocumentState;
  readonly path: WritableSignal<string | null>;
  readonly bounds: WritableSignal<Bounds>;
  readonly maximized: WritableSignal<boolean>;
  readonly minimized: WritableSignal<boolean>;
}

/** What is remembered in the browser: the windows (their documents are in the drafts), the stacking order, the active one. */
interface SavedWorkspace {
  windows: { id: string; kind: EditorKind; path?: string | null; bounds: Bounds; maximized: boolean; minimized: boolean }[];
  order: string[];
  active: string | null;
}

/**
 * The open documents of the project, as the windows of an IDE: several at once, of any kind, each with its own store,
 * history and draft, linked to the file of its resource. One is active (the one in front): the menus, the toolbar, the
 * shortcuts, the problems and the side panels work on it. The windows keep their opening order (`windows`, so that the
 * preview iframes are never moved in the page and do not reload); the stacking order is `order`, the last one on top. The
 * windows of every project are remembered in the browser (`attach`) and restored when it is opened again.
 */
@Injectable({ providedIn: 'root' })
export class Workspace {
  private readonly parent = inject(EnvironmentInjector);
  private readonly saved = inject(SavedDocuments);
  private readonly files = inject(FileAccess);
  private readonly registry = inject(RegistrySession);
  private readonly project = inject(Project);

  readonly windows = signal<DocumentWindow[]>([]);
  readonly order = signal<string[]>([]);
  private readonly activeId = signal<string | null>(null);
  /** Size of the area of the windows (measured by the workspace in the page; zero until then). */
  readonly area = signal<Area>({ width: 0, height: 0 });
  readonly active = computed(() => this.windows().find((w) => w.id === this.activeId()) ?? null);
  /** Key under which the windows are remembered (the project open); null: they are not remembered. */
  private readonly storageKey = signal<string | null>(null);

  /**
   * The data sources documents of the project as the screens see them: those saved, with the changes of the windows open on
   * them (when valid). The previews and the checks of the screens resolve their references with these.
   */
  readonly dataSources = computed<Record<string, DataSourcesDefinition>>(() => {
    const all = { ...this.project.dataSources() };
    for (const win of this.windows()) {
      if (win.kind !== 'datasources') continue;
      const resource = resourceAt(win.path() ?? '');
      const definition = win.injector.get(DataSourcesStore).definition();
      if (resource && definition) all[resource.id] = definition;
    }
    return all;
  });

  constructor() {
    effect(() => {
      const key = this.storageKey();
      if (!key) return;
      const state: SavedWorkspace = {
        windows: this.windows().map((w) => ({ id: w.id, kind: w.kind, path: w.path(), bounds: w.bounds(), maximized: w.maximized(), minimized: w.minimized() })),
        order: this.order(),
        active: this.activeId(),
      };
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // Storage not available: the workspace holds for the visit.
      }
    });
  }

  /**
   * Restores the windows of a project (`projectKey`, see `Project.key`) and remembers them from now on. The first time, the
   * windows and drafts of earlier versions of the editor (without projects) are taken over.
   */
  attach(projectKey: string): void {
    this.closeAll();
    const key = `${WORKSPACE_KEY}:${projectKey}`;
    this.restore(key);
    this.storageKey.set(key);
  }

  /** Stops remembering the windows (the project is closing) and closes them all. */
  detach(): void {
    this.storageKey.set(null);
    this.closeAll();
  }

  /** A new identifier for a document (to know it before the document is there, for example while choosing its file). */
  newId(): string {
    let id: string;
    do id = `d${Math.random().toString(36).slice(2, 10)}`;
    while (this.find(id));
    return id;
  }

  /**
   * Opens a document in a new window in front of the others: with `doc` that content (file, example, registry version),
   * otherwise a new document of the kind; `path` links it to the file of a resource. It has no changes to save.
   */
  open(kind: EditorKind, doc?: Json, options: { id?: string; path?: string | null } = {}): DocumentWindow {
    const id = options.id ?? this.newId();
    const front = this.active();
    const win = this.create(id, kind, options.path ?? null, cascadeBounds(this.windows().length, this.area()), front?.maximized() ?? false, false);
    if (doc !== undefined) win.state.load(doc);
    this.saved.markSaved(id, win.state.doc());
    this.windows.update((list) => [...list, win]);
    this.focus(id);
    return win;
  }

  /** The window of a resource of the project, if open. */
  windowOf(path: string): DocumentWindow | null {
    return this.windows().find((w) => w.path() === path) ?? null;
  }

  /** Opens a resource of the project in its window (or brings in front the one already open). */
  async openResource(resource: ProjectResource): Promise<DocumentWindow> {
    const open = this.windowOf(resource.path);
    if (open) {
      this.focus(open.id);
      return open;
    }
    const doc = await this.project.read(resource.path);
    return this.open(resource.kind as EditorKind, doc, { path: resource.path });
  }

  /**
   * Saves the document of a window in its resource file. The file follows the identifier written in the document: if it
   * changed, the resource is renamed (written under the new name, the old file removed). Throws with a readable message
   * when the identifier is not valid or another resource already has it.
   */
  async saveToProject(win: DocumentWindow): Promise<ProjectResource> {
    const doc = win.state.doc();
    const id = documentId(win.kind, doc);
    if (!id) throw new Error('the document has no valid identifier');
    const resource: ProjectResource = { kind: win.kind, id, path: resourcePath(win.kind, id) };
    const previous = win.path();
    if (resource.path !== previous && (this.project.resources().some((r) => r.path === resource.path) || this.windowOf(resource.path))) {
      throw new Error(`a resource «${id}» already exists in the project`);
    }
    await this.project.write(resource, doc);
    if (previous && previous !== resource.path) {
      const old = resourceAt(previous);
      if (old) await this.project.remove(old);
    }
    win.path.set(resource.path);
    this.saved.markSaved(win.id, doc);
    return resource;
  }

  /** Closes a window: its store, draft, file and registry version are forgotten. The next one in the stack becomes active. */
  close(id: string): void {
    const win = this.find(id);
    if (!win) return;
    win.injector.destroy();
    try {
      localStorage.removeItem(draftKey(id));
    } catch {
      // see the draft
    }
    this.saved.forget(id);
    this.files.forget(id);
    this.registry.setOrigin(id, null, null);
    this.windows.update((list) => list.filter((w) => w.id !== id));
    this.order.update((list) => list.filter((o) => o !== id));
    if (this.activeId() === id) this.activeId.set(this.topmost());
  }

  /** Brings a window in front and makes it the active one (restoring it if it was minimized). */
  focus(id: string): void {
    const win = this.find(id);
    if (!win || (this.activeId() === id && !win.minimized() && this.order().at(-1) === id)) return;
    win.minimized.set(false);
    this.order.update((list) => [...list.filter((o) => o !== id), id]);
    this.activeId.set(id);
  }

  /** Minimizes a window to the bar of the workspace: it goes to the bottom of the stack, the next one becomes active. */
  minimize(id: string): void {
    const win = this.find(id);
    if (!win) return;
    win.minimized.set(true);
    this.order.update((list) => [id, ...list.filter((o) => o !== id)]);
    if (this.activeId() === id) this.activeId.set(this.topmost());
  }

  toggleMaximize(id: string): void {
    const win = this.find(id);
    if (!win) return;
    win.maximized.update((m) => !m);
    this.focus(id);
  }

  /** New position and size of a window (kept inside the area). */
  place(id: string, bounds: Bounds): void {
    this.find(id)?.bounds.set(clampBounds(bounds, this.area()));
  }

  /** The area changed size: the windows are brought back inside it. */
  resizeArea(area: Area): void {
    this.area.set(area);
    for (const win of this.windows()) win.bounds.set(clampBounds(win.bounds(), area));
  }

  /**
   * Activates the next window in the stack, as Ctrl+F6 in the MDI applications: the one in front goes to the bottom. With -1
   * the one at the bottom comes in front.
   */
  cycle(delta: 1 | -1): void {
    const order = this.order();
    if (order.length < 2) return;
    const next = delta === 1 ? [order.at(-1)!, ...order.slice(0, -1)] : [...order.slice(1), order[0]];
    this.order.set(next);
    this.focus(next.at(-1)!);
  }

  /** Windows side by side filling the area (the minimized ones stay minimized). */
  tile(): void {
    const visible = this.windows().filter((w) => !w.minimized());
    tileBounds(visible.length, this.area()).forEach((bounds, i) => {
      visible[i].maximized.set(false);
      visible[i].bounds.set(bounds);
    });
  }

  /** Windows in a cascade, in the stacking order. */
  cascade(): void {
    const visible = this.order()
      .map((id) => this.find(id))
      .filter((w): w is DocumentWindow => !!w && !w.minimized());
    visible.forEach((win, i) => {
      win.maximized.set(false);
      win.bounds.set(cascadeBounds(i, this.area()));
    });
  }

  /** Position in the stack (for the z-index): 1 at the bottom. */
  layer(id: string): number {
    return this.order().indexOf(id) + 1;
  }

  /** The window of that kind used last (the one highest in the stack), or null. */
  lastOf(kind: EditorKind): DocumentWindow | null {
    const order = this.order();
    for (let i = order.length - 1; i >= 0; i--) {
      const win = this.find(order[i]);
      if (win?.kind === kind) return win;
    }
    return null;
  }

  /** The store of the document of that kind used last: the previews of the others use it (the theme, the screen, the menu). */
  latest<T extends DocumentState>(kind: EditorKind, store: Type<T>): T | null {
    return this.lastOf(kind)?.injector.get(store) ?? null;
  }

  /** Name of the document of a window: its identifier in the JSON (screen, data sources, navigation, theme, project), if valid. */
  name(win: DocumentWindow): string | null {
    const doc = win.state.doc();
    const id = isObject(doc) ? doc[win.kind === 'project' ? 'name' : win.kind] : null;
    return typeof id === 'string' && (win.kind === 'project' ? id.trim() !== '' : RESOURCE_ID.test(id)) ? id : null;
  }

  private find(id: string): DocumentWindow | undefined {
    return this.windows().find((w) => w.id === id);
  }

  /** The window highest in the stack that is not minimized. */
  private topmost(): string | null {
    const order = this.order();
    for (let i = order.length - 1; i >= 0; i--) if (!this.find(order[i])?.minimized()) return order[i];
    return null;
  }

  /** Closes every window without forgetting their drafts (they stay for the next time the project is opened). */
  private closeAll(): void {
    for (const win of this.windows()) win.injector.destroy();
    this.windows.set([]);
    this.order.set([]);
    this.activeId.set(null);
  }

  private create(id: string, kind: EditorKind, path: string | null, bounds: Bounds, maximized: boolean, minimized: boolean): DocumentWindow {
    const injector = createEnvironmentInjector(documentProviders(kind, id), this.parent, `document ${id}`);
    return {
      id,
      kind,
      injector,
      state: injector.get(DocumentState),
      path: signal(path),
      bounds: signal(clampBounds(bounds, this.area())),
      maximized: signal(maximized),
      minimized: signal(minimized),
    };
  }

  /** The windows remembered under the key, with their drafts. */
  private restore(key: string): void {
    let saved: SavedWorkspace | null;
    try {
      saved = JSON.parse(localStorage.getItem(key) ?? 'null') as SavedWorkspace | null;
    } catch {
      return;
    }
    if (!saved) saved = this.legacy();
    if (!Array.isArray(saved.windows)) return;
    const windows = saved.windows
      .filter((w) => typeof w?.id === 'string' && WINDOW_ID.test(w.id) && KINDS.includes(w.kind) && isBounds(w.bounds))
      .map((w) => this.create(w.id, w.kind, typeof w.path === 'string' ? w.path : null, w.bounds, w.maximized === true, w.minimized === true));
    for (const win of windows) this.saved.ensureBaseline(win.id, win.state.doc());
    const ids = new Set(windows.map((w) => w.id));
    const order = Array.isArray(saved.order) ? saved.order.filter((id) => ids.has(id)) : [];
    this.windows.set(windows);
    this.order.set([...order, ...windows.map((w) => w.id).filter((id) => !order.includes(id))]);
    const active = typeof saved.active === 'string' && ids.has(saved.active) && !windows.find((w) => w.id === saved.active)?.minimized() ? saved.active : this.topmost();
    this.activeId.set(active);
  }

  /**
   * What earlier versions of the editor left in the browser, taken over by the first project opened so that no work is
   * lost: the windows of the workspace without projects, or the drafts of the single documents (one per kind). They open
   * as documents not saved in the project yet.
   */
  private legacy(): SavedWorkspace {
    const empty: SavedWorkspace = { windows: [], order: [], active: null };
    try {
      const global = localStorage.getItem(WORKSPACE_KEY);
      if (global !== null) {
        localStorage.removeItem(WORKSPACE_KEY);
        const parsed = JSON.parse(global) as SavedWorkspace | null;
        return parsed && Array.isArray(parsed.windows) ? parsed : empty;
      }
      const windows: SavedWorkspace['windows'] = [];
      for (const [key, kind] of LEGACY_DRAFTS) {
        const draft = localStorage.getItem(key);
        if (draft === null) continue;
        const id = this.newId();
        localStorage.setItem(draftKey(id), draft);
        localStorage.removeItem(key);
        windows.push({ id, kind, bounds: cascadeBounds(windows.length, this.area()), maximized: false, minimized: false });
      }
      localStorage.removeItem('lc.editor.mode');
      return { windows, order: windows.map((w) => w.id), active: windows.at(-1)?.id ?? null };
    } catch {
      return empty;
    }
  }
}
