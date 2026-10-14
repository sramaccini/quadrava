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

/** Pausa dopo l'ultima modifica prima di ridisegnare l'anteprima (ricrearla a ogni lettera sarebbe inutile e lento). */
const DEBOUNCE_MS = 250;

/** Larghezze dell'anteprima, per provare le fasce del guscio. */
const WIDTHS: Record<string, number | null> = { desktop: null, tablet: 768, mobile: 375 };
const WIDTH_ICONS: Record<string, string> = { desktop: 'desktop', tablet: 'tablet', mobile: 'mobile' };

/**
 * Anteprima dal vivo della schermata: la barra (larghezza, permessi, parametri, registro, selezione, ricarica) sta
 * nell'editor, il disegno nell'iframe isolato (vedi `ed-preview-frame`), con il tema in modifica. Se il documento ha
 * errori resta l'ultima versione valida, con un avviso. Un componente scelto nell'anteprima si seleziona nella
 * struttura; il nodo selezionato nella struttura è evidenziato nell'anteprima.
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

  /** Definizione disegnata: l'ultima valida, aggiornata dopo una breve pausa. */
  protected readonly shown = signal<ScreenDefinition | null>(this.store.definition());
  /** Cambia per ricreare la schermata da capo (pulsante Ricarica, permessi). */
  protected readonly version = signal(0);
  protected readonly grantAll = signal(true);
  /** Letture dai servizi veri invece dei dati di esempio (le scritture restano bloccate). */
  protected readonly liveData = signal(false);
  protected readonly width = signal('desktop');
  /** Una voce per larghezza: icona, e nome con i pixel per suggerimento e lettori di schermo. */
  protected readonly widthOptions = computed(() =>
    Object.entries(WIDTHS).map(([value, px]) => ({
      value,
      icon: WIDTH_ICONS[value],
      label: px ? this.i18n.t('ed.preview.widthPx', { name: this.i18n.t('ed.preview.' + value), px }) : this.i18n.t('ed.preview.' + value),
    })),
  );
  protected readonly frameWidth = computed(() => WIDTHS[this.width()]);
  protected readonly params = signal<Record<string, unknown>>({});
  /** Lingua scelta per l'anteprima: segue quella dell'editor finché non se ne sceglie un'altra (anche una aggiunta nei testi). */
  private readonly chosenLocale = linkedSignal(() => this.i18n.locale());
  /** Lingua dell'anteprima: quella scelta, se esiste ancora (una lingua tolta nei testi fa tornare a quella dell'editor). */
  protected readonly locale = computed(() => (this.store.languages().includes(this.chosenLocale()) ? this.chosenLocale() : this.i18n.locale()));
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
      locale: this.locale(),
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
   * Un componente della tavolozza rilasciato sul disegno: si inserisce prima, dopo o dentro il nodo indicato, con le
   * stesse regole della struttura (in fondo alla schermata se il rilascio non è su un nodo).
   */
  protected dropped(event: { kind: string; targetId: string | null; zone: DropZone }): void {
    const doc = this.store.doc();
    const path = event.targetId ? this.store.pathOfId(event.targetId) : null;
    const components = isObject(doc) && Array.isArray(doc['components']) ? doc['components'] : [];
    const point = path ? dropPoint(doc, path, event.zone) : { list: ['components'], index: components.length };
    if (point) this.store.addNode(event.kind, point);
  }

  /** Un componente già presente spostato sul disegno: stesse regole della struttura (mai dentro sé stesso). */
  protected moved(event: { id: string; targetId: string | null; zone: DropZone }): void {
    const doc = this.store.doc();
    const from = this.store.pathOfId(event.id);
    if (!from) return;
    const target = event.targetId ? this.store.pathOfId(event.targetId) : null;
    const components = isObject(doc) && Array.isArray(doc['components']) ? doc['components'] : [];
    const point = target ? dropPoint(doc, target, event.zone, from) : { list: ['components'], index: components.length };
    if (point) this.store.moveNode(from, point.list, point.index);
  }

  /** La maniglia dell'anteprima: nuovo `span` (griglia) o `grow` (box) del componente. */
  protected resized(event: { id: string; property: ResizeProperty; value: number }): void {
    const path = this.store.pathOfId(event.id);
    if (path) this.store.setValue([...path, event.property], event.value);
  }

  /** Un componente scelto nell'anteprima: si seleziona nella struttura. */
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
