import { Injectable, signal } from '@angular/core';
import type { PreviewEvent } from './protocol';

/** Registro dell'anteprima, lato editor: richieste, navigazioni e segnalazioni arrivate dall'iframe. */
@Injectable({ providedIn: 'root' })
export class PreviewLog {
  readonly events = signal<PreviewEvent[]>([]);

  add(event: PreviewEvent): void {
    this.events.update((list) => [...list, event].slice(-100));
  }

  clear(): void {
    this.events.set([]);
  }
}
