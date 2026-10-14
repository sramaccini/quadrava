import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, resource, signal, viewChild } from '@angular/core';
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
import { KinetixWordmarkComponent } from 'components';
import { validateTheme } from 'schema';
import { isObject, type Json } from './model/doc-ops';
import type { DocumentState } from './model/document-state';
import { EditorStore } from './model/editor-store';
import { NavigationStore } from './model/navigation-store';
import { ThemeStore } from './model/theme-store';
import { PreviewComponent } from './preview/preview.component';
import { DataSourcesComponent } from './ui/data-sources.component';
import { InspectorComponent } from './ui/inspector.component';
import { IssuesComponent } from './ui/issues.component';
import { Dock } from './ui/dock';
import { DockSideComponent } from './ui/dock-side.component';
import { JsonViewComponent } from './ui/json-view.component';
import { MenuBarComponent, type Menu, type MenuItem } from './ui/menu-bar.component';
import { NavigationEditorComponent } from './ui/navigation-editor.component';
import { ThemeEditorComponent } from './ui/theme-editor.component';
import { OutlineComponent } from './ui/outline.component';
import { PaletteComponent } from './ui/palette.component';
import { RegistryPanelComponent } from './ui/registry-panel.component';
import { TextsComponent } from './ui/texts.component';

const LANGUAGES = ['it', 'en'];
const MODE_KEY = 'lc.editor.mode';

/** Che cosa si modifica: una schermata, la navigazione o il tema dell'applicazione. */
type Mode = 'screen' | 'navigation' | 'theme';
const MODES: Mode[] = ['screen', 'navigation', 'theme'];
const VIEWS = ['preview', 'json', 'sources', 'texts'] as const;
const VIEW_LABELS: Record<(typeof VIEWS)[number], string> = { preview: 'ed.tabs.preview', json: 'ed.tabs.json', sources: 'ed.tabs.sources', texts: 'ed.tabs.texts' };

/** Scorciatoie dell'aiuto: gruppo → [tasti, descrizione]. I tasti con nomi da tradurre sono chiavi dei messaggi (`ed.`). */
const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  { group: 'ed.keys.general', keys: [['Ctrl+Z', 'ed.keys.undo'], ['ed.keys.k.redo', 'ed.keys.redo'], ['F1', 'ed.keys.help']] },
  {
    group: 'ed.keys.outline',
    keys: [
      ['ed.keys.del', 'ed.keys.delete'],
      ['Ctrl+D', 'ed.keys.duplicate'],
      ['Ctrl+C · Ctrl+X · Ctrl+V', 'ed.keys.clipboard'],
      ['Alt+↑ · Alt+↓', 'ed.keys.move'],
      ['→ · ←', 'ed.keys.branch'],
      ['ed.keys.k.context', 'ed.keys.context'],
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
 * KinetiX Studio, l'editor visuale: schermate (tavolozza e struttura a sinistra, anteprima / JSON / data source / testi al centro,
 * proprietà a destra) e navigazione (casi d'uso e menu, con l'anteprima del menu), problemi in basso. I documenti
 * prodotti sono gli stessi JSON che il runtime legge.
 */
@Component({
  selector: 'lc-root',
  imports: [
    FormsModule,
    DataSourcesComponent,
    DockSideComponent,
    InspectorComponent,
    IssuesComponent,
    JsonViewComponent,
    KinetixWordmarkComponent,
    MenuBarComponent,
    NavigationEditorComponent,
    ThemeEditorComponent,
    OutlineComponent,
    PaletteComponent,
    RegistryPanelComponent,
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
  /** Il documento aperto nella modalità corrente: lo usano barra degli strumenti, scorciatoie e problemi. */
  protected readonly active = computed<DocumentState>(() => {
    const mode = this.mode();
    return mode === 'screen' ? this.store : mode === 'navigation' ? this.nav : this.theme;
  });
  protected readonly i18n = inject(I18n);
  private readonly confirmation = inject(Confirmation);
  private readonly notifier = inject(Notifier);
  private readonly themes = inject(ThemeService);
  protected readonly languages = LANGUAGES;

  protected readonly viewIndex = computed(() => VIEWS.indexOf(this.store.view()));
  /** Il documento aperto con la sua apertura (per riaprire una versione dal registro). */
  protected readonly loadable = computed(() => this.active() as DocumentState & { load(doc: Json): void });
  protected readonly showRegistry = signal(false);
  protected readonly warningCount = computed(() => this.active().issues().length - this.active().errorCount());
  protected readonly showIssues = signal(true);
  /** Finestre dell'aiuto: scorciatoie da tastiera e informazioni. */
  protected readonly showShortcuts = signal(false);
  protected readonly showAbout = signal(false);
  /** Scorciatoie mostrate nell'aiuto, per gruppo (testi nei messaggi `ed.keys.*`). */
  protected readonly shortcutGroups = SHORTCUTS;
  protected readonly dock = inject(Dock);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Barra dei menu: File (documento) e Modifica (comandi del documento e della selezione, con le scorciatoie). */
  protected readonly menus = computed<Menu[]>(() => {
    const t = (key: string) => this.i18n.t(key);
    const active = this.active();
    const mode = this.mode();
    const file: MenuItem[] = [
      { id: 'new', label: t('ed.menu.new'), run: () => void this.newDocument() },
      {
        id: 'open-example',
        label: t('ed.openExample'),
        emptyLabel: t('ed.menu.noExamples'),
        children: this.exampleNames().map((name) => ({ id: 'example:' + name, label: name, run: () => void this.openExample(name) })),
      },
      { id: 'import', label: t('ed.menu.import'), run: () => this.fileInput()?.nativeElement.click() },
      { id: 'export', label: t('ed.export'), run: () => this.exportFile() },
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
        { id: 'delete', label: t('ed.menu.delete'), shortcut: t('ed.key.delete'), disabled: none, run: () => doc.remove(selection) },
        { id: 'move-up', label: t('ed.menu.moveUp'), shortcut: 'Alt+↑', separator: true, disabled: none, run: () => doc.move(selection, -1) },
        { id: 'move-down', label: t('ed.menu.moveDown'), shortcut: 'Alt+↓', disabled: none, run: () => doc.move(selection, 1) },
      );
    }
    // Visualizza: i lati (fissati o nascosti), i problemi e, nella schermata, la vista centrale.
    const view: MenuItem[] = [
      { id: 'pin-left', label: t('ed.menu.pinLeft'), toggle: 'check', checked: this.dock.pinned.left(), disabled: mode === 'theme', run: () => this.dock.togglePin('left') },
      { id: 'pin-right', label: t('ed.menu.pinRight'), toggle: 'check', checked: this.dock.pinned.right(), run: () => this.dock.togglePin('right') },
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

  /** Schermate di esempio (`examples/index.json`, scritto da tools/copy-examples.mjs). */
  protected readonly examples = resource({
    loader: async (): Promise<string[]> => {
      const response = await fetch('examples/index.json');
      const names = response.ok ? ((await response.json()) as string[]) : [];
      this.store.knownScreens.set(names);
      this.nav.knownScreens.set(names);
      return names;
    },
  });

  /** Temi della demo (`examples/themes/index.json`, scritto da tools/copy-examples.mjs). */
  protected readonly themeNames = resource({
    loader: async (): Promise<string[]> => {
      const response = await fetch('examples/themes/index.json');
      return response.ok ? ((await response.json()) as string[]) : [];
    },
  });

  constructor() {
    // Traduzioni e tema degli esempi, così l'anteprima appare come nel runtime.
    void loadMessages(this.i18n, LANGUAGES, (l) => `examples/i18n/${l}.json`).then((problems) => problems.forEach((p) => console.warn('[i18n]', p)));
    void fetch('examples/themes/chiaro.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: unknown) => {
        const result = doc ? validateTheme(doc) : null;
        if (result?.valid) this.themes.apply(result.value);
      })
      .catch(() => undefined);
    effect(() => (document.documentElement.lang = this.i18n.locale()));
    effect(() => {
      try {
        localStorage.setItem(MODE_KEY, this.mode());
      } catch {
        // vedi la bozza
      }
    });
  }

  protected setView(index: number): void {
    this.store.view.set(VIEWS[index] ?? 'preview');
  }

  protected async newDocument(): Promise<void> {
    if (!(await this.confirmation.confirm(this.i18n.t('ed.confirmReplace')))) return;
    const mode = this.mode();
    if (mode === 'screen') this.store.newScreen();
    else if (mode === 'navigation') this.nav.newNavigation();
    else this.theme.newTheme();
  }

  /** Esempi apribili nella modalità corrente: le schermate, oppure la navigazione della demo. */
  protected readonly exampleNames = computed(() => {
    const mode = this.mode();
    if (mode === 'screen') return this.examples.value() ?? [];
    return mode === 'navigation' ? ['navigation'] : (this.themeNames.value() ?? []).map((name) => `themes/${name}`);
  });

  protected async openExample(name: string): Promise<void> {
    if (!(await this.confirmation.confirm(this.i18n.t('ed.confirmReplace')))) return;
    try {
      const response = await fetch(`examples/${name.split('/').map(encodeURIComponent).join('/')}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.loadDocument((await response.json()) as Json);
      this.notifier.toast(this.i18n.t('ed.opened', { name }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  protected async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !(await this.confirmation.confirm(this.i18n.t('ed.confirmReplace')))) return;
    try {
      const doc = JSON.parse(await file.text()) as Json;
      this.loadDocument(doc);
      this.notifier.toast(this.i18n.t('ed.opened', { name: file.name }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  private loadDocument(doc: Json): void {
    const mode = this.mode();
    if (mode === 'screen') this.store.load(doc);
    else if (mode === 'navigation') this.nav.load(doc);
    else this.theme.load(doc);
  }

  protected exportFile(): void {
    const doc = this.active().doc();
    const key = this.mode();
    const name = isObject(doc) && typeof doc[key] === 'string' && doc[key] ? doc[key] : key;
    const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Scorciatoie: annulla e ripeti sempre; le altre solo fuori dai campi di testo (dove valgono quelle del campo). */
  protected onKey(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (key === 'f1') return this.handled(event, () => this.showShortcuts.set(true));
    const active = this.active();
    if (ctrl && key === 'z' && !event.shiftKey) return this.handled(event, () => active.undo());
    if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) return this.handled(event, () => active.redo());
    if (isEditable(event.target) || document.querySelector('.cdk-overlay-container .ant-modal-wrap')) return;
    if (this.mode() === 'navigation') return this.navigationKey(event, ctrl, key);
    if (this.mode() === 'theme') return;
    const selection = this.store.selection();
    if (!selection.length) {
      if (ctrl && key === 'v') this.handled(event, () => this.store.paste());
      return;
    }
    if (key === 'delete') this.handled(event, () => this.store.remove(selection));
    else if (ctrl && key === 'd') this.handled(event, () => this.store.duplicate(selection));
    else if (ctrl && key === 'c') this.handled(event, () => this.store.copy(selection));
    else if (ctrl && key === 'x') this.handled(event, () => this.store.cut(selection));
    else if (ctrl && key === 'v') this.handled(event, () => this.store.paste());
    else if (event.altKey && key === 'arrowup') this.handled(event, () => this.store.move(selection, -1));
    else if (event.altKey && key === 'arrowdown') this.handled(event, () => this.store.move(selection, 1));
  }

  /** Nella navigazione: elimina, duplica, sposta (copia e incolla valgono solo per i nodi delle schermate). */
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
