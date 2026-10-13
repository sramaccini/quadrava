import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import type { ScreenDefinition } from 'schema';
import { getIn, isObject, type Json } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { ThemeStore } from '../model/theme-store';
import { JsonFieldComponent } from '../ui/json-field.component';
import { PreviewFrameComponent } from './preview-frame.component';
import { PreviewLog } from './preview-log';
import { previewState, type PreviewState } from './protocol';

/** Pausa dopo l'ultima modifica prima di ridisegnare l'anteprima (ricrearla a ogni lettera sarebbe inutile e lento). */
const DEBOUNCE_MS = 250;

/** Larghezze dell'anteprima, per provare le fasce del guscio. */
const WIDTHS: Record<string, number | null> = { desktop: null, tablet: 768, mobile: 375 };

/**
 * Anteprima dal vivo della schermata: la barra (larghezza, permessi, parametri, registro, selezione, ricarica) sta
 * nell'editor, il disegno nell'iframe isolato (vedi `ed-preview-frame`), con il tema in modifica. Se il documento ha
 * errori resta l'ultima versione valida, con un avviso. Un componente scelto nell'anteprima si seleziona nella
 * struttura; il nodo selezionato nella struttura è evidenziato nell'anteprima.
 */
@Component({
  selector: 'ed-preview',
  imports: [FormsModule, JsonFieldComponent, PreviewFrameComponent, NzAlertModule, NzButtonModule, NzIconModule, NzSegmentedModule, NzSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './preview.component.scss',
  templateUrl: './preview.component.html',
})
export class PreviewComponent {
  protected readonly store = inject(EditorStore);
  private readonly theme = inject(ThemeStore);
  protected readonly log = inject(PreviewLog);
  protected readonly i18n = inject(I18n);

  /** Definizione disegnata: l'ultima valida, aggiornata dopo una breve pausa. */
  protected readonly shown = signal<ScreenDefinition | null>(this.store.definition());
  /** Cambia per ricreare la schermata da capo (pulsante Ricarica, permessi). */
  protected readonly version = signal(0);
  protected readonly grantAll = signal(true);
  protected readonly width = signal('desktop');
  protected readonly widthOptions = computed(() => Object.keys(WIDTHS).map((value) => ({ value, label: this.i18n.t('ed.preview.' + value) })));
  protected readonly frameWidth = computed(() => WIDTHS[this.width()]);
  protected readonly params = signal<Record<string, unknown>>({});
  protected readonly showLog = signal(false);
  protected readonly showParams = signal(false);
  protected readonly stale = computed(() => this.store.definition() === null && this.shown() !== null);
  /** In modalità selezione ogni clic seleziona il componente invece di attivarlo. */
  protected readonly selectMode = signal(false);
  /** Identificativo del nodo selezionato, da evidenziare nel disegno. */
  private readonly selectedId = computed(() => {
    const value = getIn(this.store.doc(), this.store.selection());
    return isObject(value) && typeof value['id'] === 'string' ? value['id'] : null;
  });

  /** Quello che l'iframe disegna. */
  protected readonly state = computed<PreviewState>(() =>
    previewState({
      screen: this.shown(),
      theme: this.theme.definition(),
      granted: this.grantAll() ? null : [],
      samples: this.store.samples(),
      params: this.params(),
      locale: this.i18n.locale(),
      translations: this.store.translations(),
      selectedId: this.selectedId(),
      selectMode: this.selectMode(),
      version: this.version(),
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

  /** Un componente scelto nell'anteprima: si seleziona nella struttura. */
  protected picked(id: string): void {
    const path = this.store.pathOfId(id);
    if (path) this.store.select(path);
  }

  protected reload(): void {
    this.log.clear();
    this.version.update((v) => v + 1);
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
