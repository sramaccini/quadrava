import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from 'components';
import { ThemeService, type VisibleLeaf } from 'core';
import { validateTheme } from 'schema';
import { DEMO_PROFILES, DemoDiagnostics, DemoNotifier, DemoSession } from '../demo/demo-ports';
import { NavigationService } from './navigation.service';

const THEMES = ['chiaro', 'scuro'];

/** Guscio dell'applicazione: barra superiore (profilo e tema della demo), menu laterale, contenuto e notifiche. */
@Component({
  selector: 'lc-root',
  imports: [RouterOutlet, SidebarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(DemoSession);
  protected readonly notifier = inject(DemoNotifier);
  protected readonly diagnostics = inject(DemoDiagnostics);
  protected readonly navigation = inject(NavigationService);
  private readonly themeService = inject(ThemeService);

  protected readonly profiles = Object.keys(DEMO_PROFILES);
  protected readonly themes = THEMES;
  protected readonly themeName = signal(THEMES[0]);
  protected readonly permissions = computed(() => DEMO_PROFILES[this.session.username()] ?? []);
  protected readonly active = computed(() => {
    const here = this.navigation.current();
    return here.screen ? { screen: here.screen, params: here.params } : null;
  });
  protected readonly hrefFor = (useCase: string, leaf: VisibleLeaf): string => this.navigation.href(useCase, leaf);

  constructor() {
    effect(() => {
      const name = this.themeName();
      void fetch(`examples/themes/${name}.json`)
        .then((response) => response.json())
        .then((doc: unknown) => {
          const result = validateTheme(doc);
          if (result.valid) this.themeService.apply(result.value);
        });
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
