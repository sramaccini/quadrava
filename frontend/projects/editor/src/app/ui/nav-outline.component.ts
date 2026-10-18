import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { getIn, isObject, samePath, startsWith, type Json, type Path } from '../model/doc-ops';
import { navTargetAt, NavigationStore, type NavTarget } from '../model/navigation-store';
import { fallbackText } from '../model/templates';
import { DockPinComponent } from './dock-pin.component';

interface NavItem {
  path: Path;
  target: NavTarget;
  label: string;
  detail: string;
  severity: 'error' | 'warning' | null;
  children: NavItem[];
  first: boolean;
  last: boolean;
}

/** Severity of the problems of an element of the navigation (the worst one), for the mark next to it. */
export function navSeverity(store: NavigationStore, path: Path): 'error' | 'warning' | null {
  const own = store.issues().filter((i) => samePath(i.owner, path));
  if (own.some((i) => i.severity === 'error')) return 'error';
  return own.length ? 'warning' : null;
}

/** Name of the kind of an element of the navigation (area, group, item). */
export function navKindLabel(i18n: I18n, target: NavTarget): string {
  return i18n.t('ed.nav.kind.' + (target.kind === 'group' ? 'group' : target.kind));
}

/**
 * Outline of the navigation: areas and three-level menus, with the commands to add, move, duplicate and delete. A side
 * panel of the workspace: it shows the navigation of the active window.
 */
@Component({
  selector: 'ed-nav-outline',
  imports: [NgTemplateOutlet, DockPinComponent, NzButtonModule, NzIconModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nav-outline.component.scss',
  templateUrl: './nav-outline.component.html',
})
export class NavOutlineComponent {
  protected readonly store = inject(NavigationStore);
  protected readonly i18n = inject(I18n);

  protected readonly items = computed<NavItem[]>(() => this.list(this.store.doc(), ['areas']));
  protected readonly rootSeverity = computed(() => navSeverity(this.store, []));
  protected readonly canAddLeaf = computed(() => this.store.itemPoint('leaf') !== null);
  protected readonly canAddGroup = computed(() => this.store.itemPoint('group') !== null);

  private list(doc: Json, listPath: Path): NavItem[] {
    const list = getIn(doc, listPath);
    if (!Array.isArray(list)) return [];
    return list
      .map((value, i) => {
        const path = [...listPath, i];
        const target = navTargetAt(doc, path);
        if (!target || !isObject(value)) return null;
        const childKey = target.kind === 'area' ? 'items' : target.kind === 'group' ? 'children' : null;
        return {
          path,
          target,
          label: navKindLabel(this.i18n, target),
          detail: typeof value['label'] === 'string' ? fallbackText(value['label']) : '',
          severity: navSeverity(this.store, path),
          children: childKey ? this.list(doc, [...path, childKey]) : [],
          first: i === 0,
          last: i === list.length - 1,
        } satisfies NavItem;
      })
      .filter((item): item is NavItem => item !== null);
  }

  protected isSelected(path: Path): boolean {
    return samePath(this.store.selection(), path);
  }

  protected containsSelection(path: Path): boolean {
    const selection = this.store.selection();
    return selection.length > path.length && startsWith(selection, path);
  }
}
