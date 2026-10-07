import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { NavigationService } from '../navigation.service';

/** Pagina iniziale: porta alla destinazione predefinita dell'utente, oppure spiega che non ha funzioni disponibili. */
@Component({
  selector: 'lc-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (problems().length) {
      <div role="alert"><p>Il menu non è valido:</p><ul>@for (p of problems(); track p) { <li>{{ p }}</li> }</ul></div>
    } @else if (empty()) {
      <p role="status">Nessuna funzione disponibile per il tuo profilo.</p>
    } @else {
      <p role="status">Caricamento…</p>
    }
  `,
})
export class HomePage {
  private readonly navigation = inject(NavigationService);
  protected readonly problems = this.navigation.problems;
  protected readonly empty = signal(false);

  constructor() {
    effect(() => {
      const runtime = this.navigation.runtime();
      if (!runtime) return;
      // Legge i casi d'uso nell'effect: se cambiano i permessi riprova.
      runtime.useCases();
      untracked(() => this.empty.set(!this.navigation.openDefault()));
    });
  }
}
