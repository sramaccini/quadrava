import { ChangeDetectionStrategy, Component, DestroyRef, Injector, effect, inject, input, signal, untracked } from '@angular/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import type { ScreenDefinition } from 'schema';
import { Authorization, Confirmation, DataClient, FormDialog, Notifier, RuntimeDiagnostics, RuntimeTracer, ScreenNavigator, UserProvider } from './ports';
import { I18n } from './i18n';
import { NodeHostComponent } from './node-host.component';
import { ScreenRuntime } from './screen-runtime';

/** Mostra una schermata già validata: crea il runtime, controlla `requires` e disegna i componenti di primo livello. */
@Component({
  selector: 'lc-screen',
  imports: [NodeHostComponent, NzAlertModule, NzBreadCrumbModule, NzTypographyModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .page-header { padding: 16px var(--lc-content-padding, 24px) 20px; background: var(--lc-page-header-bg, #fff); color: var(--lc-page-header-text, inherit); border-bottom: 1px solid var(--lc-page-header-border, #e3e8ef); }
    nz-breadcrumb { display: block; margin-bottom: 8px; color: var(--lc-page-header-muted, #5d6b7a); }
    h1[nz-typography] { margin: 0; font-size: 24px; font-weight: 600; line-height: 1.3; color: inherit; }
    .description { margin: 4px 0 0; color: var(--lc-page-header-muted, #5d6b7a); }
    .page-body { padding: var(--lc-content-padding, 24px); }
    .stack { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }
  `,
  template: `
    @if (runtime(); as rt) {
      @if (rt.allowed()) {
        @if (rt.definition.title || breadcrumb().length) {
          <header class="page-header">
            @if (breadcrumb().length) {
              <nz-breadcrumb [nzAutoGenerate]="false" [attr.aria-label]="i18n.t('lc.breadcrumb')">
                @for (label of breadcrumb(); track $index) {
                  <nz-breadcrumb-item>{{ label }}</nz-breadcrumb-item>
                }
              </nz-breadcrumb>
            }
            @if (rt.definition.title) {
              <h1 nz-typography>{{ rt.text(rt.definition.title) }}</h1>
            }
            @if (rt.definition.description) {
              <p class="description">{{ rt.text(rt.definition.description) }}</p>
            }
          </header>
        }
        <div class="page-body">
          <div class="stack">
            @for (node of rt.definition.components; track $index) {
              <lc-node [node]="node" [runtime]="rt" />
            }
          </div>
        </div>
      } @else {
        <div class="page-body"><div role="alert"><nz-alert nzType="error" nzShowIcon [nzMessage]="i18n.t('lc.forbidden')" /></div></div>
      }
    }
  `,
})
export class ScreenComponent {
  readonly definition = input.required<ScreenDefinition>();
  readonly params = input<Record<string, unknown>>({});
  /** Percorso mostrato sopra il titolo (per esempio caso d'uso, gruppo, voce). Lo fornisce l'applicazione ospite. */
  readonly breadcrumb = input<readonly string[]>([]);

  readonly runtime = signal<ScreenRuntime | null>(null);

  private readonly injector = inject(Injector);
  private readonly authorization = inject(Authorization);
  private readonly userProvider = inject(UserProvider);
  private readonly data = inject(DataClient);
  private readonly navigator = inject(ScreenNavigator);
  private readonly notifier = inject(Notifier);
  private readonly diagnostics = inject(RuntimeDiagnostics, { optional: true });
  private readonly tracer = inject(RuntimeTracer, { optional: true });
  private readonly confirmation = inject(Confirmation, { optional: true });
  private readonly formDialog = inject(FormDialog, { optional: true });
  protected readonly i18n = inject(I18n);

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
              formDialog: this.formDialog,
              diagnostics: this.diagnostics,
              tracer: this.tracer,
              i18n: this.i18n,
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
