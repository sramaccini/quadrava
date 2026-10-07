import { computed } from '@angular/core';
import { ExpressionEngine } from 'expressions';
import type { NavigationDefinition, NavigationItem, NavigationLeaf, NavigationUseCase } from 'schema';
import type { Authorization, RuntimeDiagnostics, UserProvider } from './ports';

/** Voce visibile che apre una schermata. I parametri sono già testi, pronti per la query string. */
export interface VisibleLeaf {
  kind: 'leaf';
  id: string;
  label: string;
  icon?: string;
  screen: string;
  params: Record<string, string>;
}

export interface VisibleGroup {
  kind: 'group';
  id: string;
  label: string;
  icon?: string;
  children: VisibleItem[];
}

export type VisibleItem = VisibleLeaf | VisibleGroup;

export interface VisibleUseCase {
  id: string;
  label: string;
  icon?: string;
  items: VisibleItem[];
}

export interface NavigationDeps {
  authorization: Authorization;
  userProvider: UserProvider;
  diagnostics?: RuntimeDiagnostics | null;
}

/** Posizione corrente nella navigazione: caso d'uso e percorso di id dal gruppo alla voce. */
export interface NavigationLocation {
  useCase: string;
  path: string[];
}

/**
 * Menu filtrato per l'utente corrente. Regole (tutte fail-closed):
 * - una voce è visibile se l'utente ha `requires` e `visibleIf` vale vero (errore => nascosta);
 * - un gruppo senza voci visibili sparisce, e un caso d'uso senza voci visibili non compare.
 * `useCases` è un computed: si aggiorna da solo se cambiano i permessi (Authorization basata su signal).
 * Il menu è solo comodità: l'enforcement resta nella schermata (`requires`) e nel backend.
 */
export class NavigationRuntime {
  private readonly engine: ExpressionEngine;

  readonly useCases = computed<VisibleUseCase[]>(() =>
    this.definition.useCases.map((u) => this.filterUseCase(u)).filter((u): u is VisibleUseCase => u !== null),
  );

  constructor(
    readonly definition: NavigationDefinition,
    private readonly deps: NavigationDeps,
  ) {
    this.engine = new ExpressionEngine(
      { can: (permission) => deps.authorization.can(permission) },
      { onError: (info) => this.report(info.source, info.error) },
    );
  }

  useCase(id: string): VisibleUseCase | null {
    return this.useCases().find((u) => u.id === id) ?? null;
  }

  /** Prima voce visibile (in ordine di documento) di un caso d'uso. */
  firstLeaf(useCaseId: string): VisibleLeaf | null {
    const useCase = this.useCase(useCaseId);
    return useCase ? firstLeafOf(useCase.items) : null;
  }

  /** Dove atterrare all'avvio: il caso d'uso `default` se visibile, altrimenti il primo visibile. */
  defaultTarget(): { useCase: string; leaf: VisibleLeaf } | null {
    const wanted = this.definition.default;
    const order = [...this.useCases()].sort((a, b) => Number(b.id === wanted) - Number(a.id === wanted));
    for (const useCase of order) {
      const leaf = firstLeafOf(useCase.items);
      if (leaf) return { useCase: useCase.id, leaf };
    }
    return null;
  }

  /** Percorso della voce che corrisponde a una schermata con i parametri dati, nel caso d'uso indicato. */
  locate(useCaseId: string, screen: string, params: Record<string, unknown> = {}): string[] | null {
    const useCase = this.useCase(useCaseId);
    if (!useCase) return null;
    let best: { path: string[]; specificity: number } | null = null;
    const walk = (items: VisibleItem[], trail: string[]): void => {
      for (const item of items) {
        if (item.kind === 'group') {
          walk(item.children, [...trail, item.id]);
        } else if (item.screen === screen && paramsMatch(item.params, params)) {
          const specificity = Object.keys(item.params).length;
          if (!best || specificity > best.specificity) best = { path: [...trail, item.id], specificity };
        }
      }
    };
    walk(useCase.items, []);
    return (best as { path: string[] } | null)?.path ?? null;
  }

  /** Caso d'uso a cui appartiene una schermata: prima quello preferito (di norma il corrente), poi gli altri. */
  useCaseOf(screen: string, params: Record<string, unknown> = {}, preferred?: string | null): string | null {
    const order = [...this.useCases()].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
    return order.find((u) => this.locate(u.id, screen, params) !== null)?.id ?? null;
  }

  private filterUseCase(useCase: NavigationUseCase): VisibleUseCase | null {
    if (!this.allowed(useCase)) return null;
    const items = this.filterItems(useCase.items);
    return items.length > 0 ? { id: useCase.id, label: useCase.label, icon: useCase.icon, items } : null;
  }

  private filterItems(items: NavigationItem[]): VisibleItem[] {
    const result: VisibleItem[] = [];
    for (const item of items) {
      if (!this.allowed(item)) continue;
      if ('children' in item) {
        const children = this.filterItems(item.children);
        if (children.length > 0) result.push({ kind: 'group', id: item.id, label: item.label, icon: item.icon, children });
      } else {
        result.push(toLeaf(item));
      }
    }
    return result;
  }

  private allowed(node: { requires?: string; visibleIf?: string }): boolean {
    if (node.requires && !this.deps.authorization.can(node.requires)) return false;
    return this.engine.evaluateCondition(node.visibleIf, { user: this.deps.userProvider.user() }, { whenMissing: true });
  }

  private report(source: string, error: string): void {
    const diagnostics = this.deps.diagnostics;
    if (!diagnostics) return;
    const event = { screen: `navigation:${this.definition.navigation}`, source, error };
    queueMicrotask(() => diagnostics.report(event));
  }
}

function toLeaf(item: NavigationLeaf): VisibleLeaf {
  const params = Object.fromEntries(Object.entries(item.params ?? {}).map(([k, v]) => [k, String(v)]));
  return { kind: 'leaf', id: item.id, label: item.label, icon: item.icon, screen: item.screen, params };
}

function firstLeafOf(items: VisibleItem[]): VisibleLeaf | null {
  for (const item of items) {
    if (item.kind === 'leaf') return item;
    const found = firstLeafOf(item.children);
    if (found) return found;
  }
  return null;
}

function paramsMatch(expected: Record<string, string>, actual: Record<string, unknown>): boolean {
  return Object.entries(expected).every(([k, v]) => actual[k] !== undefined && String(actual[k]) === v);
}
