import { Injectable, signal } from '@angular/core';
import type { PreviewEvent } from './protocol';

/** Log of a preview, on the editor side: requests, navigations and reports from its iframe (one per preview). */
@Injectable()
export class PreviewLog {
  readonly events = signal<PreviewEvent[]>([]);

  add(event: PreviewEvent): void {
    this.events.update((list) => [...list, event].slice(-100));
  }

  clear(): void {
    this.events.set([]);
  }
}
