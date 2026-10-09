import { ChangeDetectionStrategy, Component, DestroyRef, Injector, effect, inject, input, signal, untracked } from '@angular/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import type { ScreenDefinition } from 'schema';
import { Authorization, Confirmation, DataClient, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider } from './ports';
import { NodeHostComponent } from './node-host.component';
import { ScreenRuntime } from './screen-runtime';

/** Mostra una schermata già validata: crea il runtime, controlla `requires` e disegna i componenti di primo livello. */
@Component({
  selector: 'lc-screen',
  imports: [NodeHostComponent, NzAlertModule, NzTypographyModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    h1 { margin: 0 0 var(--lc-gap, 12px); }
    .stack { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }
  `,
  template: `
    @if (runtime(); as rt) {
      @if (rt.allowed()) {
        @if (rt.definition.title) {
          <h1 nz-typography>{{ rt.definition.title }}</h1>
        }
        <div class="stack">
          @for (node of rt.definition.components; track $index) {
            <lc-node [node]="node" [runtime]="rt" />
          }
        </div>
      } @else {
        <div role="alert"><nz-alert nzType="error" nzShowIcon nzMessage="Non hai i permessi per visualizzare questa schermata." /></div>
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
  private readonly confirmation = inject(Confirmation, { optional: true });

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
              confirmation: this.confirmation,
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
