import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, ScreenComponent } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import type { ScreenDefinition } from 'schema';
import { isObject, type Json } from '../model/doc-ops';
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

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const definition = this.store.definition();
      clearTimeout(timer);
      if (definition) timer = setTimeout(() => this.shown.set(definition), DEBOUNCE_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
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
