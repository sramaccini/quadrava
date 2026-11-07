import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { AppBrandComponent, IconComponent, NotificationBellComponent, QuadravaWordmarkComponent, SHELL_MESSAGES, SidebarComponent, UserMenuComponent, type UserMenuChoices, type UserMenuItem, type UserNotification } from 'components';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { DefinitionSource, I18n, Notifier, ThemeService, loadCatalogs, type VisibleLeaf } from 'core';
import { applyDocumentBrand } from './document-brand';
import { NavigationService } from './navigation.service';
import { NotificationsService } from './notifications.service';
import { APPLICATION_SETTINGS, type ApplicationSettings } from './runtime-config';
import { SettingsDialogComponent } from './settings-dialog.component';
import { ShellSession } from './shell-session';

/** Languages of the demo: each has its `examples/i18n/<language>.json`. */

const LANGUAGE_KEY = 'lc.language';

/** Prefix of the identifiers of the application's items in the user menu. */
const APP_ITEM = 'app:';

/**
 * Width bands of the shell, as in Ant Design Pro:
 * - wide (≥ 1200px): sidebar expanded;
 * - medium (768–1199px): sidebar collapsed to icons (it can be expanded);
 * - narrow (< 768px): sidebar in a drawer opened by the «menu» button.
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

/** Initial language: the last one chosen, otherwise the browser's if the application has it, otherwise its default one. */
function initialLanguage(settings: ApplicationSettings): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored && settings.languages.includes(stored)) return stored;
  } catch {
    // see above
  }
  const browser = typeof navigator === 'undefined' ? '' : navigator.language;
  return [browser, browser.slice(0, 2)].find((l) => settings.languages.includes(l)) ?? settings.defaultLanguage;
}

/** Shell of the application: top bar with the user menu, side menu, content and notifications. */
@Component({
  selector: 'lc-root',
  imports: [NgTemplateOutlet, RouterOutlet, AppBrandComponent, IconComponent, QuadravaWordmarkComponent, SidebarComponent, UserMenuComponent, NotificationBellComponent, SettingsDialogComponent, FormsModule, NzButtonModule, NzDrawerModule, NzLayoutModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(ShellSession);
  protected readonly navigation = inject(NavigationService);
  /** Messages of the user behind the bell (ADR-22), when the navigation names their service. */
  protected readonly notifications = inject(NotificationsService);
  private readonly themeService = inject(ThemeService);
  protected readonly i18n = inject(I18n);
  private readonly settings = inject(APPLICATION_SETTINGS);
  /** Languages of the application (from its project). */
  protected readonly languages = this.settings.languages;

  /** Profiles of the demo (with the back end in the browser): chosen when signing in again; empty otherwise. */
  protected readonly profiles = this.session.profiles;
  /** Profile chosen on the signed-out page of the demo, applied when signing in. */
  protected readonly nextProfile = signal(this.session.username());
  private readonly definitions = inject(DefinitionSource);
  protected readonly themes = this.definitions.themes();
  protected readonly themeName = signal(this.themes[0]);
  protected readonly viewport = viewportSignal(inject(DestroyRef));
  protected readonly collapsed = signal(false);
  /** Drawer with the sidebar, only in the narrow band. */
  protected readonly drawerOpen = signal(false);
  /**
   * The settings dialog (theme, language, the sections of the application and, in the demo, the network), opened from
   * the user menu or from an address with `?settings=<tab>`: the URL says whether it is open and on which tab.
   */
  protected readonly settingsOpen = computed(() => this.navigation.settingsTab() !== null);
  protected readonly settingsTab = computed(() => this.navigation.settingsTab() ?? 'general');
  /** Items of the application in the user menu (ADR-25), already filtered for the user. */
  private readonly appItems = computed(() => this.navigation.runtime()?.userMenu() ?? []);
  /** Sections of the application in the settings dialog (ADR-25). */
  protected readonly settingsSections = computed(() => this.navigation.runtime()?.settings() ?? []);
  /**
   * Items of the user menu before the logout, which the user menu adds by itself as the last item: those of the
   * application first (with a prefix, so they never clash with the built-in ones), then the settings.
   */
  protected readonly userItems = computed<UserMenuItem[]>(() => [
    ...this.appItems().map((item) => ({ id: APP_ITEM + item.id, label: item.label, icon: item.icon })),
    { id: 'settings', label: this.i18n.t('app.settingsMenu'), icon: 'settings' },
  ]);
  /** Tenants of the user, first in the user menu: only when there are at least two to choose from. */
  protected readonly tenantChoices = computed<UserMenuChoices | undefined>(() => {
    const tenants = this.session.tenants();
    return tenants.length > 1 ? { label: this.i18n.t('lc.tenant'), items: tenants, selected: this.session.currentTenant() ?? undefined } : undefined;
  });
  private readonly notifier = inject(Notifier);
  /** Logo and name of the application at the top left, from the theme (null: the Quadrava logo). */
  protected readonly brand = computed(() => this.themeService.current()?.brand ?? null);
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

  /** A message chosen from the bell: marked read and, if it names one, its screen opens. */
  protected openNotification(item: UserNotification): void {
    if (!item.read) void this.notifications.markRead([item.id]);
    if (item.screen) this.navigation.openScreen(item.screen, item.params ?? {});
  }

  protected selectUserMenuItem(id: string): void {
    if (id === 'settings') this.navigation.showSettings('general');
    const item = id.startsWith(APP_ITEM) ? this.appItems().find((i) => APP_ITEM + i.id === id) : undefined;
    if (item) this.navigation.openScreen(item.screen, item.params);
  }

  /** The dialog closed by the user: the parameter leaves the URL. */
  protected settingsOpenChange(open: boolean): void {
    if (!open) this.navigation.showSettings(null);
  }

  /** Signs in again; in the demo, as the profile chosen on the signed-out page. */
  protected signIn(): void {
    if (this.profiles.includes(this.nextProfile())) this.session.selectProfile(this.nextProfile());
    this.session.login();
  }

  constructor() {
    // The texts of the shell are built in; the project's catalogue overrides any of them.
    for (const [locale, messages] of Object.entries(SHELL_MESSAGES)) this.i18n.addMessages(locale, messages, 'builtin');
    // The catalogues come from the same source as the definitions: the demo files or the versions published in the registry.
    void loadCatalogs(this.i18n, this.languages, (l) => this.definitions.messages(l)).then((problems) => problems.forEach((p) => console.warn('[i18n]', p)));
    this.i18n.setLocale(initialLanguage(this.settings));
    effect(() => {
      const locale = this.i18n.locale();
      document.documentElement.lang = locale;
      try {
        localStorage.setItem(LANGUAGE_KEY, locale);
      } catch {
        // Storage not available (private browsing, blockers): the choice holds only for this session.
      }
    });
    // The browser tab shows the brand of the theme too: its name as title and its icons (Quadrava's without a brand).
    effect(() => applyDocumentBrand(document, this.brand()));
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
        .then(async (doc: unknown) => {
          // The precompiled validators are large: loaded when first needed, outside the initial bundle.
          const { validateTheme } = await import('schema/validation');
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

  /** Switches tenant: on success the page starts again (with the BFF); if refused, it says so and stays. */
  protected async switchTenant(id: string): Promise<void> {
    if (!(await this.session.switchTenant(id))) this.notifier.toast(this.i18n.t('lc.tenantSwitchFailed'), 'error');
  }
}
