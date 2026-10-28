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
import { validateTheme } from 'schema/validation';
import type { Json } from './model/doc-ops';
import { EditorStore } from './model/editor-store';
import { runScreenShortcut } from './model/screen-shortcuts';
import { FileAccess } from './model/file-access';
import { NavigationStore } from './model/navigation-store';
import { Project, type ProjectResource, type ResourceKind } from './model/project';
import { ProjectCommands } from './model/project-commands';
import { ProjectLibrary } from './model/project-library';
import { ProjectPublisher, type PublishReport } from './model/project-publisher';
import { documentRef, type DocumentKind } from './model/registry-client';
import { RegistrySession, type RegistryRef } from './model/registry-session';
import { SavedDocuments, type EditorKind } from './model/saved-documents';
import { KnownDataSources, KnownScreens, KnownTranslations } from './model/shared-state';
import { Workspace, type DocumentWindow } from './model/workspace';
import { Dock, type DockPanel } from './ui/dock';
import { DockPanelDirective } from './ui/dock-panel.directive';
import { DockSideComponent, type DockTab } from './ui/dock-side.component';
import { DocumentInspectorComponent } from './ui/document-inspector.component';
import { InspectorComponent } from './ui/inspector.component';
import { IssuesComponent } from './ui/issues.component';
import { MenuBarComponent, type Menu, type MenuItem } from './ui/menu-bar.component';
import { NavInspectorComponent } from './ui/nav-inspector.component';
import { NavOutlineComponent } from './ui/nav-outline.component';
import { NewScreenComponent, type NewResource, type NewResourceKind } from './ui/new-screen.component';
import { OutlineComponent } from './ui/outline.component';
import { PaletteComponent } from './ui/palette.component';
import { ProjectPanelComponent } from './ui/project-panel.component';
import { RegistryOpenComponent, type RegistryDocument } from './ui/registry-open.component';
import { RegistryPanelComponent } from './ui/registry-panel.component';
import { RegistryReviewComponent } from './ui/registry-review.component';
import { RegistryTargetComponent } from './ui/registry-target.component';
import { RuntimeAddressComponent } from './ui/runtime-address.component';
import { RunProject } from './model/run-project';
import { SCREEN_VIEWS } from './ui/screen-editor.component';
import { StartPageComponent, type StartCommand } from './ui/start-page.component';
import { ThemeInspectorComponent } from './ui/theme-inspector.component';
import { WorkspaceComponent, windowTitle, type WorkspaceCommand } from './ui/workspace.component';

const LANGUAGES = ['en', 'it'];
/** Kinds of resource that can be created, and opened from the registry. */
const CREATABLE: EditorKind[] = ['screen', 'datasources', 'navigation', 'theme'];
/** Side panels of every kind of document (the «… pinned» items of the View menu); the project panel is always there. */
const KIND_PANELS: Record<EditorKind, DockPanel[]> = {
  project: ['inspector'],
  screen: ['palette', 'outline', 'inspector'],
  datasources: ['inspector'],
  navigation: ['outline', 'inspector'],
  theme: ['inspector'],
  messages: [],
};
const PANEL_TABS: Record<DockPanel, { label: string; icon: string }> = {
  project: { label: 'ed.project.panel', icon: 'folder' },
  palette: { label: 'ed.palette', icon: 'appstore' },
  outline: { label: 'ed.outline', icon: 'apartment' },
  inspector: { label: 'ed.inspector', icon: 'control' },
};
const LEFT: DockPanel[] = ['project', 'palette', 'outline'];
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
      ['Esc', 'ed.keys.deselect'],
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
      ['ed.keys.k.previewMenu', 'ed.keys.previewMenu'],
      ['ed.keys.k.enter', 'ed.keys.paletteFirst'],
      ['Esc', 'ed.keys.clearSearch'],
      ['Esc', 'ed.keys.closeSide'],
      ['ed.keys.k.ctrlEnter', 'ed.keys.applyJson'],
      ['ed.keys.k.complete', 'ed.keys.complete'],
    ],
  },
];

/**
 * Quadrava Studio, the visual editor: the resources of a project (settings, screens, data sources, navigation, themes) in a
 * workspace of windows as in an IDE, with the menus and the toolbar on top, the side panels (project, palette and outline on
 * the left, properties on the right) and the problems of the active document at the bottom. Without a project it shows the
 * start page. The documents produced are the same JSON the runtime reads.
 */
@Component({
  selector: 'lc-root',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    DockPanelDirective,
    DockSideComponent,
    DocumentInspectorComponent,
    InspectorComponent,
    IssuesComponent,
    QuadravaWordmarkComponent,
    MenuBarComponent,
    NavInspectorComponent,
    NavOutlineComponent,
    NewScreenComponent,
    OutlineComponent,
    PaletteComponent,
    ProjectPanelComponent,
    RegistryOpenComponent,
    RegistryPanelComponent,
    RegistryReviewComponent,
    RegistryTargetComponent,
    RuntimeAddressComponent,
    StartPageComponent,
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
  protected readonly project = inject(Project);
  protected readonly commands = inject(ProjectCommands);
  private readonly library = inject(ProjectLibrary);
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
  /** Studio shows the workspace with a project open (or, without one, while windows are open); otherwise the start page. */
  protected readonly working = computed(() => this.project.isOpen() || this.workspace.windows().length > 0);
  /** The document of the active window has changes not saved (to the project, to a file or in the registry). */
  protected readonly unsaved = computed(() => {
    const win = this.active();
    return !!win && this.workspace.isUnsaved(win);
  });
  protected readonly warningCount = computed(() => {
    const state = this.active()?.state;
    return state ? state.issues().length - state.errorCount() : 0;
  });

  /** Side panels by side: the project (with a project open) and those of the active document. */
  protected readonly leftTabs = computed(() => this.tabs((p) => LEFT.includes(p)));
  protected readonly rightTabs = computed(() => this.tabs((p) => !LEFT.includes(p)));
  /**
   * Width of the side columns. While working they are always there, also without an active document or for one without
   * panels on a side: the area of the windows does not change size when a document opens or the active window changes.
   */
  protected readonly leftColumn = computed(() => {
    if (!this.working()) return 0;
    const tabs = this.leftTabs().map((t) => t.id);
    return this.dock.columnWidth('left', tabs.length ? tabs : ['palette', 'outline'], 280);
  });
  protected readonly rightColumn = computed(() => (this.working() ? this.dock.columnWidth('right', ['inspector'], 320) : 0));

  protected readonly showRegistry = signal(false);
  protected readonly showIssues = signal(true);
  /** Help dialogs: keyboard shortcuts and information. */
  protected readonly showShortcuts = signal(false);
  protected readonly showAbout = signal(false);
  /** The dialog creating a resource (or a project) of this kind; null = closed. */
  protected readonly creating = signal<NewResourceKind | null>(null);
  /** Identifiers already used by the kind being created. */
  protected readonly usedIds = computed(() => {
    const kind = this.creating();
    if (kind === 'project') return this.library.browserProjects();
    return this.project.resources().filter((r) => r.kind === kind).map((r) => r.id);
  });
  /** Where a new project can go: on disk (where the browser allows it) or in the browser. */
  protected readonly projectLocations = computed<('disk' | 'browser')[]>(() => (this.library.canUseDisk() ? ['disk', 'browser'] : ['browser']));
  /** «Open from registry…»: the dialog for documents of this kind (null = closed). */
  protected readonly registryKind = signal<DocumentKind | null>(null);
  /** The active window, when its document is a registry document (the project settings are not). */
  protected readonly registryTarget = computed(() => {
    const win = this.active();
    return win && win.kind !== 'project' && win.kind !== 'messages' ? { win, kind: win.kind as DocumentKind } : null;
  });
  /** The dialog reviewing several documents of the registry at once. */
  protected readonly showReview = signal(false);
  /** Outcome of the last publication of the project (shown in a dialog). */
  protected readonly publishReport = signal<PublishReport | null>(null);
  /** «Publish project» waits for the choice of the application. */
  private publishAfterChoice = false;
  private readonly publisher = inject(ProjectPublisher);
  /** Dialog asking for the application before «Save to registry». */
  protected readonly showRegistryTarget = signal(false);
  /** «Run project»: the runtime opened in another window with the project (ADR-16), and the dialog of its address. */
  protected readonly runner = inject(RunProject);
  protected readonly showRuntimeAddress = signal(false);
  /** Shortcuts shown in the help, by group (texts in the `ed.keys.*` messages). */
  protected readonly shortcutGroups = SHORTCUTS;

  /** Menu bar: File, Edit, View, Window, Help. The commands of the document work on the active window. */
  protected readonly menus = computed<Menu[]>(() => {
    const t = (key: string) => this.i18n.t(key);
    const win = this.active();
    const state = win?.state;
    const open = this.project.isOpen();
    // The registry items are off when the registry is not there (as in the demo editor), with the reason in the tooltip.
    const noRegistry = !this.registry.usable();
    // Switched off by the settings (studio-config.json, the desktop app): its items are not there at all.
    const registryOn = this.registry.enabled();
    const registryHint = this.registry.status() === 'checking' ? t('ed.menu.registryChecking') : noRegistry ? t('ed.menu.registryUnavailable') : undefined;
    const registryDocument = !!win && win.kind !== 'project' && win.kind !== 'messages';
    const file: MenuItem[] = [
      { id: 'new-project', label: t('ed.menu.newProject'), run: () => void this.start({ kind: 'new' }) },
      ...(this.library.canUseDisk() ? [{ id: 'open-project', label: t('ed.menu.openProject'), run: () => void this.openDiskProject() }] : []),
      { id: 'open-demo', label: t('ed.start.demo'), run: () => void this.commands.openDemo() },
      { id: 'import-project', label: t('ed.menu.importProject'), run: () => void this.importProjectZip() },
      { id: 'export-project', label: t('ed.menu.exportProject'), disabled: !open, run: () => void this.commands.exportZip() },
      { id: 'close-project', label: t('ed.menu.closeProject'), disabled: !open, run: () => void this.commands.close() },
      ...(this.runner.available
        ? [
            { id: 'run-project', label: t('ed.menu.runProject'), separator: true, disabled: !open, run: () => this.runProject() },
            { id: 'runtime-address', label: t('ed.menu.runtimeAddress'), run: () => this.showRuntimeAddress.set(true) },
          ]
        : []),
      {
        id: 'new',
        label: t('ed.menu.new'),
        separator: true,
        disabled: !open,
        children: CREATABLE.map((kind) => ({ id: 'new-' + kind, label: t('ed.new.' + kind), run: () => this.newResource(kind) })),
      },
      { id: 'import', label: t('ed.menu.import'), shortcut: 'Ctrl+O', disabled: !open, run: () => void this.importFile() },
      {
        id: 'open-example',
        label: t('ed.openExample'),
        emptyLabel: t('ed.menu.noExamples'),
        disabled: !open,
        children: this.exampleNames().map((name) => ({ id: 'example:' + name, label: name, run: () => void this.importExample(name) })),
      },
      ...(registryOn
        ? [
            {
              id: 'open-registry',
              label: t('ed.menu.openRegistry'),
              disabled: noRegistry || !open,
              hint: registryHint,
              children: CREATABLE.map((kind) => ({ id: 'open-registry-' + kind, label: t('ed.openRegistry.' + kind), run: () => void this.openFromRegistry(kind as DocumentKind) })),
            },
          ]
        : []),
      { id: 'save', label: t('ed.menu.save'), shortcut: 'Ctrl+S', separator: true, disabled: !win, run: () => win && void this.commands.save(win) },
      { id: 'save-all', label: t('ed.menu.saveAll'), disabled: !this.workspace.windows().length, run: () => void this.commands.saveAll() },
      { id: 'export', label: t('ed.menu.export'), disabled: !win, run: () => win && void this.commands.export(win) },
      ...(registryOn
        ? [
            { id: 'save-registry', label: t('ed.menu.saveRegistry'), disabled: noRegistry || !registryDocument, hint: registryHint, run: () => void this.saveToRegistry() },
            { id: 'publish-project', label: t('ed.menu.publishProject'), disabled: noRegistry || !open, hint: registryHint, run: () => void this.publishProject() },
            { id: 'registry', label: t('ed.menu.registry'), separator: true, disabled: !registryDocument, run: () => this.showRegistry.set(true) },
            { id: 'review', label: t('ed.menu.review'), disabled: noRegistry, hint: registryHint, run: () => void this.openReview() },
          ]
        : []),
      { id: 'close', label: t('ed.menu.close'), separator: true, disabled: !win, run: () => win && void this.closeWindow(win) },
      { id: 'close-all', label: t('ed.menu.closeAll'), disabled: !this.workspace.windows().length, run: () => void this.closeAll() },
    ];
    const edit: MenuItem[] = [
      { id: 'undo', label: t('ed.menu.undo'), shortcut: 'Ctrl+Z', disabled: !state?.canUndo(), run: () => state?.undo() },
      { id: 'redo', label: t('ed.menu.redo'), shortcut: 'Ctrl+Y', disabled: !state?.canRedo(), run: () => state?.redo() },
    ];
    if (win && (win.kind === 'screen' || win.kind === 'navigation')) {
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
    // View: the panels (pinned or hidden), the problems and, in a screen, the central view.
    const view: MenuItem[] = [
      ...(this.panels().map((panel) => ({
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

  /** Files of the demo project (`examples/files.json`, written by tools/copy-examples.mjs): the examples that can be imported. */
  protected readonly exampleFiles = resource({
    loader: async (): Promise<string[]> => {
      const response = await fetch('examples/files.json');
      return response.ok ? ((await response.json()) as string[]) : [];
    },
  });

  /** Examples that can be imported: the screens, the data sources, the navigation and the themes of the demo. */
  protected readonly exampleNames = computed(() =>
    (this.exampleFiles.value() ?? []).filter((path) => /^(screens|datasources|themes)\/|^navigation\.json$/.test(path)).map((path) => path.replace(/\.json$/, '')),
  );

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
    // Known screens (suggestions and «unknown screen» warnings): those of the project, of the application in the registry and
    // of the open windows.
    const known = inject(KnownScreens);
    effect(() => {
      const ofProject = this.project.resources().filter((r) => r.kind === 'screen').map((r) => r.id);
      const open = this.workspace
        .windows()
        .filter((w) => w.kind === 'screen')
        .map((w) => this.workspace.name(w))
        .filter((name): name is string => !!name);
      known.names.set([...new Set([...ofProject, ...this.registry.screens(), ...open])]);
    });
    // The data sources of the project, for the references of the screens (not checked without a project).
    const sources = inject(KnownDataSources);
    effect(() => sources.documents.set(this.project.isOpen() ? this.workspace.dataSources() : null));
    // Languages and catalogues of the project, for the texts of the screens and their previews.
    const texts = inject(KnownTranslations);
    effect(() => {
      const manifest = this.project.manifest();
      texts.project.set(manifest ? { languages: manifest.languages, defaultLanguage: manifest.defaultLanguage, catalogues: this.workspace.catalogues() } : null);
    });
    effect(() => (document.documentElement.lang = this.i18n.locale()));
    // The last project kept in the browser (or, in the desktop app, on disk) opens again by itself; one on disk in the
    // browser needs a click (the browser asks for permission).
    if (this.library.reopensQuietly()) void this.reopenLast(true);
  }

  /** The dockable panels now: the project (with a project open) and those of the active document. */
  private panels(): DockPanel[] {
    const win = this.active();
    return [...(this.project.isOpen() ? (['project'] as DockPanel[]) : []), ...(win ? KIND_PANELS[win.kind] : [])];
  }

  /** The panels on one side, as tabs of the side. */
  private tabs(side: (panel: DockPanel) => boolean): DockTab[] {
    return this.panels()
      .filter(side)
      .map((id) => ({ id, label: this.i18n.t(PANEL_TABS[id].label), icon: PANEL_TABS[id].icon }));
  }

  /** «New ▸»: screens, data sources and themes ask for name and identifier first; the navigation opens at once. */
  protected newResource(kind: EditorKind | ResourceKind): void {
    if (kind === 'screen' || kind === 'datasources' || kind === 'theme') this.askNew(kind);
    else if (kind === 'navigation') void this.commands.createResource('navigation');
    else if (kind === 'messages') {
      // A catalogue per language of the project: languages are added in the settings, which create their catalogues.
      void this.workspace.openResource({ kind: 'project', id: 'project', path: 'project.json' });
      this.notifier.toast(this.i18n.t('ed.messages.addInSettings'));
    }
  }

  protected async created(value: NewResource): Promise<void> {
    const kind = this.creating();
    this.creating.set(null);
    if (kind === 'project') await this.commands.create(value.title, value.id, value.location ?? 'browser');
    else if (kind) await this.commands.createResource(kind, value.title, value.id);
  }

  /**
   * Opens the dialog of a new resource. The focus leaves the windows first: closing, the dialog gives it back where it was, and
   * a focus inside another window would bring that one in front instead of the new resource.
   */
  private askNew(kind: NewResourceKind): void {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest('ed-document-window')) focused.blur();
    this.creating.set(kind);
  }

  protected async deleteResource(resource: ProjectResource): Promise<void> {
    const label = resource.kind === 'navigation' ? this.i18n.t('ed.project.group.navigation') : resource.id;
    await this.commands.deleteResource(resource, label);
  }

  protected command(command: WorkspaceCommand): void {
    if (command.kind === 'new') this.newResource(command.document);
    else void this.importFile();
  }

  protected async start(command: StartCommand): Promise<void> {
    switch (command.kind) {
      case 'new':
        await this.library.refresh().catch(() => undefined);
        this.askNew('project');
        return;
      case 'open-disk':
        return this.openDiskProject();
      case 'demo':
        await this.commands.openDemo();
        return;
      case 'import-zip':
        return this.importProjectZip();
      case 'reopen':
        return this.reopenLast(false);
      case 'open-browser': {
        const folder = await this.library.browserFolder(command.name);
        if (folder) await this.commands.open(folder);
        return;
      }
      case 'delete-browser':
        if (await this.confirmation.confirm(this.i18n.t('ed.start.confirmDelete', { name: command.name }))) await this.library.deleteBrowserProject(command.name);
        return;
    }
  }

  /** «Import project (zip)…»: an archive from the computer becomes a project in the browser, and opens. */
  private async importProjectZip(): Promise<void> {
    const file = await this.files.chooseFile('.zip,application/zip');
    if (file) await this.commands.importZip(file);
  }

  private async openDiskProject(): Promise<void> {
    const folder = await this.library.chooseDiskFolder();
    if (folder) await this.commands.open(folder);
  }

  /** Opens the last project again; at start-up (`quiet`) without a message if it is no longer there. */
  private async reopenLast(quiet: boolean): Promise<void> {
    const folder = await this.library.reopenLast().catch(() => null);
    if (folder) await this.commands.open(folder);
    else if (!quiet) this.notifier.toast(this.i18n.t('ed.start.reopenFailed'), 'error');
  }

  /** «Import file…»: a JSON file from the computer, written into the project as the resource of its kind and opened. */
  protected async importFile(): Promise<void> {
    if (!this.project.isOpen()) return;
    const id = this.workspace.newId();
    try {
      const file = await this.files.open(id);
      if (!file) return;
      this.files.forget(id);
      await this.commands.importDocument(file.doc, file.name);
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /** «Import example ▸»: a resource of the demo project, copied into the open project. */
  protected async importExample(name: string): Promise<void> {
    try {
      const response = await fetch(`examples/${name.split('/').map(encodeURIComponent).join('/')}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await this.commands.importDocument((await response.json()) as Json, name);
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /** «Open from registry ▸»: the dialog with application, document and version (or the sign-in, if the registry asks for it). */
  protected async openFromRegistry(kind: DocumentKind): Promise<void> {
    if ((await this.registry.check()) === 'login') return this.registry.login();
    if (this.registry.status() === 'available') this.registryKind.set(kind);
  }

  protected async openedFromRegistry(opened: RegistryDocument): Promise<void> {
    this.registryKind.set(null);
    const win = await this.commands.importDocument(opened.doc, `${opened.ref.id} @ ${opened.hash.slice(0, 10)}`);
    if (win) this.registry.setOrigin(win.id, opened.ref as RegistryRef, opened.hash);
  }

  /** «Save to registry»: a new version of the active document in the chosen application (asked first, if missing). */
  /** «Run project»: opens (or reloads) the runtime with the project as it is now; a popup blocked or a bad address are said. */
  protected runProject(): void {
    if (!this.project.isOpen()) return;
    const outcome = this.runner.run();
    if (outcome === 'invalid') this.showRuntimeAddress.set(true);
    else if (outcome === 'blocked') this.notifier.toast(this.i18n.t('ed.run.blocked'), 'error');
  }

  /** The address chosen in the dialog: the project runs there at once. */
  protected runtimeAddressChosen(): void {
    this.showRuntimeAddress.set(false);
    this.runProject();
  }

  protected async saveToRegistry(): Promise<void> {
    if ((await this.registry.check()) === 'login') return this.registry.login();
    const win = this.active();
    if (this.registry.status() !== 'available' || !win || win.kind === 'project') return;
    if (!documentRef(win.kind as DocumentKind, win.state.doc())) return this.notifier.toast(this.i18n.t('ed.registry.noId'), 'error');
    if (win.state.errorCount()) return this.notifier.toast(this.i18n.t('ed.registry.hasErrors'), 'error');
    if (!this.registry.appId()) return this.showRegistryTarget.set(true);
    const doc = win.state.doc();
    if (await this.registry.save(win.id, win.kind as DocumentKind, doc)) this.saved.markSaved(win.id, doc);
    // The validation problems of the registry are read, point by point, in the Registry panel.
    else if (this.registry.issues().length) this.showRegistry.set(true);
  }

  /** «Review versions…»: the documents of the application waiting for a step, to review or publish several at once. */
  protected async openReview(): Promise<void> {
    if ((await this.registry.check()) === 'login') return this.registry.login();
    if (this.registry.status() !== 'available') return;
    if (!this.registry.appId()) return this.notifier.toast(this.i18n.t('ed.review.noApp'), 'error');
    this.publishReport.set(null);
    this.showReview.set(true);
  }

  protected async chooseRegistryApp(appId: string): Promise<void> {
    this.showRegistryTarget.set(false);
    this.registry.appId.set(appId);
    if (this.publishAfterChoice) {
      this.publishAfterChoice = false;
      await this.publishProject();
    } else await this.saveToRegistry();
  }

  /**
   * «Publish project»: every resource saved in the project becomes a new version in the chosen application of the registry and
   * is published in its environment (data sources first, the navigation last). Unsaved changes of the windows are not published:
   * the confirmation says so. The outcome, resource by resource, is shown at the end.
   */
  protected async publishProject(): Promise<void> {
    if ((await this.registry.check()) === 'login') return this.registry.login();
    if (this.registry.status() !== 'available' || !this.project.isOpen()) return;
    if (!this.registry.appId()) {
      this.publishAfterChoice = true;
      return this.showRegistryTarget.set(true);
    }
    const appId = this.registry.appId();
    const env = this.registry.env();
    const unsaved = this.workspace.windows().filter((w) => this.workspace.isUnsaved(w)).length;
    const question = this.i18n.t('ed.publish.confirm', { name: this.project.manifest()?.name ?? '', app: appId, env, n: unsaved });
    if (!(await this.confirmation.confirm(question))) return;
    try {
      this.publishReport.set(await this.publisher.publish(appId, env));
    } catch (e) {
      this.registry.report(e);
    }
  }

  /** Closes a window, asking for confirmation if its document has unsaved changes. */
  protected async closeWindow(win: DocumentWindow): Promise<boolean> {
    if (this.workspace.isUnsaved(win)) {
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
    const win = this.active();
    // Save and Import apply inside fields too (as in desktop applications), not with a dialog open.
    if (ctrl && (key === 's' || key === 'o') && !event.shiftKey && !event.altKey) {
      if (dialog) return;
      return this.handled(event, () => void (key === 's' ? win && this.commands.save(win) : this.importFile()));
    }
    if (!win) return;
    if (ctrl && key === 'z' && !event.shiftKey) return this.handled(event, () => win.state.undo());
    if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) return this.handled(event, () => win.state.redo());
    if (isEditable(event.target) || dialog) return;
    // Esc deselects everything (after the menus, panels and completions that use it to close).
    if (key === 'escape' && !event.defaultPrevented && win.state.selection().length) return this.handled(event, () => win.state.select([]));
    if (win.kind === 'navigation') return this.navigationKey(event, win.injector.get(NavigationStore), ctrl, key);
    if (win.kind !== 'screen') return;
    if (runScreenShortcut(win.injector.get(EditorStore), { key: event.key, ctrl, shift: event.shiftKey, alt: event.altKey })) event.preventDefault();
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
