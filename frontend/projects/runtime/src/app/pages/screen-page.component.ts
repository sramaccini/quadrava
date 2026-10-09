import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ExpressionEngine } from 'expressions';
import { ScreenComponent, checkScreenExpressions } from 'core';
import { NavigationService } from '../navigation.service';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { validateScreen, type ScreenDefinition } from 'schema';

type Loaded = { ok: true; definition: ScreenDefinition } | { ok: false; issues: string[] };

/** Pagina del router: carica la schermata indicata nell'URL, la valida e la mostra con i parametri della query. */
@Component({
  selector: 'lc-screen-page',
  imports: [ScreenComponent, NzAlertModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.pad { padding: var(--lc-content-padding, 24px); }`,
  template: `
    @if (screen.error(); as e) {
      <div class="pad" role="alert"><nz-alert nzType="error" nzShowIcon [nzMessage]="'Schermata non caricata: ' + e" /></div>
    } @else if (screen.value(); as loaded) {
      @if (loaded.ok) {
        <lc-screen [definition]="loaded.definition" [params]="params()" [breadcrumb]="breadcrumb()" />
      } @else {
        <div class="pad" role="alert">
          <nz-alert nzType="error" nzShowIcon nzMessage="La schermata non è valida:" [nzDescription]="issues" />
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
      <p class="pad" role="status">Caricamento…</p>
    }
  `,
})
export class ScreenPage {
  private readonly route = inject(ActivatedRoute);
  private readonly pathParams = toSignal(this.route.paramMap, { requireSync: true });
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  private readonly navigation = inject(NavigationService);

  /** Percorso nel menu (caso d'uso, gruppi, voce) mostrato come briciole di pane sopra il titolo. */
  protected readonly breadcrumb = computed<string[]>(() => {
    const here = this.navigation.current();
    const runtime = this.navigation.runtime();
    if (!runtime || !here.useCase || !here.screen) return [];
    return runtime.trail(here.useCase, here.screen, here.params) ?? [];
  });

  protected readonly name = computed(() => this.pathParams().get('screen') ?? '');
  protected readonly params = computed<Record<string, unknown>>(() => {
    const query = this.queryParams();
    return Object.fromEntries(query.keys.map((key) => [key, query.get(key)]));
  });

  protected readonly screen = resource<Loaded, string>({
    params: () => this.name(),
    loader: async ({ params: name }): Promise<Loaded> => {
      const response = await fetch(`examples/${encodeURIComponent(name)}.json`);
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      const result = validateScreen(await response.json());
      if (!result.valid) return { ok: false, issues: result.issues.map((i) => `${i.path} ${i.message}`) };
      const problems = checkScreenExpressions(result.value, new ExpressionEngine({ can: () => false }));
      if (problems.length) return { ok: false, issues: problems.map((p) => `${p.path}: ${p.message}`) };
      return { ok: true, definition: result.value };
    },
  });
}
