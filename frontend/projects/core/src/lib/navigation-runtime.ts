import { computed } from '@angular/core';
import { ExpressionEngine } from 'expressions';
import type { NavigationDefinition, NavigationItem, NavigationLeaf, NavigationArea } from 'schema';
import type { I18n } from './i18n';
import type { Authorization, RuntimeDiagnostics, UserProvider } from './ports';

/** Visible item that opens a screen. The parameters are already texts, ready for the query string. */
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

export interface VisibleArea {
  id: string;
  label: string;
  icon?: string;
  items: VisibleItem[];
}

export interface NavigationDeps {
  authorization: Authorization;
  userProvider: UserProvider;
  diagnostics?: RuntimeDiagnostics | null;
  /** Language and translations: enables `{{ t('key', 'fallback') }}` in the menu labels. */
  i18n?: I18n | null;
}

/** Current position in the navigation: area and path of ids from the group to the item. */
export interface NavigationLocation {
  area: string;
  path: string[];
}

/**
 * Menu filtered for the current user. Rules (all fail-closed):
 * - an item is visible if the user has `requires` and `visibleIf` is true (error => hidden);
 * - a group without visible items disappears, and an area without visible items does not appear.
 * `areas` is a computed: it updates itself if the permissions change (signal-based Authorization).
 * The menu is only a convenience: enforcement stays in the screen (`requires`) and in the back end.
 */
export class NavigationRuntime {
  private readonly engine: ExpressionEngine;

  readonly areas = computed<VisibleArea[]>(() =>
    this.definition.areas.map((u) => this.filterArea(u)).filter((u): u is VisibleArea => u !== null),
  );

  constructor(
    readonly definition: NavigationDefinition,
    private readonly deps: NavigationDeps,
  ) {
    this.engine = new ExpressionEngine(
      { can: (permission) => deps.authorization.can(permission) },
      {
        onError: (info) => this.report(info.source, info.error),
        i18n: deps.i18n
          ? { locale: () => deps.i18n!.intlLocale(), translate: (key, fallback, params) => deps.i18n!.lookup(key, fallback, params).text }
          : undefined,
      },
    );
  }

  /** Menu label: if it contains `{{ }}` (for example `t('key')`) it is evaluated; on error the written text stays. */
  private text(label: string): string {
    if (!label.includes('{{')) return label;
    const result = this.engine.interpolate(label, { user: this.deps.userProvider.user() });
    return result.ok && result.value !== null && result.value !== undefined ? String(result.value) : label;
  }

  area(id: string): VisibleArea | null {
    return this.areas().find((u) => u.id === id) ?? null;
  }

  /** First visible item (in document order) of an area. */
  firstLeaf(areaId: string): VisibleLeaf | null {
    const area = this.area(areaId);
    return area ? firstLeafOf(area.items) : null;
  }

  /** Where to land at start-up: the `default` area if visible, otherwise the first visible one. */
  defaultTarget(): { area: string; leaf: VisibleLeaf } | null {
    const wanted = this.definition.default;
    const order = [...this.areas()].sort((a, b) => Number(b.id === wanted) - Number(a.id === wanted));
    for (const area of order) {
      const leaf = firstLeafOf(area.items);
      if (leaf) return { area: area.id, leaf };
    }
    return null;
  }

  /** Path of the item that matches a screen with the given parameters, in the given area. */
  locate(areaId: string, screen: string, params: Record<string, unknown> = {}): string[] | null {
    const area = this.area(areaId);
    if (!area) return null;
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
    walk(area.items, []);
    return (best as { path: string[] } | null)?.path ?? null;
  }

  /** Labels of the path (area, groups, item) that leads to a screen: used by the breadcrumb. */
  trail(areaId: string, screen: string, params: Record<string, unknown> = {}): string[] | null {
    const area = this.area(areaId);
    const path = this.locate(areaId, screen, params);
    if (!area || !path) return null;
    const labels = [area.label];
    let items: VisibleItem[] = area.items;
    for (const id of path) {
      const item = items.find((i) => i.id === id);
      if (!item) break;
      labels.push(item.label);
      items = item.kind === 'group' ? item.children : [];
    }
    return labels;
  }

  /** Area a screen belongs to: first the preferred one (usually the current one), then the others. */
  areaOf(screen: string, params: Record<string, unknown> = {}, preferred?: string | null): string | null {
    const order = [...this.areas()].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
    return order.find((u) => this.locate(u.id, screen, params) !== null)?.id ?? null;
  }

  private filterArea(area: NavigationArea): VisibleArea | null {
    if (!this.allowed(area)) return null;
    const items = this.filterItems(area.items);
    return items.length > 0 ? { id: area.id, label: this.text(area.label), icon: area.icon, items } : null;
  }

  private filterItems(items: NavigationItem[]): VisibleItem[] {
    const result: VisibleItem[] = [];
    for (const item of items) {
      if (!this.allowed(item)) continue;
      if ('children' in item) {
        const children = this.filterItems(item.children);
        if (children.length > 0) result.push({ kind: 'group', id: item.id, label: this.text(item.label), icon: item.icon, children });
      } else {
        result.push(toLeaf(item, this.text(item.label)));
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

function toLeaf(item: NavigationLeaf, label: string): VisibleLeaf {
  const params = Object.fromEntries(Object.entries(item.params ?? {}).map(([k, v]) => [k, String(v)]));
  return { kind: 'leaf', id: item.id, label, icon: item.icon, screen: item.screen, params };
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
