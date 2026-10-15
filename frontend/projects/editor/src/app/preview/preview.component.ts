import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { dropPoint } from '../model/drop';
import type { DropZone, ResizeProperty } from './protocol';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ScreenDefinition } from 'schema';
import { getIn, isObject, type Json } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { ThemeStore } from '../model/theme-store';
import { JsonFieldComponent } from '../ui/json-field.component';
import { PreviewFrameComponent } from './preview-frame.component';
import { PreviewLog } from './preview-log';
import { previewState, type PreviewState } from './protocol';

/** Pause after the last change before redrawing the preview (recreating it at every letter would be useless and slow). */
const DEBOUNCE_MS = 250;

/** Widths of the preview, to try the bands of the shell. */
const WIDTHS: Record<string, number | null> = { desktop: null, tablet: 768, mobile: 375 };
const WIDTH_ICONS: Record<string, string> = { desktop: 'desktop', tablet: 'tablet', mobile: 'mobile' };

/**
 * Live preview of the screen: the bar (width, permissions, parameters, log, selection, reload) is
 * in the editor, the drawing in the isolated iframe (see `ed-preview-frame`), with the theme being edited. If the document has
 * errors the last valid version stays, with a warning. A component chosen in the preview is selected in the
 * outline; the node selected in the outline is highlighted in the preview.
 */
@Component({
  selector: 'ed-preview',
  imports: [FormsModule, JsonFieldComponent, PreviewFrameComponent, NzAlertModule, NzButtonModule, NzIconModule, NzSelectModule, NzSwitchModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './preview.component.scss',
  templateUrl: './preview.component.html',
})
export class PreviewComponent {
  protected readonly store = inject(EditorStore);
  private readonly theme = inject(ThemeStore);
  protected readonly log = inject(PreviewLog);
  protected readonly i18n = inject(I18n);

  /** Drawn definition: the last valid one, updated after a short pause. */
  protected readonly shown = signal<ScreenDefinition | null>(this.store.definition());
  /** Changes to recreate the screen from scratch (Reload button, permissions). */
  protected readonly version = signal(0);
  protected readonly grantAll = signal(true);
  /** Reads from the real services instead of the sample data (writes stay blocked). */
  protected readonly liveData = signal(false);
  protected readonly width = signal('desktop');
  /** One item per width: icon, and name with the pixels for tooltip and screen readers. */
  protected readonly widthOptions = computed(() =>
    Object.entries(WIDTHS).map(([value, px]) => ({
      value,
      icon: WIDTH_ICONS[value],
      label: px ? this.i18n.t('ed.preview.widthPx', { name: this.i18n.t('ed.preview.' + value), px }) : this.i18n.t('ed.preview.' + value),
    })),
  );
  protected readonly frameWidth = computed(() => WIDTHS[this.width()]);
  protected readonly params = signal<Record<string, unknown>>({});
  /** Language chosen for the preview: it follows the editor's until another one is chosen (also one added in the texts). */
  private readonly chosenLocale = linkedSignal(() => this.i18n.locale());
  /** Language of the preview: the chosen one, if it still exists (a language removed in the texts goes back to the editor's). */
  protected readonly locale = computed(() => (this.store.languages().includes(this.chosenLocale()) ? this.chosenLocale() : this.i18n.locale()));
  protected readonly showLog = signal(false);
  protected readonly showParams = signal(false);
  protected readonly stale = computed(() => this.store.definition() === null && this.shown() !== null);
  /** In selection mode every click selects the component instead of activating it. */
  protected readonly selectMode = signal(false);
  /** Identifier of the selected node, to highlight in the drawing. */
  private readonly selectedId = computed(() => {
    const value = getIn(this.store.doc(), this.store.selection());
    return isObject(value) && typeof value['id'] === 'string' ? value['id'] : null;
  });

  /** What the iframe draws. */
  protected readonly state = computed<PreviewState>(() =>
    previewState({
      screen: this.shown(),
      theme: this.theme.definition(),
      granted: this.grantAll() ? null : [],
      samples: this.store.samples(),
      params: this.params(),
      locale: this.locale(),
      defaultLocale: this.store.defaultLanguage(),
      translations: this.store.translations(),
      selectedId: this.selectedId(),
      selectMode: this.selectMode(),
      version: this.version(),
      liveData: this.liveData(),
    }),
  );

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const definition = this.store.definition();
      clearTimeout(timer);
      if (definition) timer = setTimeout(() => this.shown.set(definition), DEBOUNCE_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  /**
   * A palette component dropped on the drawing: it is inserted before, after or inside the given node, with the
   * same rules as the outline (at the end of the screen if the drop is not on a node).
   */
  protected dropped(event: { kind: string; targetId: string | null; zone: DropZone }): void {
    const doc = this.store.doc();
    const path = event.targetId ? this.store.pathOfId(event.targetId) : null;
    const components = isObject(doc) && Array.isArray(doc['components']) ? doc['components'] : [];
    const point = path ? dropPoint(doc, path, event.zone) : { list: ['components'], index: components.length };
    if (point) this.store.addNode(event.kind, point);
  }

  /** A component already there moved on the drawing: same rules as the outline (never inside itself). */
  protected moved(event: { id: string; targetId: string | null; zone: DropZone }): void {
    const doc = this.store.doc();
    const from = this.store.pathOfId(event.id);
    if (!from) return;
    const target = event.targetId ? this.store.pathOfId(event.targetId) : null;
    const components = isObject(doc) && Array.isArray(doc['components']) ? doc['components'] : [];
    const point = target ? dropPoint(doc, target, event.zone, from) : { list: ['components'], index: components.length };
    if (point) this.store.moveNode(from, point.list, point.index);
  }

  /** The handle of the preview: new `span` (grid) or `grow` (box) of the component. */
  protected resized(event: { id: string; property: ResizeProperty; value: number }): void {
    const path = this.store.pathOfId(event.id);
    if (path) this.store.setValue([...path, event.property], event.value);
  }

  /** A component chosen in the preview: it is selected in the outline. */
  protected picked(id: string): void {
    const path = this.store.pathOfId(id);
    if (path) this.store.select(path);
  }

  protected chooseLocale(locale: string): void {
    this.chosenLocale.set(locale);
  }

  protected reload(): void {
    this.log.clear();
    this.version.update((v) => v + 1);
  }

  protected setLiveData(value: boolean): void {
    this.liveData.set(value);
    this.reload();
  }

  protected setGrantAll(value: boolean): void {
    this.grantAll.set(value);
    this.reload();
  }

  protected setParams(value: Json | undefined): void {
    this.params.set(isObject(value) ? value : {});
    this.reload();
  }
}
