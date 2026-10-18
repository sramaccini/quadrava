import { EnvironmentInjector, Injectable, computed, createEnvironmentInjector, effect, inject, signal, type Provider, type Type, type WritableSignal } from '@angular/core';
import { isObject, type Json } from './doc-ops';
import { DOCUMENT_ID, DocumentState, draftKey } from './document-state';
import { EditorStore } from './editor-store';
import { FileAccess } from './file-access';
import { NavigationStore } from './navigation-store';
import { documentRef } from './registry-client';
import { RegistrySession } from './registry-session';
import { SavedDocuments, type EditorKind } from './saved-documents';
import { ThemeStore } from './theme-store';
import { cascadeBounds, clampBounds, isBounds, tileBounds, type Area, type Bounds } from './window-layout';

export const WORKSPACE_KEY = 'lc.editor.workspace';
const KINDS: EditorKind[] = ['screen', 'navigation', 'theme'];
const STORES: Record<EditorKind, Type<DocumentState>> = { screen: EditorStore, navigation: NavigationStore, theme: ThemeStore };

/**
 * The providers of a document of the given kind: its identifier and its store, also as `DocumentState` (the fields generated
 * from the schema and the JSON view work on it, whatever the kind).
 */
export function documentProviders(kind: EditorKind, id: string): Provider[] {
  const store = STORES[kind];
  return [{ provide: DOCUMENT_ID, useValue: id }, store, { provide: DocumentState, useExisting: store }];
}

/** Kind of a document read from a file: from its identifier property (`screen`, `navigation`, `theme`); null if none. */
export function documentKind(doc: Json): EditorKind | null {
  if (!isObject(doc)) return null;
  return KINDS.find((kind) => typeof doc[kind] === 'string') ?? null;
}

/** Drafts of the editor before the workspace (one document per kind), opened in windows at the first start. */
const LEGACY_DRAFTS: [string, EditorKind][] = [
  ['lc.editor.draft', 'screen'],
  ['lc.editor.navigation', 'navigation'],
  ['lc.editor.theme', 'theme'],
];

/**
 * A document open in the workspace, in its own window. The injector holds the store of the document: the editor of the
 * window and the side panels (when the window is the active one) are created with it.
 */
export interface DocumentWindow {
  readonly id: string;
  readonly kind: EditorKind;
  readonly injector: EnvironmentInjector;
  readonly state: DocumentState;
  readonly bounds: WritableSignal<Bounds>;
  readonly maximized: WritableSignal<boolean>;
  readonly minimized: WritableSignal<boolean>;
}

/** What is remembered in the browser: the windows (their documents are in the drafts), the stacking order, the active one. */
interface SavedWorkspace {
  windows: { id: string; kind: EditorKind; bounds: Bounds; maximized: boolean; minimized: boolean }[];
  order: string[];
  active: string | null;
}

/**
 * The open documents, as the windows of an IDE: several at once, of any kind, each with its own store, history and
 * draft. One is active (the one in front): the menus, the toolbar, the shortcuts, the problems and the side panels work on it.
 * The windows keep their opening order (`windows`, so that the preview iframes are never moved in the page and
 * do not reload); the stacking order is `order`, the last one on top. Everything is remembered in the browser and restored
 * at the next visit.
 */
@Injectable({ providedIn: 'root' })
export class Workspace {
  private readonly parent = inject(EnvironmentInjector);
  private readonly saved = inject(SavedDocuments);
  private readonly files = inject(FileAccess);
  private readonly registry = inject(RegistrySession);

  readonly windows = signal<DocumentWindow[]>([]);
  readonly order = signal<string[]>([]);
  private readonly activeId = signal<string | null>(null);
  /** Size of the area of the windows (measured by the workspace in the page; zero until then). */
  readonly area = signal<Area>({ width: 0, height: 0 });
  readonly active = computed(() => this.windows().find((w) => w.id === this.activeId()) ?? null);
  private next = 1;

  constructor() {
    this.restore();
    effect(() => {
      const state: SavedWorkspace = {
        windows: this.windows().map((w) => ({ id: w.id, kind: w.kind, bounds: w.bounds(), maximized: w.maximized(), minimized: w.minimized() })),
        order: this.order(),
        active: this.activeId(),
      };
      try {
        localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state));
      } catch {
        // Storage not available: the workspace holds for the visit.
      }
    });
  }

  /** A new identifier for a document (to know it before the document is there, for example while choosing its file). */
  newId(): string {
    return `d${this.next++}`;
  }

  /**
   * Opens a document in a new window in front of the others: with `doc` that content (file, example, registry version),
   * otherwise a new document of the kind. It has no changes to save.
   */
  open(kind: EditorKind, doc?: Json, id = this.newId()): DocumentWindow {
    const front = this.active();
    const win = this.create(id, kind, cascadeBounds(this.windows().length, this.area()), front?.maximized() ?? false, false);
    if (doc !== undefined) win.state.load(doc);
    this.saved.markSaved(id, win.state.doc());
    this.windows.update((list) => [...list, win]);
    this.focus(id);
    return win;
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

  /** Name of the document of a window: its identifier in the JSON (screen, navigation, theme), if valid. */
  name(win: DocumentWindow): string | null {
    return documentRef(win.kind, win.state.doc())?.id ?? null;
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

  private create(id: string, kind: EditorKind, bounds: Bounds, maximized: boolean, minimized: boolean): DocumentWindow {
    const injector = createEnvironmentInjector(documentProviders(kind, id), this.parent, `document ${id}`);
    return {
      id,
      kind,
      injector,
      state: injector.get(DocumentState),
      bounds: signal(clampBounds(bounds, this.area())),
      maximized: signal(maximized),
      minimized: signal(minimized),
    };
  }

  /** The windows of the last visit, with their drafts. */
  private restore(): void {
    let saved: SavedWorkspace;
    try {
      saved = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? 'null') as SavedWorkspace;
    } catch {
      return;
    }
    if (!saved) saved = this.legacy();
    if (!Array.isArray(saved.windows)) return;
    const windows = saved.windows
      .filter((w) => typeof w?.id === 'string' && /^d\d+$/.test(w.id) && KINDS.includes(w.kind) && isBounds(w.bounds))
      .map((w) => this.create(w.id, w.kind, w.bounds, w.maximized === true, w.minimized === true));
    this.next = Math.max(0, ...windows.map((w) => Number(w.id.slice(1)))) + 1;
    for (const win of windows) this.saved.ensureBaseline(win.id, win.state.doc());
    const ids = new Set(windows.map((w) => w.id));
    const order = Array.isArray(saved.order) ? saved.order.filter((id) => ids.has(id)) : [];
    this.windows.set(windows);
    this.order.set([...order, ...windows.map((w) => w.id).filter((id) => !order.includes(id))]);
    const active = typeof saved.active === 'string' && ids.has(saved.active) && !windows.find((w) => w.id === saved.active)?.minimized() ? saved.active : this.topmost();
    this.activeId.set(active);
  }

  /**
   * The drafts of the editor before the workspace (one per kind) become windows, so that no work is lost: they move under the
   * key of their document. Nothing to move: an empty workspace.
   */
  private legacy(): SavedWorkspace {
    const windows: SavedWorkspace['windows'] = [];
    try {
      for (const [key, kind] of LEGACY_DRAFTS) {
        const draft = localStorage.getItem(key);
        if (draft === null) continue;
        const id = this.newId();
        localStorage.setItem(draftKey(id), draft);
        localStorage.removeItem(key);
        windows.push({ id, kind, bounds: cascadeBounds(windows.length, this.area()), maximized: false, minimized: false });
      }
      localStorage.removeItem('lc.editor.mode');
    } catch {
      // Storage not available: nothing to move.
    }
    return { windows, order: windows.map((w) => w.id), active: windows.at(-1)?.id ?? null };
  }
}
