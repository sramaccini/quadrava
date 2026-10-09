import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent, UserMenuComponent, type UserMenuItem } from 'components';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { I18n, ThemeService, loadMessages, type VisibleLeaf } from 'core';
import { validateTheme } from 'schema';
import { DEMO_PROFILES, DemoDiagnostics, DemoSession } from '../demo/demo-ports';
import { NavigationService } from './navigation.service';

const THEMES = ['chiaro', 'classico', 'scuro'];
/** Lingue della demo: per ciascuna esiste `examples/i18n/<lingua>.json`. */
const LANGUAGES = ['it', 'en'];

/** Guscio dell'applicazione: barra superiore (profilo e tema della demo), menu laterale, contenuto e notifiche. */
@Component({
  selector: 'lc-root',
  imports: [FormsModule, RouterOutlet, SidebarComponent, UserMenuComponent, NzButtonModule, NzLayoutModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(DemoSession);
  protected readonly diagnostics = inject(DemoDiagnostics);
  protected readonly navigation = inject(NavigationService);
  private readonly themeService = inject(ThemeService);
  protected readonly i18n = inject(I18n);
  protected readonly languages = LANGUAGES;

  protected readonly profiles = Object.keys(DEMO_PROFILES);
  protected readonly themes = THEMES;
  protected readonly themeName = signal(THEMES[0]);
  protected readonly collapsed = signal(false);
  /** Voci del menu utente prima dell'uscita, che il componente aggiunge da sé come ultima. */
  protected readonly userItems = computed<UserMenuItem[]>(() => [{ id: 'permessi', label: this.i18n.t('app.permissions', { n: this.permissions().length }), icon: 'safety', disabled: true }]);
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
    void loadMessages(this.i18n, LANGUAGES, (l) => `examples/i18n/${l}.json`).then((problems) => problems.forEach((p) => console.warn('[i18n]', p)));
    effect(() => (document.documentElement.lang = this.i18n.locale()));
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
