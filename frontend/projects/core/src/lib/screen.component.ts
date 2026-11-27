import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzTypographyModule } from 'ng-zorro-antd/typography';
import type { ScreenDefinition } from 'schema';
import { SETTINGS_VALUES, Authorization, ClipboardWriter, Confirmation, DataClient, FormDialog, FormPopover, ViewDialog, LiveUpdates, Notifier, RuntimeDiagnostics, RuntimeTracer, ScreenNavigator, UserProvider } from './ports';
import { I18n } from './i18n';
import { NodeHostComponent } from './node-host.component';
import { ScreenRuntime } from './screen-runtime';
import { ScreenTitle } from './screen-title';
import { ValidatorRegistry } from './validators';

/** Item of the breadcrumb as drawn: the label resolved and, for a link, the screen with its parameters. */
interface Crumb {
  readonly label: string;
  readonly screen?: string;
  readonly params?: Record<string, unknown>;
  readonly href?: string | null;
}

/** Shows an already validated screen: creates the runtime, checks `requires` and draws the top-level components. */
@Component({
  selector: 'lc-screen',
  imports: [NodeHostComponent, NzAlertModule, NzBreadCrumbModule, NzTypographyModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .page-header { padding: 16px var(--lc-content-padding, 24px) 20px; background: var(--lc-page-header-bg, #fff); color: var(--lc-page-header-text, inherit); border-bottom: 1px solid var(--lc-page-header-border, #e3e8ef); }
    nz-breadcrumb { display: block; margin-bottom: 6px; font-size: 10px; line-height: 14px; font-weight: 500; letter-spacing: 0.06em; color: var(--lc-page-header-muted, #5d6b7a); }
    nz-breadcrumb ::ng-deep .ant-breadcrumb-link { color: inherit; }
    nz-breadcrumb ::ng-deep .ant-breadcrumb-separator { margin-inline: 6px; color: var(--lc-color-primary, #1677ff); opacity: 0.7; }
    nz-breadcrumb ::ng-deep nz-breadcrumb-item:last-child .ant-breadcrumb-link { color: var(--lc-color-primary, #1677ff); font-weight: 600; }
    nz-breadcrumb a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
    nz-breadcrumb a:hover { color: var(--lc-color-primary, #1677ff); }
    h1[nz-typography] { margin: 0; font-size: 24px; font-weight: 600; line-height: 1.3; color: inherit; }
    .description { margin: 4px 0 0; color: var(--lc-page-header-muted, #5d6b7a); }
    .page-body { padding: var(--lc-content-padding, 24px); }
    .stack { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }
  `,
  template: `
    @if (runtime(); as rt) {
      @if (rt.allowed()) {
        @if (rt.definition.title || crumbs().length) {
          <header class="page-header">
            @if (crumbs().length) {
              <nz-breadcrumb [nzAutoGenerate]="false" nzSeparator="›" [attr.aria-label]="i18n.t('lc.breadcrumb')">
                @for (crumb of crumbs(); track $index; let last = $last) {
                  <nz-breadcrumb-item>
                    @if (last) {
                      <span aria-current="page">{{ crumb.label }}</span>
                    } @else if (crumb.screen) {
                      <a [attr.href]="crumb.href ?? '#'" (click)="follow($event, crumb)">{{ crumb.label }}</a>
                    } @else {
                      {{ crumb.label }}
                    }
                  </nz-breadcrumb-item>
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
  /**
   * Path shown above the title (for example area, group, item). Provided by the host application; the `breadcrumb` of
   * the definition, when there is one, takes its place.
   */
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
  private readonly viewDialog = inject(ViewDialog, { optional: true });
  private readonly formPopover = inject(FormPopover, { optional: true });
  private readonly clipboard = inject(ClipboardWriter, { optional: true });
  private readonly live = inject(LiveUpdates, { optional: true });
  protected readonly i18n = inject(I18n);
  private readonly validators = inject(ValidatorRegistry);
  private readonly settings = inject(SETTINGS_VALUES);
  private readonly screenTitle = inject(ScreenTitle);

  /** The breadcrumb declared by the screen (labels and parameters resolved), otherwise the one of the host. */
  protected readonly crumbs = computed<readonly Crumb[]>(() => {
    const rt = this.runtime();
    const declared = rt?.definition.breadcrumb;
    if (!rt || !declared?.length) return this.breadcrumb().map((label) => ({ label }));
    return declared.map((item) => {
      const label = rt.text(item.label);
      if (!item.navigate) return { label };
      const resolved = rt.resolveValue(item.params ?? {});
      const params = resolved && typeof resolved === 'object' ? (resolved as Record<string, unknown>) : {};
      return { label, screen: item.navigate, params, href: this.navigator.href?.(item.navigate, params) ?? null };
    });
  });

  /** A plain click navigates inside the application; with a modifier the browser opens the address (a new tab). */
  protected follow(event: MouseEvent, crumb: Crumb): void {
    if (crumb.href && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)) return;
    event.preventDefault();
    if (crumb.screen) this.navigator.navigate(crumb.screen, crumb.params ?? {});
  }

  constructor() {
    // The title of the screen, for the application (the browser tab).
    effect(() => {
      const rt = this.runtime();
      const title = rt?.definition.title ? rt.text(rt.definition.title) : '';
      untracked(() => this.screenTitle.current.set(title));
    });
    inject(DestroyRef).onDestroy(() => this.screenTitle.current.set(''));
    effect(() => {
      const definition = this.definition();
      const params = this.params();
      // Creating the runtime registers its own effects: it must happen outside the reactive context of this effect.
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
              viewDialog: this.viewDialog,
              formPopover: this.formPopover,
              clipboard: this.clipboard,
              diagnostics: this.diagnostics,
              tracer: this.tracer,
              live: this.live,
              i18n: this.i18n,
              validators: this.validators,
              settings: this.settings,
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
