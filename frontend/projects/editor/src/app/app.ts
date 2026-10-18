import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Confirmation, I18n, Notifier, ThemeService, loadMessages } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { QuadravaWordmarkComponent } from 'components';
import { validateTheme } from 'schema';
import { isObject, type Json } from './model/doc-ops';
import { EditorStore } from './model/editor-store';
import { FileAccess } from './model/file-access';
import { NavigationStore } from './model/navigation-store';
import { documentRef } from './model/registry-client';
import { RegistrySession, type RegistryRef } from './model/registry-session';
import { SavedDocuments, type EditorKind } from './model/saved-documents';
import { KnownScreens } from './model/shared-state';
import { Workspace, documentKind, type DocumentWindow } from './model/workspace';
import { Dock, type DockPanel } from './ui/dock';
import { DockPanelDirective } from './ui/dock-panel.directive';
import { DockSideComponent, type DockTab } from './ui/dock-side.component';
import { InspectorComponent } from './ui/inspector.component';
import { IssuesComponent } from './ui/issues.component';
import { MenuBarComponent, type Menu, type MenuItem } from './ui/menu-bar.component';
import { NavInspectorComponent } from './ui/nav-inspector.component';
import { NavOutlineComponent } from './ui/nav-outline.component';
import { NewScreenComponent, type NewScreen } from './ui/new-screen.component';
import { OutlineComponent } from './ui/outline.component';
import { PaletteComponent } from './ui/palette.component';
import { RegistryOpenComponent, type RegistryDocument } from './ui/registry-open.component';
import { RegistryPanelComponent } from './ui/registry-panel.component';
import { RegistryTargetComponent } from './ui/registry-target.component';
import { SCREEN_VIEWS } from './ui/screen-editor.component';
import { ThemeInspectorComponent } from './ui/theme-inspector.component';
import { WorkspaceComponent, windowTitle, type WorkspaceCommand } from './ui/workspace.component';

const LANGUAGES = ['en', 'it'];
const KINDS: EditorKind[] = ['screen', 'navigation', 'theme'];
/** Side panels of every kind of document (the «… pinned» items of the View menu). */
const KIND_PANELS: Record<EditorKind, DockPanel[]> = { screen: ['palette', 'outline', 'inspector'], navigation: ['outline', 'inspector'], theme: ['inspector'] };
const PANEL_TABS: Record<DockPanel, { label: string; icon: string }> = {
  palette: { label: 'ed.palette', icon: 'appstore' },
  outline: { label: 'ed.outline', icon: 'apartment' },
  inspector: { label: 'ed.inspector', icon: 'control' },
};
const LEFT: DockPanel[] = ['palette', 'outline'];
const VIEW_LABELS: Record<(typeof SCREEN_VIEWS)[number], string> = { preview: 'ed.tabs.preview', json: 'ed.tabs.json', sources: 'ed.tabs.sources', texts: 'ed.tabs.texts' };

/** Shortcuts of the help: group → [keys, description]. Keys with names to translate are message keys (`ed.`). */
const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  {
    group: 'ed.keys.general',
    keys: [['Ctrl+S', 'ed.keys.save'], ['Ctrl+O', 'ed.keys.open'], ['Ctrl+Z', 'ed.keys.undo'], ['ed.keys.k.redo', 'ed.keys.redo'], ['F1', 'ed.keys.help']],
  },
  {
    group: 'ed.keys.windows',
    keys: [['Ctrl+F6', 'ed.keys.nextWindow'], ['Ctrl+Shift+F6', 'ed.keys.previousWindow'], ['ed.keys.k.windowMove', 'ed.keys.windowMove'], ['ed.keys.k.windowSize', 'ed.keys.windowSize'], ['ed.keys.k.enter', 'ed.keys.windowMaximize']],
  },
  {
    group: 'ed.keys.outline',
    keys: [
      ['ed.keys.del', 'ed.keys.delete'],
      ['Ctrl+D', 'ed.keys.duplicate'],
      ['Ctrl+C · Ctrl+X · Ctrl+V', 'ed.keys.clipboard'],
      ['Alt+↑ · Alt+↓', 'ed.keys.move'],
      ['→ · ←', 'ed.keys.branch'],
      ['ed.keys.k.context', 'ed.keys.context'],
      ['ed.keys.k.multi', 'ed.keys.multi'],
    ],
  },
  { group: 'ed.keys.menus', keys: [['Tab', 'ed.keys.menuReach'], ['ed.keys.k.menuMove', 'ed.keys.menuMove'], ['Esc', 'ed.keys.menuClose']] },
  {
    group: 'ed.keys.panels',
    keys: [
      ['ed.keys.k.pick', 'ed.keys.pick'],
      ['ed.keys.k.enter', 'ed.keys.paletteFirst'],
      ['Esc', 'ed.keys.clearSearch'],
      ['Esc', 'ed.keys.closeSide'],
      ['ed.keys.k.ctrlEnter', 'ed.keys.applyJson'],
      ['ed.keys.k.complete', 'ed.keys.complete'],
    ],
  },
];

/**
 * Quadrava Studio, the visual editor: a workspace of document windows (screens, navigations, themes) as in an IDE, with the
 * menus and the toolbar on top, the side panels (palette and outline on the left, properties on the right) showing the
 * document of the active window, and its problems at the bottom. The documents produced are the same JSON the runtime reads.
 */
@Component({
  selector: 'lc-root',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    DockPanelDirective,
    DockSideComponent,
    InspectorComponent,
    IssuesComponent,
    QuadravaWordmarkComponent,
    MenuBarComponent,
    NavInspectorComponent,
    NavOutlineComponent,
    NewScreenComponent,
    OutlineComponent,
    PaletteComponent,
    RegistryOpenComponent,
    RegistryPanelComponent,
    RegistryTargetComponent,
    ThemeInspectorComponent,
    WorkspaceComponent,
    NzButtonModule,
    NzDrawerModule,
    NzIconModule,
    NzModalModule,
    NzSelectModule,
    NzTagModule,
    NzTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class App {
  protected readonly workspace = inject(Workspace);
  protected readonly i18n = inject(I18n);
  private readonly confirmation = inject(Confirmation);
  private readonly notifier = inject(Notifier);
  private readonly themes = inject(ThemeService);
  private readonly files = inject(FileAccess);
  private readonly saved = inject(SavedDocuments);
  protected readonly registry = inject(RegistrySession);
  protected readonly dock = inject(Dock);
  protected readonly languages = LANGUAGES;

  /** The window in front: menus, toolbar, shortcuts, problems and side panels work on its document. */
  protected readonly active = this.workspace.active;
  /** The document of the active window has changes not saved (to a file or in the registry). */
  protected readonly unsaved = computed(() => {
    const win = this.active();
    return !!win && !this.saved.isSaved(win.id, win.state.doc());
  });
  protected readonly warningCount = computed(() => {
    const state = this.active()?.state;
    return state ? state.issues().length - state.errorCount() : 0;
  });

  /** Side panels of the active document, by side. */
  protected readonly leftTabs = computed(() => this.tabs((p) => LEFT.includes(p)));
  protected readonly rightTabs = computed(() => this.tabs((p) => !LEFT.includes(p)));
  /**
   * Width of the side columns. They are always there, also without an active document or for one without panels on a side (a
   * theme on the left): the area of the windows does not change size when a document opens or the active window changes.
   */
  protected readonly leftColumn = computed(() => {
    const tabs = this.leftTabs().map((t) => t.id);
    return this.dock.columnWidth('left', tabs.length ? tabs : LEFT, 280);
  });
  protected readonly rightColumn = computed(() => this.dock.columnWidth('right', ['inspector'], 320));

  protected readonly showRegistry = signal(false);
  protected readonly showIssues = signal(true);
  /** Help dialogs: keyboard shortcuts and information. */
  protected readonly showShortcuts = signal(false);
  protected readonly showAbout = signal(false);
  protected readonly showNewScreen = signal(false);
  /** «Open from registry…»: the dialog for documents of this kind (null = closed). */
  protected readonly registryKind = signal<EditorKind | null>(null);
  /** Dialog asking for the application before «Save to registry». */
  protected readonly showRegistryTarget = signal(false);
  /** Shortcuts shown in the help, by group (texts in the `ed.keys.*` messages). */
  protected readonly shortcutGroups = SHORTCUTS;

  /** Menu bar: File, Edit, View, Window, Help. The commands of the document work on the active window. */
  protected readonly menus = computed<Menu[]>(() => {
    const t = (key: string) => this.i18n.t(key);
    const win = this.active();
    const state = win?.state;
    // The registry items are off when the registry is not there (as in the demo editor), with the reason in the tooltip.
    const noRegistry = !this.registry.usable();
    const registryHint = this.registry.status() === 'checking' ? t('ed.menu.registryChecking') : noRegistry ? t('ed.menu.registryUnavailable') : undefined;
    const file: MenuItem[] = [
      { id: 'new', label: t('ed.menu.new'), children: KINDS.map((kind) => ({ id: 'new-' + kind, label: t('ed.new.' + kind), run: () => this.newDocument(kind) })) },
      { id: 'open', label: t('ed.menu.open'), shortcut: 'Ctrl+O', run: () => void this.openFile() },
      {
        id: 'open-registry',
        label: t('ed.menu.openRegistry'),
        disabled: noRegistry,
        hint: registryHint,
        children: KINDS.map((kind) => ({ id: 'open-registry-' + kind, label: t('ed.openRegistry.' + kind), run: () => void this.openFromRegistry(kind) })),
      },
      {
        id: 'open-example',
        label: t('ed.openExample'),
        emptyLabel: t('ed.menu.noExamples'),
        children: this.exampleNames().map((name) => ({ id: 'example:' + name, label: name, run: () => void this.openExample(name) })),
      },
      { id: 'save', label: t('ed.menu.save'), shortcut: 'Ctrl+S', separator: true, disabled: !win, run: () => void this.saveFile() },
      { id: 'save-registry', label: t('ed.menu.saveRegistry'), disabled: noRegistry || !win, hint: registryHint, run: () => void this.saveToRegistry() },
      { id: 'registry', label: t('ed.menu.registry'), separator: true, disabled: !win, run: () => this.showRegistry.set(true) },
      { id: 'close', label: t('ed.menu.close'), separator: true, disabled: !win, run: () => win && void this.closeWindow(win) },
      { id: 'close-all', label: t('ed.menu.closeAll'), disabled: !this.workspace.windows().length, run: () => void this.closeAll() },
    ];
    const edit: MenuItem[] = [
      { id: 'undo', label: t('ed.menu.undo'), shortcut: 'Ctrl+Z', disabled: !state?.canUndo(), run: () => state?.undo() },
      { id: 'redo', label: t('ed.menu.redo'), shortcut: 'Ctrl+Y', disabled: !state?.canRedo(), run: () => state?.redo() },
    ];
    if (win && win.kind !== 'theme') {
      const screen = win.kind === 'screen' ? win.injector.get(EditorStore) : null;
      const doc = screen ?? win.injector.get(NavigationStore);
      const selection = doc.selection();
      const none = !selection.length;
      if (screen) {
        edit.push(
          { id: 'cut', label: t('ed.menu.cut'), shortcut: 'Ctrl+X', separator: true, disabled: none, run: () => screen.cut(selection) },
          { id: 'copy', label: t('ed.menu.copy'), shortcut: 'Ctrl+C', disabled: none, run: () => screen.copy(selection) },
          { id: 'paste', label: t('ed.menu.paste'), shortcut: 'Ctrl+V', disabled: !screen.clipboard(), run: () => screen.paste() },
        );
      }
      edit.push(
        { id: 'duplicate', label: t('ed.menu.duplicate'), shortcut: 'Ctrl+D', separator: !screen, disabled: none, run: () => doc.duplicate(selection) },
        {
          id: 'delete',
          label: t('ed.menu.delete'),
          shortcut: t('ed.key.delete'),
          disabled: none,
          run: () => (screen && screen.multi().length > 1 ? screen.removeMany(screen.multi()) : doc.remove(selection)),
        },
        { id: 'move-up', label: t('ed.menu.moveUp'), shortcut: 'Alt+↑', separator: true, disabled: none, run: () => doc.move(selection, -1) },
        { id: 'move-down', label: t('ed.menu.moveDown'), shortcut: 'Alt+↓', disabled: none, run: () => doc.move(selection, 1) },
      );
    }
    // View: the panels of the active document (pinned or hidden), the problems and, in a screen, the central view.
    const view: MenuItem[] = [
      ...((win ? KIND_PANELS[win.kind] : []).map((panel) => ({
        id: 'pin-' + panel,
        label: this.i18n.t('ed.menu.pinPanel', { name: t(PANEL_TABS[panel].label) }),
        toggle: 'check' as const,
        checked: this.dock.pinned[panel](),
        run: () => this.dock.togglePin(panel),
      })) satisfies MenuItem[]),
      { id: 'issues', label: t('ed.menu.issues'), toggle: 'check', checked: this.showIssues(), run: () => this.showIssues.update((v) => !v) },
    ];
    if (win?.kind === 'screen') {
      const screen = win.injector.get(EditorStore);
      const current = screen.view();
      SCREEN_VIEWS.forEach((v, i) =>
        view.push({ id: 'view-' + v, label: t(VIEW_LABELS[v]), toggle: 'radio', checked: current === v, separator: i === 0, run: () => screen.view.set(v) }),
      );
    }
    // Window: arrangement of the windows, the commands of the active one and the list of the open ones.
    const windows = this.workspace.windows();
    const window: MenuItem[] = [
      { id: 'cascade', label: t('ed.menu.cascade'), disabled: !windows.length, run: () => this.workspace.cascade() },
      { id: 'tile', label: t('ed.menu.tile'), disabled: !windows.length, run: () => this.workspace.tile() },
      { id: 'minimize', label: t('ed.window.minimize'), separator: true, disabled: !win, run: () => win && this.workspace.minimize(win.id) },
      { id: 'maximize', label: t('ed.window.maximize'), toggle: 'check', checked: !!win?.maximized(), disabled: !win, run: () => win && this.workspace.toggleMaximize(win.id) },
      { id: 'next-window', label: t('ed.menu.nextWindow'), shortcut: 'Ctrl+F6', separator: true, disabled: windows.length < 2, run: () => this.workspace.cycle(1) },
      { id: 'previous-window', label: t('ed.menu.previousWindow'), shortcut: 'Ctrl+Shift+F6', disabled: windows.length < 2, run: () => this.workspace.cycle(-1) },
      ...windows.map((w, i) => ({
        id: 'window-' + w.id,
        label: windowTitle(this.i18n, this.workspace, w),
        toggle: 'radio' as const,
        checked: w === win,
        separator: i === 0,
        run: () => this.workspace.focus(w.id),
      })),
    ];
    return [
      { id: 'file', label: t('ed.menu.file'), items: file },
      { id: 'edit', label: t('ed.menu.edit'), items: edit },
      { id: 'view', label: t('ed.menu.view'), items: view },
      { id: 'window', label: t('ed.menu.window'), items: window },
      {
        id: 'help',
        label: t('ed.menu.help'),
        items: [
          { id: 'shortcuts', label: t('ed.menu.shortcuts'), shortcut: 'F1', run: () => this.showShortcuts.set(true) },
          { id: 'about', label: t('ed.menu.about'), separator: true, run: () => this.showAbout.set(true) },
        ],
      },
    ];
  });

  /** Sample screens (`examples/index.json`, written by tools/copy-examples.mjs). */
  protected readonly examples = resource({
    loader: async (): Promise<string[]> => {
      const response = await fetch('examples/index.json');
      return response.ok ? ((await response.json()) as string[]) : [];
    },
  });

  /** Themes of the demo (`examples/themes/index.json`, written by tools/copy-examples.mjs). */
  protected readonly themeNames = resource({
    loader: async (): Promise<string[]> => {
      const response = await fetch('examples/themes/index.json');
      return response.ok ? ((await response.json()) as string[]) : [];
    },
  });

  /** Examples that can be opened: the screens, the navigation and the themes of the demo. */
  protected readonly exampleNames = computed(() => [
    ...(this.examples.value() ?? []),
    'navigation',
    ...(this.themeNames.value() ?? []).map((name) => `themes/${name}`),
  ]);

  constructor() {
    // Translations and theme of the examples, so the preview looks as in the runtime.
    void loadMessages(this.i18n, LANGUAGES, (l) => `examples/i18n/${l}.json`).then((problems) => problems.forEach((p) => console.warn('[i18n]', p)));
    void fetch('examples/themes/light.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: unknown) => {
        const result = doc ? validateTheme(doc) : null;
        if (result?.valid) this.themes.apply(result.value);
      })
      .catch(() => undefined);
    // Known screens (suggestions and «unknown screen» warnings): the examples, those of the application in the registry and
    // those open in the workspace.
    const known = inject(KnownScreens);
    effect(() => {
      const examples = this.examples.hasValue() ? this.examples.value() : [];
      const open = this.workspace
        .windows()
        .filter((w) => w.kind === 'screen')
        .map((w) => this.workspace.name(w))
        .filter((name): name is string => !!name);
      known.names.set([...new Set([...examples, ...this.registry.screens(), ...open])]);
    });
    effect(() => (document.documentElement.lang = this.i18n.locale()));
  }

  /** The panels of the active document on one side, as tabs of the side. */
  private tabs(side: (panel: DockPanel) => boolean): DockTab[] {
    const win = this.active();
    return (win ? KIND_PANELS[win.kind] : []).filter(side).map((id) => ({ id, label: this.i18n.t(PANEL_TABS[id].label), icon: PANEL_TABS[id].icon }));
  }

  /** «New ▸»: a screen asks for title and identifier first; navigation and theme open at once. */
  protected newDocument(kind: EditorKind): void {
    if (kind === 'screen') this.showNewScreen.set(true);
    else this.workspace.open(kind);
  }

  protected createScreen(screen: NewScreen): void {
    this.showNewScreen.set(false);
    const win = this.workspace.open('screen');
    win.injector.get(EditorStore).newScreen(screen.title, screen.screen);
    this.saved.markSaved(win.id, win.state.doc());
  }

  protected command(command: WorkspaceCommand): void {
    if (command.kind === 'new') this.newDocument(command.document);
    else void this.openFile();
  }

  protected async openExample(name: string): Promise<void> {
    try {
      const response = await fetch(`examples/${name.split('/').map(encodeURIComponent).join('/')}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const doc = (await response.json()) as Json;
      const kind = documentKind(doc);
      if (!kind) throw new Error(this.i18n.t('ed.unknownKind'));
      this.workspace.open(kind, doc);
      this.notifier.toast(this.i18n.t('ed.opened', { name }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /**
   * «Open…»: a JSON file from the computer, in a new window of the kind of the document; where possible, the next «Save» rewrites
   * that file.
   */
  protected async openFile(): Promise<void> {
    const id = this.workspace.newId();
    try {
      const file = await this.files.open(id);
      if (!file) return;
      const kind = documentKind(file.doc);
      if (!kind) {
        this.files.forget(id);
        throw new Error(this.i18n.t('ed.unknownKind'));
      }
      this.workspace.open(kind, file.doc, id);
      this.notifier.toast(this.i18n.t('ed.opened', { name: file.name }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /** «Save»: the document of the active window as JSON, in the file opened or already chosen, otherwise in a new one (or downloaded). */
  protected async saveFile(): Promise<void> {
    const win = this.active();
    if (!win) return;
    const doc = win.state.doc();
    const name = isObject(doc) && typeof doc[win.kind] === 'string' && doc[win.kind] ? doc[win.kind] : win.kind;
    try {
      const file = await this.files.save(win.id, doc, `${name}.json`);
      if (!file) return;
      this.saved.markSaved(win.id, doc);
      const errors = win.state.errorCount();
      this.notifier.toast(errors ? this.i18n.t('ed.savedWithErrors', { name: file, n: errors }) : this.i18n.t('ed.savedFile', { name: file }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.saveFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /** «Open from registry ▸»: the dialog with application, document and version (or the sign-in, if the registry asks for it). */
  protected async openFromRegistry(kind: EditorKind): Promise<void> {
    if ((await this.registry.check()) === 'login') return this.registry.login();
    if (this.registry.status() === 'available') this.registryKind.set(kind);
  }

  protected openedFromRegistry(opened: RegistryDocument): void {
    this.registryKind.set(null);
    const win = this.workspace.open(opened.ref.kind as EditorKind, opened.doc);
    this.registry.setOrigin(win.id, opened.ref as RegistryRef, opened.hash);
    this.notifier.toast(this.i18n.t('ed.opened', { name: `${opened.ref.id} @ ${opened.hash.slice(0, 10)}` }));
  }

  /** «Save to registry»: a new version of the active document in the chosen application (asked first, if missing). */
  protected async saveToRegistry(): Promise<void> {
    if ((await this.registry.check()) === 'login') return this.registry.login();
    const win = this.active();
    if (this.registry.status() !== 'available' || !win) return;
    if (!documentRef(win.kind, win.state.doc())) return this.notifier.toast(this.i18n.t('ed.registry.noId'), 'error');
    if (win.state.errorCount()) return this.notifier.toast(this.i18n.t('ed.registry.hasErrors'), 'error');
    if (!this.registry.appId()) return this.showRegistryTarget.set(true);
    const doc = win.state.doc();
    if (await this.registry.save(win.id, win.kind, doc)) this.saved.markSaved(win.id, doc);
    // The validation problems of the registry are read, point by point, in the Registry panel.
    else if (this.registry.issues().length) this.showRegistry.set(true);
  }

  protected async chooseRegistryApp(appId: string): Promise<void> {
    this.showRegistryTarget.set(false);
    this.registry.appId.set(appId);
    await this.saveToRegistry();
  }

  /** Closes a window, asking for confirmation if its document has unsaved changes. */
  protected async closeWindow(win: DocumentWindow): Promise<boolean> {
    if (!this.saved.isSaved(win.id, win.state.doc())) {
      this.workspace.focus(win.id);
      if (!(await this.confirmation.confirm(this.i18n.t('ed.confirmClose', { name: windowTitle(this.i18n, this.workspace, win) })))) return false;
    }
    this.workspace.close(win.id);
    return true;
  }

  /** Closes all the windows, one by one (stopping at the first one the user keeps). */
  private async closeAll(): Promise<void> {
    for (const win of [...this.workspace.windows()]) if (!(await this.closeWindow(win))) return;
  }

  /** Shortcuts: undo and redo always; the others only outside text fields (where those of the field apply). */
  protected onKey(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (key === 'f1') return this.handled(event, () => this.showShortcuts.set(true));
    if (ctrl && key === 'f6') return this.handled(event, () => this.workspace.cycle(event.shiftKey ? -1 : 1));
    const dialog = !!document.querySelector('.cdk-overlay-container .ant-modal-wrap');
    // Save and Open apply inside fields too (as in desktop applications), not with a dialog open.
    if (ctrl && (key === 's' || key === 'o') && !event.shiftKey && !event.altKey) {
      if (dialog) return;
      return this.handled(event, () => void (key === 's' ? this.saveFile() : this.openFile()));
    }
    const win = this.active();
    if (!win) return;
    if (ctrl && key === 'z' && !event.shiftKey) return this.handled(event, () => win.state.undo());
    if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) return this.handled(event, () => win.state.redo());
    if (isEditable(event.target) || dialog) return;
    if (win.kind === 'navigation') return this.navigationKey(event, win.injector.get(NavigationStore), ctrl, key);
    if (win.kind === 'theme') return;
    const store = win.injector.get(EditorStore);
    const selection = store.selection();
    if (!selection.length) {
      if (ctrl && key === 'v') this.handled(event, () => store.paste());
      return;
    }
    if (key === 'delete') this.handled(event, () => (store.multi().length > 1 ? store.removeMany(store.multi()) : store.remove(selection)));
    else if (ctrl && key === 'd') this.handled(event, () => store.duplicate(selection));
    else if (ctrl && key === 'c') this.handled(event, () => store.copy(selection));
    else if (ctrl && key === 'x') this.handled(event, () => store.cut(selection));
    else if (ctrl && key === 'v') this.handled(event, () => store.paste());
    else if (event.altKey && key === 'arrowup') this.handled(event, () => store.move(selection, -1));
    else if (event.altKey && key === 'arrowdown') this.handled(event, () => store.move(selection, 1));
  }

  /** In the navigation: delete, duplicate, move (copy and paste apply only to the nodes of screens). */
  private navigationKey(event: KeyboardEvent, nav: NavigationStore, ctrl: boolean, key: string): void {
    const selection = nav.selection();
    if (!selection.length) return;
    if (key === 'delete') this.handled(event, () => nav.remove(selection));
    else if (ctrl && key === 'd') this.handled(event, () => nav.duplicate(selection));
    else if (event.altKey && key === 'arrowup') this.handled(event, () => nav.move(selection, -1));
    else if (event.altKey && key === 'arrowdown') this.handled(event, () => nav.move(selection, 1));
  }

  private handled(event: KeyboardEvent, action: () => void): void {
    event.preventDefault();
    action();
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
