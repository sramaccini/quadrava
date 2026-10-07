import { ChangeDetectionStrategy, Component, computed, effect, inject, resource, signal } from '@angular/core';
import { ExpressionEngine } from 'expressions';
import { ScreenComponent, ThemeService, checkScreenExpressions } from 'core';
import { validateScreen, validateTheme, type ScreenDefinition, type ThemeDefinition } from 'schema';
import { DEMO_PROFILES, DemoDiagnostics, DemoNavigator, DemoNotifier, DemoSession } from '../demo/demo-ports';

const THEMES = ['chiaro', 'scuro'];

type Loaded = { ok: true; definition: ScreenDefinition } | { ok: false; issues: string[] };

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/** Contenitore della demo: scelta di profilo e tema, caricamento e controllo della schermata, notifiche. */
@Component({
  selector: 'lc-root',
  imports: [ScreenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(DemoSession);
  protected readonly notifier = inject(DemoNotifier);
  protected readonly diagnostics = inject(DemoDiagnostics);
  private readonly navigator = inject(DemoNavigator);
  private readonly themeService = inject(ThemeService);

  protected readonly profiles = Object.keys(DEMO_PROFILES);
  protected readonly themes = THEMES;
  protected readonly themeName = signal(THEMES[0]);
  protected readonly target = this.navigator.target;
  protected readonly permissions = computed(() => DEMO_PROFILES[this.session.username()] ?? []);

  /** Carica la schermata richiesta, la valida contro lo schema e controlla le espressioni prima di mostrarla. */
  protected readonly screen = resource<Loaded, string>({
    params: () => this.target().screen,
    loader: async ({ params: name }): Promise<Loaded> => {
      const document = await fetchJson(`examples/${encodeURIComponent(name)}.json`);
      const result = validateScreen(document);
      if (!result.valid) return { ok: false, issues: result.issues.map((i) => `${i.path} ${i.message}`) };
      const engine = new ExpressionEngine({ can: () => false });
      const problems = checkScreenExpressions(result.value, engine);
      if (problems.length) return { ok: false, issues: problems.map((p) => `${p.path}: ${p.message}`) };
      return { ok: true, definition: result.value };
    },
  });

  constructor() {
    effect(() => {
      const name = this.themeName();
      void fetchJson(`examples/themes/${name}.json`).then((doc) => {
        const result = validateTheme(doc);
        if (result.valid) this.themeService.apply(result.value as ThemeDefinition);
      });
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
