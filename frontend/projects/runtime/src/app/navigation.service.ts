import { Location } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ExpressionEngine } from 'expressions';
import { Authorization, DataClient, DefinitionSource, I18n, NavigationRuntime, RuntimeDiagnostics, ScreenNavigator, UserProvider, checkNavigation, type VisibleLeaf } from 'core';
import { type NavigationDefinition } from 'schema';

export interface RouteLocation {
  area: string | null;
  screen: string | null;
  params: Record<string, string>;
}

/**
 * Connects menu and router. The URL is `/<area>/<screen>?<parameters>`: it is the only source of the current position,
 * so Back, bookmarks and shared links work.
 */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly authorization = inject(Authorization);
  private readonly userProvider = inject(UserProvider);
  private readonly diagnostics = inject(RuntimeDiagnostics, { optional: true });
  private readonly i18n = inject(I18n);
  private readonly definitions = inject(DefinitionSource);
  private readonly data = inject(DataClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly runtime = signal<NavigationRuntime | null>(null);
  /** Validation errors of the navigation document (for whoever writes it). */
  readonly problems = signal<string[]>([]);
  /** The navigation document could not be loaded: the user sees a generic message, the detail goes to the reports. */
  readonly loadFailed = signal(false);
  /** Counters of the menu items (item id → number), if the navigation has them. */
  readonly badges = signal<Record<string, number>>({});
  readonly current = signal<RouteLocation>({ area: null, screen: null, params: {} });
  private readonly lastScreen = new Map<string, { screen: string; params: Record<string, string> }>();

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.syncFromUrl();
    });
    void this.load();
  }

  /** Loads the navigation document, validates it (schema and consistency) and prepares the menu. */
  private async load(): Promise<void> {
    try {
      // The precompiled validators are large: loaded when first needed, outside the initial bundle.
      const [doc, { validateNavigation }] = await Promise.all([this.definitions.navigation(), import('schema/validation')]);
      const result = validateNavigation(doc);
      if (!result.valid) {
        this.problems.set(result.issues.map((i) => `${i.path} ${i.message}`));
        return;
      }
      const issues = checkNavigation(result.value, new ExpressionEngine({ can: () => false }));
      if (issues.length > 0) {
        this.problems.set(issues.map((i) => `${i.path}: ${i.message}`));
        return;
      }
      this.runtime.set(new NavigationRuntime(result.value, { authorization: this.authorization, userProvider: this.userProvider, diagnostics: this.diagnostics, i18n: this.i18n }));
      this.watchBadges(result.value.badges);
    } catch (e) {
      this.diagnostics?.report({ screen: 'navigation', source: 'navigation loading', error: e instanceof Error ? e.message : String(e) });
      this.loadFailed.set(true);
    }
  }

  /**
   * Menu counters: read at once (even with the page in the background), then at intervals (only with the page visible) and when coming back to the
   * page. Only positive integers are kept; an error leaves the previous counters and ends up in the
   * technical reports, without disturbing the user.
   */
  private watchBadges(badges: NavigationDefinition['badges']): void {
    if (!badges || typeof document === 'undefined') return;
    // The first read always happens; the periodic ones only with the page visible.
    const read = async (always = false) => {
      if (!always && document.visibilityState === 'hidden') return;
      try {
        const reply = await this.data.request({ method: 'GET', url: badges.url });
        const counts: Record<string, number> = {};
        if (reply && typeof reply === 'object' && !Array.isArray(reply)) {
          for (const [id, value] of Object.entries(reply)) if (typeof value === 'number' && Number.isInteger(value) && value > 0) counts[id] = value;
        }
        this.badges.set(counts);
      } catch (e) {
        this.diagnostics?.report({ screen: 'navigation', source: 'menu counters', error: e instanceof Error ? e.message : String(e) });
      }
    };
    void read(true);
    const timer = setInterval(() => void read(), (badges.refreshSeconds ?? 60) * 1000);
    const onVisible = () => void read();
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private syncFromUrl(): void {
    const tree = this.router.parseUrl(this.router.url);
    const segments = tree.root.children['primary']?.segments.map((s) => s.path) ?? [];
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(tree.queryParams)) params[key] = String(Array.isArray(value) ? value[0] : value);
    const here: RouteLocation = { area: segments[0] ?? null, screen: segments[1] ?? null, params };
    this.current.set(here);
    if (here.area && here.screen) this.lastScreen.set(here.area, { screen: here.screen, params });
  }

  /** Address of an item, for links (that can be opened in a new tab). */
  href(area: string, leaf: VisibleLeaf): string {
    return this.location.prepareExternalUrl(this.router.serializeUrl(this.router.createUrlTree([area, leaf.screen], { queryParams: leaf.params })));
  }

  open(area: string, screen: string, params: Record<string, unknown> = {}): void {
    void this.router.navigate([area, screen], { queryParams: params });
  }

  /** Screen change requested by an action (`navigate`): stays in the current area if the screen belongs to it. */
  openScreen(screen: string, params: Record<string, unknown>): void {
    const runtime = this.runtime();
    const here = this.current().area;
    const area = runtime?.areaOf(screen, params, here) ?? here ?? runtime?.defaultTarget()?.area;
    if (area) this.open(area, screen, params);
  }

  /** Area selector: goes back to the last screen visited, otherwise to the first item. */
  switchArea(area: string): void {
    const last = this.lastScreen.get(area);
    if (last && this.runtime()?.locate(area, last.screen, last.params)) {
      this.open(area, last.screen, last.params);
      return;
    }
    const leaf = this.runtime()?.firstLeaf(area);
    if (leaf) this.open(area, leaf.screen, leaf.params);
  }

  /** Initial destination for the current user. */
  openDefault(): boolean {
    const target = this.runtime()?.defaultTarget();
    if (!target) return false;
    void this.router.navigate([target.area, target.leaf.screen], { queryParams: target.leaf.params, replaceUrl: true });
    return true;
  }
}

/** `ScreenNavigator` port implemented with the router: the `navigate` steps of the screens become URL changes. */
@Injectable({ providedIn: 'root' })
export class RouterNavigator extends ScreenNavigator {
  private readonly navigation = inject(NavigationService);

  navigate(screen: string, params: Record<string, unknown>): void {
    this.navigation.openScreen(screen, params);
  }
}
