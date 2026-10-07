import { Location } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ExpressionEngine } from 'expressions';
import { Authorization, NavigationRuntime, RuntimeDiagnostics, ScreenNavigator, UserProvider, checkNavigation, type VisibleLeaf } from 'core';
import { validateNavigation } from 'schema';

export interface RouteLocation {
  useCase: string | null;
  screen: string | null;
  params: Record<string, string>;
}

/**
 * Collega menu e router. L'URL è `/<caso-d-uso>/<schermata>?<parametri>`: è l'unica fonte della posizione corrente,
 * quindi funzionano Indietro, preferiti e link condivisi.
 */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly authorization = inject(Authorization);
  private readonly userProvider = inject(UserProvider);
  private readonly diagnostics = inject(RuntimeDiagnostics, { optional: true });

  readonly runtime = signal<NavigationRuntime | null>(null);
  readonly problems = signal<string[]>([]);
  readonly current = signal<RouteLocation>({ useCase: null, screen: null, params: {} });
  private readonly lastScreen = new Map<string, { screen: string; params: Record<string, string> }>();

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.syncFromUrl();
    });
    void this.load();
  }

  /** Carica il documento di navigazione, lo valida (schema e coerenza) e prepara il menu. */
  private async load(): Promise<void> {
    try {
      const response = await fetch('examples/navigation.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = validateNavigation(await response.json());
      if (!result.valid) {
        this.problems.set(result.issues.map((i) => `${i.path} ${i.message}`));
        return;
      }
      const issues = checkNavigation(result.value, new ExpressionEngine({ can: () => false }));
      if (issues.length > 0) {
        this.problems.set(issues.map((i) => `${i.path}: ${i.message}`));
        return;
      }
      this.runtime.set(new NavigationRuntime(result.value, { authorization: this.authorization, userProvider: this.userProvider, diagnostics: this.diagnostics }));
    } catch (e) {
      this.problems.set([`Navigazione non caricata: ${e instanceof Error ? e.message : String(e)}`]);
    }
  }

  private syncFromUrl(): void {
    const tree = this.router.parseUrl(this.router.url);
    const segments = tree.root.children['primary']?.segments.map((s) => s.path) ?? [];
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(tree.queryParams)) params[key] = String(Array.isArray(value) ? value[0] : value);
    const here: RouteLocation = { useCase: segments[0] ?? null, screen: segments[1] ?? null, params };
    this.current.set(here);
    if (here.useCase && here.screen) this.lastScreen.set(here.useCase, { screen: here.screen, params });
  }

  /** Indirizzo di una voce, per i link (apribili in una nuova scheda). */
  href(useCase: string, leaf: VisibleLeaf): string {
    return this.location.prepareExternalUrl(this.router.serializeUrl(this.router.createUrlTree([useCase, leaf.screen], { queryParams: leaf.params })));
  }

  open(useCase: string, screen: string, params: Record<string, unknown> = {}): void {
    void this.router.navigate([useCase, screen], { queryParams: params });
  }

  /** Cambio schermata richiesto da un'azione (`navigate`): resta nel caso d'uso corrente se la schermata gli appartiene. */
  openScreen(screen: string, params: Record<string, unknown>): void {
    const runtime = this.runtime();
    const here = this.current().useCase;
    const useCase = runtime?.useCaseOf(screen, params, here) ?? here ?? runtime?.defaultTarget()?.useCase;
    if (useCase) this.open(useCase, screen, params);
  }

  /** Selettore dei casi d'uso: torna all'ultima schermata visitata, altrimenti alla prima voce. */
  switchUseCase(useCase: string): void {
    const last = this.lastScreen.get(useCase);
    if (last && this.runtime()?.locate(useCase, last.screen, last.params)) {
      this.open(useCase, last.screen, last.params);
      return;
    }
    const leaf = this.runtime()?.firstLeaf(useCase);
    if (leaf) this.open(useCase, leaf.screen, leaf.params);
  }

  /** Destinazione iniziale per l'utente corrente. */
  openDefault(): boolean {
    const target = this.runtime()?.defaultTarget();
    if (!target) return false;
    void this.router.navigate([target.useCase, target.leaf.screen], { queryParams: target.leaf.params, replaceUrl: true });
    return true;
  }
}

/** Porta `ScreenNavigator` realizzata con il router: i passi `navigate` delle schermate diventano cambi di URL. */
@Injectable({ providedIn: 'root' })
export class RouterNavigator extends ScreenNavigator {
  private readonly navigation = inject(NavigationService);

  navigate(screen: string, params: Record<string, unknown>): void {
    this.navigation.openScreen(screen, params);
  }
}
