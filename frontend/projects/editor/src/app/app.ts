import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Confirmation, I18n, Notifier, ThemeService, loadMessages } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { validateTheme } from 'schema';
import { isObject, type Json } from './model/doc-ops';
import { EditorStore } from './model/editor-store';
import { PreviewComponent } from './preview/preview.component';
import { DataSourcesComponent } from './ui/data-sources.component';
import { InspectorComponent } from './ui/inspector.component';
import { IssuesComponent } from './ui/issues.component';
import { JsonViewComponent } from './ui/json-view.component';
import { OutlineComponent } from './ui/outline.component';
import { PaletteComponent } from './ui/palette.component';
import { TextsComponent } from './ui/texts.component';

const LANGUAGES = ['it', 'en'];
const VIEWS = ['preview', 'json', 'sources', 'texts'] as const;

/**
 * Editor visuale delle schermate: tavolozza e struttura a sinistra, anteprima / JSON / data source al centro,
 * proprietà a destra, problemi in basso. Il documento prodotto è lo stesso JSON che il runtime legge.
 */
@Component({
  selector: 'lc-root',
  imports: [
    FormsModule,
    DataSourcesComponent,
    InspectorComponent,
    IssuesComponent,
    JsonViewComponent,
    OutlineComponent,
    PaletteComponent,
    PreviewComponent,
    TextsComponent,
    NzButtonModule,
    NzDropdownModule,
    NzIconModule,
    NzMenuModule,
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
  protected readonly i18n = inject(I18n);
  private readonly confirmation = inject(Confirmation);
  private readonly notifier = inject(Notifier);
  private readonly themes = inject(ThemeService);
  protected readonly languages = LANGUAGES;

  protected readonly viewIndex = computed(() => VIEWS.indexOf(this.store.view()));
  protected readonly warningCount = computed(() => this.store.issues().length - this.store.errorCount());
  protected readonly showIssues = signal(true);

  /** Schermate di esempio (`examples/index.json`, scritto da tools/copy-examples.mjs). */
  protected readonly examples = resource({
    loader: async (): Promise<string[]> => {
      const response = await fetch('examples/index.json');
      const names = response.ok ? ((await response.json()) as string[]) : [];
      this.store.knownScreens.set(names);
      return names;
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
  }

  protected setView(index: number): void {
    this.store.view.set(VIEWS[index] ?? 'preview');
  }

  protected async newScreen(): Promise<void> {
    if (await this.confirmation.confirm(this.i18n.t('ed.confirmReplace'))) this.store.newScreen();
  }

  protected async openExample(name: string): Promise<void> {
    if (!(await this.confirmation.confirm(this.i18n.t('ed.confirmReplace')))) return;
    try {
      const response = await fetch(`examples/${encodeURIComponent(name)}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.store.load((await response.json()) as Json);
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
      this.store.load(doc);
      this.notifier.toast(this.i18n.t('ed.opened', { name: file.name }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  protected exportFile(): void {
    const doc = this.store.doc();
    const name = isObject(doc) && typeof doc['screen'] === 'string' && doc['screen'] ? doc['screen'] : 'schermata';
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
    if (ctrl && key === 'z' && !event.shiftKey) return this.handled(event, () => this.store.undo());
    if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) return this.handled(event, () => this.store.redo());
    if (isEditable(event.target) || document.querySelector('.cdk-overlay-container .ant-modal-wrap')) return;
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

  private handled(event: KeyboardEvent, action: () => void): void {
    event.preventDefault();
    action();
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
