import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import type { NavigationDefinition } from 'schema';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { fromPointer, getIn, isObject, samePath, startsWith, type Json, type Path } from '../model/doc-ops';
import { DocumentState } from '../model/document-state';
import { EditorStore } from '../model/editor-store';
import { ThemeStore } from '../model/theme-store';
import { PreviewFrameComponent } from '../preview/preview-frame.component';
import { previewState, type PreviewState } from '../preview/protocol';
import { navProperties, navTargetAt, NavigationStore, type NavTarget } from '../model/navigation-store';
import { fallbackText } from '../model/templates';
import { Dock } from './dock';
import { DockPanelDirective } from './dock-panel.directive';
import { DockPinComponent } from './dock-pin.component';
import { DockSideComponent } from './dock-side.component';
import { FieldsComponent } from './fields.component';
import { JsonViewComponent } from './json-view.component';

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

/**
 * Navigation editor: areas and three-level menus. On the left the outline with the commands to add,
 * on the right the fields of the element (generated from the navigation schema), in the centre the real menu (`lc-sidebar`)
 * with a simulated profile: one chooses the permissions and sees what appears.
 */
@Component({
  selector: 'ed-navigation-editor',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    DockPanelDirective,
    DockPinComponent,
    DockSideComponent,
    FieldsComponent,
    JsonViewComponent,
    PreviewFrameComponent,
    NzButtonModule,
    NzCheckboxModule,
    NzIconModule,
    NzSwitchModule,
    NzTabsModule,
    NzTooltipModule,
  ],
  // The fields and the JSON view work on the navigation instead of the screen.
  providers: [{ provide: DocumentState, useExisting: NavigationStore }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './navigation-editor.component.scss',
  templateUrl: './navigation-editor.component.html',
  host: {
    '[style.--ed-left.px]': "dock.columnWidth('left', ['outline'], 280)",
    '[style.--ed-right.px]': "dock.columnWidth('right', ['inspector'], 320)",
  },
})
export class NavigationEditorComponent {
  protected readonly store = inject(NavigationStore);
  protected readonly i18n = inject(I18n);
  protected readonly dock = inject(Dock);
  private readonly screens = inject(EditorStore);
  private readonly theme = inject(ThemeStore);

  protected readonly view = signal<'preview' | 'json'>('preview');

  // Outline

  protected readonly items = computed<NavItem[]>(() => this.list(this.store.doc(), ['areas']));

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
          label: this.kindLabel(target),
          detail: typeof value['label'] === 'string' ? fallbackText(value['label']) : '',
          severity: this.severityOf(path),
          children: childKey ? this.list(doc, [...path, childKey]) : [],
          first: i === 0,
          last: i === list.length - 1,
        } satisfies NavItem;
      })
      .filter((item): item is NavItem => item !== null);
  }

  private kindLabel(target: NavTarget): string {
    return this.i18n.t('ed.nav.kind.' + (target.kind === 'group' ? 'group' : target.kind));
  }

  private severityOf(path: Path): 'error' | 'warning' | null {
    const own = this.store.issues().filter((i) => samePath(i.owner, path));
    if (own.some((i) => i.severity === 'error')) return 'error';
    return own.length ? 'warning' : null;
  }

  protected readonly rootSeverity = computed(() => this.severityOf([]));

  protected isSelected(path: Path): boolean {
    return samePath(this.store.selection(), path);
  }

  protected containsSelection(path: Path): boolean {
    const selection = this.store.selection();
    return selection.length > path.length && startsWith(selection, path);
  }

  protected readonly canAddLeaf = computed(() => this.store.itemPoint('leaf') !== null);
  protected readonly canAddGroup = computed(() => this.store.itemPoint('group') !== null);

  // Properties

  protected readonly heading = computed(() => {
    const target = this.store.target();
    return target ? (target.kind === 'root' ? this.i18n.t('ed.nav.kind.root') : this.kindLabel(target)) : '';
  });

  protected readonly properties = computed(() => {
    const target = this.store.target();
    return target ? navProperties(target) : [];
  });

  protected readonly generalIssues = computed(() => {
    const selection = this.store.selection();
    const names = new Set(this.properties().map((p) => p.name));
    return this.store
      .issues()
      .filter((i) => samePath(i.owner, selection))
      .filter((i) => {
        const key = fromPointer(i.pointer)[selection.length];
        return key === undefined || !names.has(String(key));
      })
      .map((i) => i.message);
  });

  // Menu preview

  /** Permissions of the simulated profile; null = all. */
  protected readonly granted = signal<Set<string> | null>(null);
  /** The drawn menu: the last valid navigation (with errors the previous one stays). */
  private readonly shown = linkedSignal<NavigationDefinition | null, NavigationDefinition | null>({
    source: () => this.store.definition(),
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  /** What the iframe draws: the real menu (`lc-sidebar`) with the simulated profile and the theme being edited. */
  protected readonly previewState = computed<PreviewState>(() => {
    const granted = this.granted();
    return previewState({
      navigation: this.shown(),
      theme: this.theme.definition(),
      granted: granted ? [...granted] : null,
      locale: this.i18n.locale(),
      translations: this.screens.translations(),
      defaultLocale: this.screens.defaultLanguage(),
    });
  });

  protected setGrantAll(all: boolean): void {
    this.granted.set(all ? null : new Set(this.store.permissions()));
  }

  protected toggle(permission: string, on: boolean): void {
    this.granted.update((set) => {
      const next = new Set(set ?? this.store.permissions());
      if (on) next.add(permission);
      else next.delete(permission);
      return next;
    });
  }

  protected has(permission: string): boolean {
    return this.granted()?.has(permission) ?? true;
  }

  protected setView(index: number): void {
    this.view.set(index === 1 ? 'json' : 'preview');
  }
}
