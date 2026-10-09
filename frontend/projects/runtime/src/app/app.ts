import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { IconComponent, SidebarComponent } from 'components';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { ThemeService, type VisibleLeaf } from 'core';
import { validateTheme } from 'schema';
import { DEMO_PROFILES, DemoDiagnostics, DemoSession } from '../demo/demo-ports';
import { NavigationService } from './navigation.service';

const THEMES = ['chiaro', 'classico', 'scuro'];

/** Guscio dell'applicazione: barra superiore (profilo e tema della demo), menu laterale, contenuto e notifiche. */
@Component({
  selector: 'lc-root',
  imports: [FormsModule, RouterOutlet, IconComponent, SidebarComponent, NzButtonModule, NzLayoutModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(DemoSession);
  protected readonly diagnostics = inject(DemoDiagnostics);
  protected readonly navigation = inject(NavigationService);
  private readonly themeService = inject(ThemeService);

  protected readonly profiles = Object.keys(DEMO_PROFILES);
  protected readonly themes = THEMES;
  protected readonly themeName = signal(THEMES[0]);
  protected readonly collapsed = signal(false);
  /** Stile del menu: lo dice il tema (barra laterale chiara o scura). */
  protected readonly siderTone = computed(() => {
    const theme = this.themeService.current();
    return theme?.tokens.layout?.sider?.tone ?? (theme?.mode === 'dark' ? 'dark' : 'light');
  });
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

}
