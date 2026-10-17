import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { IconComponent, QuadravaWordmarkComponent, SidebarComponent, UserMenuComponent, type UserMenuItem } from 'components';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { DefinitionSource, I18n, ThemeService, loadCatalogs, type VisibleLeaf } from 'core';
import { validateTheme } from 'schema';
import { NavigationService } from './navigation.service';
import { ShellSession } from './shell-session';
import { DemoNetwork, NETWORK_SPEEDS, type NetworkSpeed } from '../demo/demo-ports';

/** Languages of the demo: each has its `examples/i18n/<language>.json`. */
const LANGUAGES = ['en', 'it'];

const LANGUAGE_KEY = 'lc.language';

/**
 * Width bands of the shell, as in Ant Design Pro:
 * - wide (≥ 1200px): sidebar expanded, demo settings in the top bar;
 * - medium (768–1199px): sidebar collapsed to icons (it can be expanded), settings in a menu;
 * - narrow (< 768px): sidebar in a drawer opened by the «menu» button, settings in a menu.
 */
export type Viewport = 'wide' | 'medium' | 'narrow';
const WIDE = '(min-width: 1200px)';
const MEDIUM = '(min-width: 768px)';

/** Current band, updated when the window changes size. Without matchMedia (tests, server) it is `wide`. */
function viewportSignal(destroyRef: DestroyRef) {
  const current = signal<Viewport>('wide');
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return current.asReadonly();
  const wide = window.matchMedia(WIDE);
  const medium = window.matchMedia(MEDIUM);
  const update = () => current.set(wide.matches ? 'wide' : medium.matches ? 'medium' : 'narrow');
  update();
  wide.addEventListener('change', update);
  medium.addEventListener('change', update);
  destroyRef.onDestroy(() => {
    wide.removeEventListener('change', update);
    medium.removeEventListener('change', update);
  });
  return current.asReadonly();
}

/** Initial language: the last one chosen, otherwise the browser's if supported, otherwise English. */
function initialLanguage(): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored && LANGUAGES.includes(stored)) return stored;
  } catch {
    // see above
  }
  const browser = (typeof navigator === 'undefined' ? '' : navigator.language).slice(0, 2);
  return LANGUAGES.includes(browser) ? browser : 'en';
}

/** Shell of the application: top bar (profile and theme of the demo), side menu, content and notifications. */
@Component({
  selector: 'lc-root',
  imports: [FormsModule, NgTemplateOutlet, RouterOutlet, IconComponent, QuadravaWordmarkComponent, SidebarComponent, UserMenuComponent, NzButtonModule, NzDrawerModule, NzDropdownModule, NzLayoutModule, NzMenuModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(ShellSession);
  protected readonly navigation = inject(NavigationService);
  private readonly themeService = inject(ThemeService);
  protected readonly i18n = inject(I18n);
  protected readonly languages = LANGUAGES;

  protected readonly profiles = this.session.profiles;
  /** Simulated network: only in the demo with the back end in the browser (where there are profiles to choose). */
  protected readonly network = inject(DemoNetwork);
  protected readonly speeds = Object.keys(NETWORK_SPEEDS) as NetworkSpeed[];
  private readonly definitions = inject(DefinitionSource);
  protected readonly themes = this.definitions.themes();
  protected readonly themeName = signal(this.themes[0]);
  protected readonly viewport = viewportSignal(inject(DestroyRef));
  protected readonly collapsed = signal(false);
  /** Drawer with the sidebar, only in the narrow band. */
  protected readonly drawerOpen = signal(false);
  /** User menu items before the logout, which the component adds by itself as the last one. */
  protected readonly userItems = computed<UserMenuItem[]>(() => [{ id: 'permessi', label: this.i18n.t('app.permissions', { n: this.session.permissionCount() }), icon: 'safety', disabled: true }]);
  /** Style of the menu: the theme says it (light or dark sidebar). */
  protected readonly siderTone = computed(() => {
    const theme = this.themeService.current();
    return theme?.tokens.layout?.sider?.tone ?? (theme?.mode === 'dark' ? 'dark' : 'light');
  });
  protected readonly active = computed(() => {
    const here = this.navigation.current();
    return here.screen ? { screen: here.screen, params: here.params } : null;
  });
  protected readonly hrefFor = (area: string, leaf: VisibleLeaf): string => this.navigation.href(area, leaf);

  constructor() {
    // The catalogues come from the same source as the definitions: the demo files or the versions published in the registry.
    void loadCatalogs(this.i18n, LANGUAGES, (l) => this.definitions.messages(l)).then((problems) => problems.forEach((p) => console.warn('[i18n]', p)));
    this.i18n.setLocale(initialLanguage());
    effect(() => {
      const locale = this.i18n.locale();
      document.documentElement.lang = locale;
      try {
        localStorage.setItem(LANGUAGE_KEY, locale);
      } catch {
        // Storage not available (private browsing, blockers): the choice holds only for this session.
      }
    });
    // When the band changes the bar adapts: collapsed in the medium one, expanded in the wide one, drawer closed otherwise.
    // Within the same band the user's choice holds.
    effect(() => {
      const viewport = this.viewport();
      untracked(() => {
        this.collapsed.set(viewport === 'medium');
        if (viewport !== 'narrow') this.drawerOpen.set(false);
      });
    });
    effect(() => {
      const name = this.themeName();
      this.definitions
        .theme(name)
        .then((doc: unknown) => {
          const result = validateTheme(doc);
          if (result.valid) this.themeService.apply(result.value);
        })
        .catch((e: unknown) => console.warn('[tema]', name, e instanceof Error ? e.message : e));
    });
  }

  /** Opens a menu item; in the drawer it closes it (a change of area instead leaves it open to choose the item). */
  protected open(area: string, leaf: VisibleLeaf): void {
    this.drawerOpen.set(false);
    this.navigation.open(area, leaf.screen, leaf.params);
  }
}
