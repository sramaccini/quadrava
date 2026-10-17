import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Confirmation, I18n, Notifier, ThemeService, loadMessages } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { QuadravaWordmarkComponent } from 'components';
import { validateTheme } from 'schema';
import { isObject, type Json } from './model/doc-ops';
import type { DocumentState } from './model/document-state';
import { EditorStore } from './model/editor-store';
import { FileAccess } from './model/file-access';
import { NavigationStore } from './model/navigation-store';
import { documentRef } from './model/registry-client';
import { RegistrySession, type RegistryRef } from './model/registry-session';
import { SavedDocuments } from './model/saved-documents';
import { ThemeStore } from './model/theme-store';
import { PreviewComponent } from './preview/preview.component';
import { DataSourcesComponent } from './ui/data-sources.component';
import { InspectorComponent } from './ui/inspector.component';
import { IssuesComponent } from './ui/issues.component';
import { Dock, type DockPanel } from './ui/dock';
import { DockPanelDirective } from './ui/dock-panel.directive';
import { DockSideComponent } from './ui/dock-side.component';
import { JsonViewComponent } from './ui/json-view.component';
import { MenuBarComponent, type Menu, type MenuItem } from './ui/menu-bar.component';
import { NewScreenComponent, type NewScreen } from './ui/new-screen.component';
import { NavigationEditorComponent } from './ui/navigation-editor.component';
import { ThemeEditorComponent } from './ui/theme-editor.component';
import { OutlineComponent } from './ui/outline.component';
import { PaletteComponent } from './ui/palette.component';
import { RegistryOpenComponent, type RegistryDocument } from './ui/registry-open.component';
import { RegistryPanelComponent } from './ui/registry-panel.component';
import { RegistryTargetComponent } from './ui/registry-target.component';
import { TextsComponent } from './ui/texts.component';

const LANGUAGES = ['en', 'it'];
const MODE_KEY = 'lc.editor.mode';

/** What is being edited: a screen, the navigation or the theme of the application. */
type Mode = 'screen' | 'navigation' | 'theme';
const MODES: Mode[] = ['screen', 'navigation', 'theme'];
const VIEWS = ['preview', 'json', 'sources', 'texts'] as const;
/** Panels of every mode (the «… pinned» items of the View menu). */
const MODE_PANELS: Record<Mode, DockPanel[]> = { screen: ['palette', 'outline', 'inspector'], navigation: ['outline', 'inspector'], theme: ['inspector'] };
const PANEL_LABELS: Record<DockPanel, string> = { palette: 'ed.palette', outline: 'ed.outline', inspector: 'ed.inspector' };
const VIEW_LABELS: Record<(typeof VIEWS)[number], string> = { preview: 'ed.tabs.preview', json: 'ed.tabs.json', sources: 'ed.tabs.sources', texts: 'ed.tabs.texts' };

/** Shortcuts of the help: group → [keys, description]. Keys with names to translate are message keys (`ed.`). */
const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  {
    group: 'ed.keys.general',
    keys: [['Ctrl+S', 'ed.keys.save'], ['Ctrl+O', 'ed.keys.open'], ['Ctrl+Z', 'ed.keys.undo'], ['ed.keys.k.redo', 'ed.keys.redo'], ['F1', 'ed.keys.help']],
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
 * Quadrava Studio, the visual editor: screens (palette and outline on the left, preview / JSON / data sources / texts in the centre,
 * properties on the right) and navigation (areas and menus, with the menu preview), problems at the bottom. The documents
 * produced are the same JSON the runtime reads.
 */
@Component({
  selector: 'lc-root',
  imports: [
    FormsModule,
    DataSourcesComponent,
    DockPanelDirective,
    DockSideComponent,
    InspectorComponent,
    IssuesComponent,
    JsonViewComponent,
    QuadravaWordmarkComponent,
    MenuBarComponent,
    NewScreenComponent,
    NavigationEditorComponent,
    ThemeEditorComponent,
    OutlineComponent,
    PaletteComponent,
    RegistryOpenComponent,
    RegistryPanelComponent,
    RegistryTargetComponent,
    NzDrawerModule,
    PreviewComponent,
    TextsComponent,
    NzButtonModule,
    NzIconModule,
    NzModalModule,
    NzSegmentedModule,
    NzSelectModule,
    NzTabsModule,
    NzTagModule,
    NzTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class App {
  protected readonly store = inject(EditorStore);
  protected readonly nav = inject(NavigationStore);
  protected readonly theme = inject(ThemeStore);
  protected readonly mode = signal<Mode>(initialMode());
  protected readonly modeOptions = computed(() => [
    { value: 'screen', label: this.i18n.t('ed.mode.screen') },
    { value: 'navigation', label: this.i18n.t('ed.mode.navigation') },
    { value: 'theme', label: this.i18n.t('ed.mode.theme') },
  ]);
  /** The document open in the current mode: toolbar, shortcuts and problems use it. */
  protected readonly active = computed<DocumentState>(() => {
    const mode = this.mode();
    return mode === 'screen' ? this.store : mode === 'navigation' ? this.nav : this.theme;
  });
  protected readonly i18n = inject(I18n);
  private readonly confirmation = inject(Confirmation);
  private readonly notifier = inject(Notifier);
  private readonly themes = inject(ThemeService);
  private readonly files = inject(FileAccess);
  private readonly saved = inject(SavedDocuments);
  protected readonly registry = inject(RegistrySession);
  protected readonly languages = LANGUAGES;
  /** The open document differs from the last one saved (to a file or in the registry) or opened. */
  protected readonly unsaved = computed(() => !this.saved.isSaved(this.mode(), this.active().doc()));

  protected readonly viewIndex = computed(() => VIEWS.indexOf(this.store.view()));
  /** The open document with where it was opened from (to reopen a version from the registry). */
  protected readonly loadable = computed(() => this.active() as DocumentState & { load(doc: Json): void });
  protected readonly showRegistry = signal(false);
  protected readonly warningCount = computed(() => this.active().issues().length - this.active().errorCount());
  protected readonly showIssues = signal(true);
  /** Help dialogs: keyboard shortcuts and information. */
  protected readonly showShortcuts = signal(false);
  protected readonly showAbout = signal(false);
  protected readonly showNewScreen = signal(false);
  protected readonly showRegistryOpen = signal(false);
  /** Dialog asking for the application before «Save to registry». */
  protected readonly showRegistryTarget = signal(false);
  /** Shortcuts shown in the help, by group (texts in the `ed.keys.*` messages). */
  protected readonly shortcutGroups = SHORTCUTS;
  protected readonly dock = inject(Dock);
  /** Panels of the two sides of the screen (for the width of the columns). */
  protected readonly leftPanels: DockPanel[] = ['palette', 'outline'];
  protected readonly rightPanels: DockPanel[] = ['inspector'];

  /** Menu bar: File (document) and Edit (commands of the document and of the selection, with the shortcuts). */
  protected readonly menus = computed<Menu[]>(() => {
    const t = (key: string) => this.i18n.t(key);
    const active = this.active();
    const mode = this.mode();
    // The registry items are off when the registry is not there (as in the demo editor), with the reason in the tooltip.
    const noRegistry = !this.registry.usable();
    const registryHint = this.registry.status() === 'checking' ? t('ed.menu.registryChecking') : noRegistry ? t('ed.menu.registryUnavailable') : undefined;
    const file: MenuItem[] = [
      { id: 'new', label: t('ed.menu.new'), run: () => void this.newDocument() },
      { id: 'open', label: t('ed.menu.open'), shortcut: 'Ctrl+O', run: () => void this.openFile() },
      { id: 'open-registry', label: t('ed.menu.openRegistry'), disabled: noRegistry, hint: registryHint, run: () => void this.openFromRegistry() },
      {
        id: 'open-example',
        label: t('ed.openExample'),
        emptyLabel: t('ed.menu.noExamples'),
        children: this.exampleNames().map((name) => ({ id: 'example:' + name, label: name, run: () => void this.openExample(name) })),
      },
      { id: 'save', label: t('ed.menu.save'), shortcut: 'Ctrl+S', separator: true, run: () => void this.saveFile() },
      { id: 'save-registry', label: t('ed.menu.saveRegistry'), disabled: noRegistry, hint: registryHint, run: () => void this.saveToRegistry() },
      { id: 'registry', label: t('ed.menu.registry'), separator: true, run: () => this.showRegistry.set(true) },
    ];
    const edit: MenuItem[] = [
      { id: 'undo', label: t('ed.menu.undo'), shortcut: 'Ctrl+Z', disabled: !active.canUndo(), run: () => active.undo() },
      { id: 'redo', label: t('ed.menu.redo'), shortcut: 'Ctrl+Y', disabled: !active.canRedo(), run: () => active.redo() },
    ];
    if (mode !== 'theme') {
      const doc = mode === 'screen' ? this.store : this.nav;
      const selection = doc.selection();
      const none = !selection.length;
      if (mode === 'screen') {
        edit.push(
          { id: 'cut', label: t('ed.menu.cut'), shortcut: 'Ctrl+X', separator: true, disabled: none, run: () => this.store.cut(selection) },
          { id: 'copy', label: t('ed.menu.copy'), shortcut: 'Ctrl+C', disabled: none, run: () => this.store.copy(selection) },
          { id: 'paste', label: t('ed.menu.paste'), shortcut: 'Ctrl+V', disabled: !this.store.clipboard(), run: () => this.store.paste() },
        );
      }
      edit.push(
        { id: 'duplicate', label: t('ed.menu.duplicate'), shortcut: 'Ctrl+D', separator: mode === 'navigation', disabled: none, run: () => doc.duplicate(selection) },
        {
          id: 'delete',
          label: t('ed.menu.delete'),
          shortcut: t('ed.key.delete'),
          disabled: none,
          run: () => (mode === 'screen' && this.store.multi().length > 1 ? this.store.removeMany(this.store.multi()) : doc.remove(selection)),
        },
        { id: 'move-up', label: t('ed.menu.moveUp'), shortcut: 'Alt+↑', separator: true, disabled: none, run: () => doc.move(selection, -1) },
        { id: 'move-down', label: t('ed.menu.moveDown'), shortcut: 'Alt+↓', disabled: none, run: () => doc.move(selection, 1) },
      );
    }
    // View: the sides (pinned or hidden), the problems and, in the screen, the central view.
    const view: MenuItem[] = [
      ...(MODE_PANELS[mode].map((panel) => ({
        id: 'pin-' + panel,
        label: this.i18n.t('ed.menu.pinPanel', { name: t(PANEL_LABELS[panel]) }),
        toggle: 'check' as const,
        checked: this.dock.pinned[panel](),
        run: () => this.dock.togglePin(panel),
      })) satisfies MenuItem[]),
      { id: 'issues', label: t('ed.menu.issues'), toggle: 'check', checked: this.showIssues(), run: () => this.showIssues.update((v) => !v) },
    ];
    if (mode === 'screen') {
      const current = this.store.view();
      VIEWS.forEach((v, i) =>
        view.push({ id: 'view-' + v, label: t(VIEW_LABELS[v]), toggle: 'radio', checked: current === v, separator: i === 0, run: () => this.store.view.set(v) }),
      );
    }
    return [
      { id: 'file', label: t('ed.menu.file'), items: file },
      { id: 'edit', label: t('ed.menu.edit'), items: edit },
      { id: 'view', label: t('ed.menu.view'), items: view },
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
    this.saved.ensureBaseline('screen', this.store.doc());
    this.saved.ensureBaseline('navigation', this.nav.doc());
    this.saved.ensureBaseline('theme', this.theme.doc());
    // Known screens (suggestions and «unknown screen» warnings): the examples and those of the application in the registry.
    effect(() => {
      const examples = this.examples.hasValue() ? this.examples.value() : [];
      const names = [...new Set([...examples, ...this.registry.screens()])];
      this.store.knownScreens.set(names);
      this.nav.knownScreens.set(names);
    });
    effect(() => (document.documentElement.lang = this.i18n.locale()));
    effect(() => {
      try {
        localStorage.setItem(MODE_KEY, this.mode());
      } catch {
        // see the draft
      }
    });
  }

  protected setView(index: number): void {
    this.store.view.set(VIEWS[index] ?? 'preview');
  }

  protected async newDocument(): Promise<void> {
    // A new screen asks for title and identifier; the dialog also warns that it replaces the open one.
    if (this.mode() === 'screen') {
      this.showNewScreen.set(true);
      return;
    }
    if (!(await this.confirmReplace())) return;
    if (this.mode() === 'navigation') this.nav.newNavigation();
    else this.theme.newTheme();
    this.replaced(null, null);
  }

  protected createScreen(screen: NewScreen): void {
    this.showNewScreen.set(false);
    this.store.newScreen(screen.title, screen.screen);
    this.replaced(null, null);
  }

  /** Examples that can be opened in the current mode: the screens, or the navigation of the demo. */
  protected readonly exampleNames = computed(() => {
    const mode = this.mode();
    if (mode === 'screen') return this.examples.value() ?? [];
    return mode === 'navigation' ? ['navigation'] : (this.themeNames.value() ?? []).map((name) => `themes/${name}`);
  });

  protected async openExample(name: string): Promise<void> {
    if (!(await this.confirmReplace())) return;
    try {
      const response = await fetch(`examples/${name.split('/').map(encodeURIComponent).join('/')}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.loadDocument((await response.json()) as Json);
      this.replaced(null, null);
      this.notifier.toast(this.i18n.t('ed.opened', { name }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /** «Open…»: a JSON file from the computer, in the current mode; where possible, the next «Save» rewrites that file. */
  protected async openFile(): Promise<void> {
    if (!(await this.confirmReplace())) return;
    const kind = this.mode();
    try {
      const file = await this.files.open(kind);
      if (!file) return;
      this.loadDocument(file.doc);
      this.registry.setOrigin(null, null);
      this.saved.markSaved(kind, this.active().doc());
      this.notifier.toast(this.i18n.t('ed.opened', { name: file.name }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /** «Save»: the document as JSON, in the file opened or already chosen, otherwise in a new one (or downloaded). */
  protected async saveFile(): Promise<void> {
    const kind = this.mode();
    const doc = this.active().doc();
    const id = isObject(doc) && typeof doc[kind] === 'string' && doc[kind] ? doc[kind] : kind;
    try {
      const name = await this.files.save(kind, doc, `${id}.json`);
      if (!name) return;
      this.saved.markSaved(kind, doc);
      const errors = this.active().errorCount();
      this.notifier.toast(errors ? this.i18n.t('ed.savedWithErrors', { name, n: errors }) : this.i18n.t('ed.savedFile', { name }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.saveFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /** «Open from registry…»: the dialog with application, document and version (or the sign-in, if the registry asks for it). */
  protected async openFromRegistry(): Promise<void> {
    if ((await this.registry.check()) === 'login') return this.registry.login();
    if (this.registry.status() !== 'available' || !(await this.confirmReplace())) return;
    this.showRegistryOpen.set(true);
  }

  protected openedFromRegistry(opened: RegistryDocument): void {
    this.showRegistryOpen.set(false);
    this.loadDocument(opened.doc);
    this.replaced(opened.ref, opened.hash);
    this.notifier.toast(this.i18n.t('ed.opened', { name: `${opened.ref.id} @ ${opened.hash.slice(0, 10)}` }));
  }

  /** «Save to registry»: a new version in the chosen application (asked first, if missing). */
  protected async saveToRegistry(): Promise<void> {
    if ((await this.registry.check()) === 'login') return this.registry.login();
    if (this.registry.status() !== 'available') return;
    const kind = this.mode();
    const active = this.active();
    if (!documentRef(kind, active.doc())) return this.notifier.toast(this.i18n.t('ed.registry.noId'), 'error');
    if (active.errorCount()) return this.notifier.toast(this.i18n.t('ed.registry.hasErrors'), 'error');
    if (!this.registry.appId()) return this.showRegistryTarget.set(true);
    const doc = active.doc();
    if (await this.registry.save(kind, doc)) this.saved.markSaved(kind, doc);
    // The validation problems of the registry are read, point by point, in the Registry panel.
    else if (this.registry.issues().length) this.showRegistry.set(true);
  }

  protected async chooseRegistryApp(appId: string): Promise<void> {
    this.showRegistryTarget.set(false);
    this.registry.appId.set(appId);
    await this.saveToRegistry();
  }

  /** With unsaved changes, asks for confirmation before replacing the open document. */
  private async confirmReplace(): Promise<boolean> {
    return !this.unsaved() || this.confirmation.confirm(this.i18n.t('ed.confirmReplace'));
  }

  /**
   * The open document was replaced: new or example (no origin), or a version of the registry. It has no
   * changes to save and the next «Save» asks again where to save.
   */
  private replaced(ref: RegistryRef | null, hash: string | null): void {
    const kind = this.mode();
    this.files.forget(kind);
    this.registry.setOrigin(ref, hash);
    this.saved.markSaved(kind, this.active().doc());
  }

  private loadDocument(doc: Json): void {
    const mode = this.mode();
    if (mode === 'screen') this.store.load(doc);
    else if (mode === 'navigation') this.nav.load(doc);
    else this.theme.load(doc);
  }

  /** Shortcuts: undo and redo always; the others only outside text fields (where those of the field apply). */
  protected onKey(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (key === 'f1') return this.handled(event, () => this.showShortcuts.set(true));
    const active = this.active();
    if (ctrl && key === 'z' && !event.shiftKey) return this.handled(event, () => active.undo());
    if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) return this.handled(event, () => active.redo());
    // Save and Open apply inside fields too (as in desktop applications), not with a dialog open.
    if (ctrl && (key === 's' || key === 'o') && !event.shiftKey && !event.altKey) {
      if (document.querySelector('.cdk-overlay-container .ant-modal-wrap')) return;
      return this.handled(event, () => void (key === 's' ? this.saveFile() : this.openFile()));
    }
    if (isEditable(event.target) || document.querySelector('.cdk-overlay-container .ant-modal-wrap')) return;
    if (this.mode() === 'navigation') return this.navigationKey(event, ctrl, key);
    if (this.mode() === 'theme') return;
    const selection = this.store.selection();
    if (!selection.length) {
      if (ctrl && key === 'v') this.handled(event, () => this.store.paste());
      return;
    }
    if (key === 'delete') this.handled(event, () => (this.store.multi().length > 1 ? this.store.removeMany(this.store.multi()) : this.store.remove(selection)));
    else if (ctrl && key === 'd') this.handled(event, () => this.store.duplicate(selection));
    else if (ctrl && key === 'c') this.handled(event, () => this.store.copy(selection));
    else if (ctrl && key === 'x') this.handled(event, () => this.store.cut(selection));
    else if (ctrl && key === 'v') this.handled(event, () => this.store.paste());
    else if (event.altKey && key === 'arrowup') this.handled(event, () => this.store.move(selection, -1));
    else if (event.altKey && key === 'arrowdown') this.handled(event, () => this.store.move(selection, 1));
  }

  /** In the navigation: delete, duplicate, move (copy and paste apply only to the nodes of screens). */
  private navigationKey(event: KeyboardEvent, ctrl: boolean, key: string): void {
    const selection = this.nav.selection();
    if (!selection.length) return;
    if (key === 'delete') this.handled(event, () => this.nav.remove(selection));
    else if (ctrl && key === 'd') this.handled(event, () => this.nav.duplicate(selection));
    else if (event.altKey && key === 'arrowup') this.handled(event, () => this.nav.move(selection, -1));
    else if (event.altKey && key === 'arrowdown') this.handled(event, () => this.nav.move(selection, 1));
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

function initialMode(): Mode {
  try {
    const stored = localStorage.getItem(MODE_KEY) as Mode | null;
    return stored && MODES.includes(stored) ? stored : 'screen';
  } catch {
    return 'screen';
  }
}
