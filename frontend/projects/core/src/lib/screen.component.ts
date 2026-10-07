import { ChangeDetectionStrategy, Component, DestroyRef, Injector, effect, inject, input, signal, untracked } from '@angular/core';
import type { ScreenDefinition } from 'schema';
import { Authorization, DataClient, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider } from './ports';
import { NodeHostComponent } from './node-host.component';
import { ScreenRuntime } from './screen-runtime';

/** Mostra una schermata già validata: crea il runtime, controlla `requires` e disegna i componenti di primo livello. */
@Component({
  selector: 'lc-screen',
  imports: [NodeHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    h1 { font-size: 1.5em; margin: 0 0 var(--lc-gap, 12px); }
    .denied { padding: var(--lc-gap, 12px); border: 1px solid var(--lc-color-danger, #c62828); border-radius: var(--lc-radius, 6px); color: var(--lc-color-danger, #c62828); }
    .stack { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }
  `,
  template: `
    @if (runtime(); as rt) {
      @if (rt.allowed()) {
        @if (rt.definition.title) {
          <h1>{{ rt.definition.title }}</h1>
        }
        <div class="stack">
          @for (node of rt.definition.components; track $index) {
            <lc-node [node]="node" [runtime]="rt" />
          }
        </div>
      } @else {
        <p class="denied" role="alert">Non hai i permessi per visualizzare questa schermata.</p>
      }
    }
  `,
})
export class ScreenComponent {
  readonly definition = input.required<ScreenDefinition>();
  readonly params = input<Record<string, unknown>>({});

  readonly runtime = signal<ScreenRuntime | null>(null);

  private readonly injector = inject(Injector);
  private readonly authorization = inject(Authorization);
  private readonly userProvider = inject(UserProvider);
  private readonly data = inject(DataClient);
  private readonly navigator = inject(ScreenNavigator);
  private readonly notifier = inject(Notifier);
  private readonly diagnostics = inject(RuntimeDiagnostics, { optional: true });

  constructor() {
    effect(() => {
      const definition = this.definition();
      const params = this.params();
      // La creazione del runtime registra effect propri: va fatta fuori dal contesto reattivo di questo effect.
      untracked(() => {
        this.runtime()?.destroy();
        this.runtime.set(
          new ScreenRuntime(
            definition,
            {
              authorization: this.authorization,
              userProvider: this.userProvider,
              data: this.data,
              navigator: this.navigator,
              notifier: this.notifier,
              diagnostics: this.diagnostics,
            },
            this.injector,
            params,
          ),
        );
      });
    });
    inject(DestroyRef).onDestroy(() => this.runtime()?.destroy());
  }
}
