import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterEveryRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, ScreenComponent } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import type { ScreenDefinition } from 'schema';
import { getIn, isObject, type Json } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { JsonFieldComponent } from '../ui/json-field.component';
import { PreviewLog, PreviewSession } from './preview-ports';

/** Pausa dopo l'ultima modifica prima di ridisegnare l'anteprima (ricrearla a ogni lettera sarebbe inutile e lento). */
const DEBOUNCE_MS = 250;

/** Larghezze dell'anteprima, per provare le fasce del guscio. */
const WIDTHS: Record<string, number | null> = { desktop: null, tablet: 768, mobile: 375 };

/**
 * Anteprima dal vivo: la schermata disegnata dal runtime vero (`lc-screen`) con le porte dell'anteprima. Se il
 * documento ha errori resta l'ultima versione valida, con un avviso. Si possono simulare permessi, larghezza e
 * parametri della schermata; il registro mostra richieste, navigazioni e segnalazioni.
 *
 * Collegamento con la struttura: il nodo selezionato è evidenziato nel disegno; Alt+clic su un componente (o un clic
 * in modalità selezione) lo seleziona invece di attivarlo. Funziona per i nodi con `id`, che l'editor assegna sempre.
 */
@Component({
  selector: 'ed-preview',
  imports: [FormsModule, ScreenComponent, JsonFieldComponent, NzAlertModule, NzButtonModule, NzIconModule, NzSegmentedModule, NzSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './preview.component.scss',
  templateUrl: './preview.component.html',
})
export class PreviewComponent {
  protected readonly store = inject(EditorStore);
  protected readonly session = inject(PreviewSession);
  protected readonly log = inject(PreviewLog);
  protected readonly i18n = inject(I18n);

  /** Definizione disegnata: l'ultima valida, aggiornata dopo una breve pausa. */
  protected readonly shown = signal<ScreenDefinition | null>(this.store.definition());
  /** Cambia per ricreare la schermata da capo (pulsante Ricarica, permessi). */
  protected readonly version = signal(0);
  protected readonly width = signal('desktop');
  protected readonly widthOptions = computed(() => Object.keys(WIDTHS).map((value) => ({ value, label: this.i18n.t('ed.preview.' + value) })));
  protected readonly frameWidth = computed(() => WIDTHS[this.width()]);
  protected readonly params = signal<Record<string, unknown>>({});
  protected readonly showLog = signal(false);
  protected readonly showParams = signal(false);
  protected readonly stale = computed(() => this.store.definition() === null && this.shown() !== null);
  /** In modalità selezione ogni clic seleziona il componente invece di attivarlo. */
  protected readonly selectMode = signal(false);
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  /** Riquadro che evidenzia il nodo selezionato, in coordinate del contenuto dell'anteprima. */
  protected readonly highlight = signal<Box | null>(null);
  /** Identificativo del nodo selezionato, da evidenziare nel disegno. */
  private readonly selectedId = computed(() => {
    const value = getIn(this.store.doc(), this.store.selection());
    return isObject(value) && typeof value['id'] === 'string' ? value['id'] : null;
  });

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const definition = this.store.definition();
      clearTimeout(timer);
      if (definition) timer = setTimeout(() => this.shown.set(definition), DEBOUNCE_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));

    // In fase di cattura, così il clic che seleziona non arriva al pulsante o al collegamento del componente.
    effect((onCleanup) => {
      const frame = this.frame()?.nativeElement;
      if (!frame) return;
      const listener = (event: MouseEvent): void => this.pick(event);
      frame.addEventListener('click', listener, true);
      onCleanup(() => frame.removeEventListener('click', listener, true));
    });

    // Riquadro sul nodo selezionato, ricalcolato dopo ogni disegno: i componenti cambiano dimensione quando arrivano
    // i dati. Un riquadro sopra il disegno, invece di un bordo sul componente, non sposta nulla.
    let scrolledTo: string | null = null;
    afterEveryRender(() => {
      const frame = this.frame()?.nativeElement;
      const id = this.selectedId();
      const node = frame && id ? frame.querySelector(`lc-node[data-node-id="${CSS.escape(id)}"]`) : null;
      const box = frame && node ? boxOf(node, frame) : null;
      if (!sameBox(box, this.highlight())) this.highlight.set(box);
      if (node && id !== scrolledTo) node.scrollIntoView?.({ block: 'nearest' });
      scrolledTo = node ? id : null;
    });
  }

  /** Clic nel disegno, in fase di cattura: con Alt o in modalità selezione seleziona il nodo e non lo attiva. */
  private pick(event: MouseEvent): void {
    if (!event.altKey && !this.selectMode()) return;
    const node = (event.target as Element | null)?.closest?.('lc-node[data-node-id]');
    event.preventDefault();
    event.stopPropagation();
    const path = node ? this.store.pathOfId(node.getAttribute('data-node-id')!) : null;
    if (path) this.store.select(path);
  }

  protected reload(): void {
    this.log.clear();
    this.version.update((v) => v + 1);
  }

  protected setGrantAll(value: boolean): void {
    this.session.grantAll.set(value);
    this.reload();
  }

  protected setParams(value: Json | undefined): void {
    this.params.set(isObject(value) ? value : {});
    this.reload();
  }
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function boxOf(node: Element, frame: HTMLElement): Box | null {
  const r = node.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  const f = frame.getBoundingClientRect();
  return { top: r.top - f.top, left: r.left - f.left, width: r.width, height: r.height };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}
