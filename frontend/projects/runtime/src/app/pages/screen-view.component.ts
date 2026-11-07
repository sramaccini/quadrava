import { ChangeDetectionStrategy, Component, inject, input, resource } from '@angular/core';
import { ExpressionEngine } from 'expressions';
import { DefinitionSource, I18n, RuntimeDiagnostics, ScreenComponent, checkScreenExpressions, loadDataSources } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { type ScreenDefinition } from 'schema';

type Loaded = { ok: true; definition: ScreenDefinition } | { ok: false; issues: string[] } | { ok: false; failed: 'lc.screenNotFound' | 'lc.screenLoadFailed' };

/**
 * A screen of the application by name: loads it from the definition source, validates it (schema and expressions),
 * resolves its references to the data sources of the application and shows it. Used by the router page and by the
 * sections of the settings dialog (ADR-25).
 */
@Component({
  selector: 'lc-screen-view',
  imports: [ScreenComponent, NzAlertModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.pad { padding: var(--lc-content-padding, 24px); }`,
  template: `
    @if (screen.value(); as loaded) {
      @if (loaded.ok) {
        <lc-screen [definition]="loaded.definition" [params]="params()" [breadcrumb]="breadcrumb()" />
      } @else if ('failed' in loaded) {
        <div class="pad" role="alert"><nz-alert nzType="error" nzShowIcon [nzMessage]="i18n.t(loaded.failed)" /></div>
      } @else {
        <div class="pad" role="alert">
          <nz-alert nzType="error" nzShowIcon [nzMessage]="i18n.t('app.screenInvalid')" [nzDescription]="issues" />
          <ng-template #issues>
            <ul>
              @for (issue of loaded.issues; track issue) {
                <li>{{ issue }}</li>
              }
            </ul>
          </ng-template>
        </div>
      }
    } @else {
      <p class="pad" role="status">{{ i18n.t('lc.loading') }}</p>
    }
  `,
})
export class ScreenView {
  /** Identifier of the screen. */
  readonly name = input.required<string>();
  readonly params = input<Record<string, unknown>>({});
  /** Path shown above the title (for example area, group, item). */
  readonly breadcrumb = input<readonly string[]>([]);

  protected readonly i18n = inject(I18n);
  private readonly definitions = inject(DefinitionSource);
  private readonly diagnostics = inject(RuntimeDiagnostics, { optional: true });

  protected readonly screen = resource<Loaded, string>({
    params: () => this.name(),
    loader: async ({ params: name }): Promise<Loaded> => {
      let document: unknown;
      try {
        document = await this.definitions.screen(name);
      } catch (e) {
        // To the user an understandable message; the technical detail goes to the reports.
        this.diagnostics?.report({ screen: name, source: 'screen loading', error: e instanceof Error ? e.message : String(e) });
        const status = (e as { status?: unknown } | null)?.status;
        return { ok: false, failed: status === 404 || status === 403 ? 'lc.screenNotFound' : 'lc.screenLoadFailed' };
      }
      // The precompiled validators are large: loaded when first needed, outside the initial bundle.
      const { validateScreen } = await import('schema/validation');
      const result = validateScreen(document);
      if (!result.valid) return { ok: false, issues: result.issues.map((i) => `${i.path} ${i.message}`) };
      const problems = checkScreenExpressions(result.value, new ExpressionEngine({ can: () => false }));
      if (problems.length) return { ok: false, issues: problems.map((p) => `${p.path}: ${p.message}`) };
      // References that do not resolve leave their data source out (fail-closed): the screen opens, the detail goes to the reports.
      const resolved = await loadDataSources(result.value, this.definitions);
      for (const issue of resolved.issues) this.diagnostics?.report({ screen: name, source: issue.path, error: issue.message });
      return { ok: true, definition: resolved.screen };
    },
  });
}
