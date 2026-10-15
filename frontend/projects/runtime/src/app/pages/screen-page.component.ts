import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ExpressionEngine } from 'expressions';
import { DefinitionSource, I18n, RuntimeDiagnostics, ScreenComponent, checkScreenExpressions } from 'core';
import { NavigationService } from '../navigation.service';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { validateScreen, type ScreenDefinition } from 'schema';

type Loaded = { ok: true; definition: ScreenDefinition } | { ok: false; issues: string[] } | { ok: false; failed: 'lc.screenNotFound' | 'lc.screenLoadFailed' };

/** Pagina del router: carica (dalla fonte delle definizioni) la schermata indicata nell'URL, la valida e la mostra con i parametri della query. */
@Component({
  selector: 'lc-screen-page',
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
export class ScreenPage {
  private readonly route = inject(ActivatedRoute);
  private readonly pathParams = toSignal(this.route.paramMap, { requireSync: true });
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly i18n = inject(I18n);
  private readonly navigation = inject(NavigationService);
  private readonly definitions = inject(DefinitionSource);
  private readonly diagnostics = inject(RuntimeDiagnostics, { optional: true });

  /** Percorso nel menu (area, gruppi, voce) mostrato come briciole di pane sopra il titolo. */
  protected readonly breadcrumb = computed<string[]>(() => {
    const here = this.navigation.current();
    const runtime = this.navigation.runtime();
    if (!runtime || !here.area || !here.screen) return [];
    return runtime.trail(here.area, here.screen, here.params) ?? [];
  });

  protected readonly name = computed(() => this.pathParams().get('screen') ?? '');
  protected readonly params = computed<Record<string, unknown>>(() => {
    const query = this.queryParams();
    return Object.fromEntries(query.keys.map((key) => [key, query.get(key)]));
  });

  protected readonly screen = resource<Loaded, string>({
    params: () => this.name(),
    loader: async ({ params: name }): Promise<Loaded> => {
      let document: unknown;
      try {
        document = await this.definitions.screen(name);
      } catch (e) {
        // All'utente un messaggio comprensibile; il dettaglio tecnico va alle segnalazioni.
        this.diagnostics?.report({ screen: name, source: 'caricamento schermata', error: e instanceof Error ? e.message : String(e) });
        const status = (e as { status?: unknown } | null)?.status;
        return { ok: false, failed: status === 404 || status === 403 ? 'lc.screenNotFound' : 'lc.screenLoadFailed' };
      }
      const result = validateScreen(document);
      if (!result.valid) return { ok: false, issues: result.issues.map((i) => `${i.path} ${i.message}`) };
      const problems = checkScreenExpressions(result.value, new ExpressionEngine({ can: () => false }));
      if (problems.length) return { ok: false, issues: problems.map((p) => `${p.path}: ${p.message}`) };
      return { ok: true, definition: result.value };
    },
  });
}
