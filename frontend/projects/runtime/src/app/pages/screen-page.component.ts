import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ExpressionEngine } from 'expressions';
import { ScreenComponent, checkScreenExpressions } from 'core';
import { validateScreen, type ScreenDefinition } from 'schema';

type Loaded = { ok: true; definition: ScreenDefinition } | { ok: false; issues: string[] };

/** Pagina del router: carica la schermata indicata nell'URL, la valida e la mostra con i parametri della query. */
@Component({
  selector: 'lc-screen-page',
  imports: [ScreenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.problem { border: 1px solid var(--lc-color-danger); color: var(--lc-color-danger); padding: 12px; border-radius: var(--lc-radius); }`,
  template: `
    @if (screen.error(); as e) {
      <p class="problem" role="alert">Schermata non caricata: {{ e }}</p>
    } @else if (screen.value(); as loaded) {
      @if (loaded.ok) {
        <lc-screen [definition]="loaded.definition" [params]="params()" />
      } @else {
        <div class="problem" role="alert">
          <p>La schermata non è valida:</p>
          <ul>
            @for (issue of loaded.issues; track issue) {
              <li>{{ issue }}</li>
            }
          </ul>
        </div>
      }
    } @else {
      <p role="status">Caricamento…</p>
    }
  `,
})
export class ScreenPage {
  private readonly route = inject(ActivatedRoute);
  private readonly pathParams = toSignal(this.route.paramMap, { requireSync: true });
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

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
