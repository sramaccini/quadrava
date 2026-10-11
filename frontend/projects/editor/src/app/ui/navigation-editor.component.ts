import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SidebarComponent, type NavigateEvent } from 'components';
import { I18n, NavigationRuntime, Notifier } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { fromPointer, getIn, isObject, samePath, startsWith, type Json, type Path } from '../model/doc-ops';
import { DocumentState } from '../model/document-state';
import { navProperties, navTargetAt, NavigationStore, type NavTarget } from '../model/navigation-store';
import { fallbackText } from '../model/templates';
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
 * Editor della navigazione: casi d'uso e menu a tre livelli. A sinistra la struttura con i comandi per aggiungere,
 * a destra i campi dell'elemento (generati dallo schema della navigazione), al centro il menu vero (`lc-sidebar`)
 * con un profilo simulato: si scelgono i permessi e si vede che cosa compare.
 */
@Component({
  selector: 'ed-navigation-editor',
  imports: [
    FormsModule,
    NgTemplateOutlet,
    FieldsComponent,
    JsonViewComponent,
    SidebarComponent,
    NzButtonModule,
    NzCheckboxModule,
    NzIconModule,
    NzSwitchModule,
    NzTabsModule,
    NzTooltipModule,
  ],
  // I campi e la vista JSON lavorano sulla navigazione invece che sulla schermata.
  providers: [{ provide: DocumentState, useExisting: NavigationStore }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './navigation-editor.component.scss',
  templateUrl: './navigation-editor.component.html',
})
export class NavigationEditorComponent {
  protected readonly store = inject(NavigationStore);
  protected readonly i18n = inject(I18n);
  private readonly notifier = inject(Notifier);

  protected readonly view = signal<'preview' | 'json'>('preview');

  // Struttura

  protected readonly items = computed<NavItem[]>(() => this.list(this.store.doc(), ['useCases']));

  private list(doc: Json, listPath: Path): NavItem[] {
    const list = getIn(doc, listPath);
    if (!Array.isArray(list)) return [];
    return list
      .map((value, i) => {
        const path = [...listPath, i];
        const target = navTargetAt(doc, path);
        if (!target || !isObject(value)) return null;
        const childKey = target.kind === 'useCase' ? 'items' : target.kind === 'group' ? 'children' : null;
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

  // Proprietà

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

  // Anteprima del menu

  /** Permessi del profilo simulato; null = tutti. */
  protected readonly granted = signal<Set<string> | null>(null);
  protected readonly collapsed = signal(false);
  /** Il menu disegnato: l'ultima navigazione valida (con errori resta la precedente). */
  protected readonly runtime = linkedSignal<NavigationRuntime | null, NavigationRuntime | null>({
    source: () => {
      const definition = this.store.definition();
      return definition
        ? new NavigationRuntime(definition, {
            authorization: { can: (permission: string) => this.granted()?.has(permission) ?? true },
            userProvider: { user: () => ({ username: 'anteprima', displayName: 'Anteprima', locale: this.i18n.locale() }) },
            i18n: this.i18n,
          })
        : null;
    },
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  protected readonly useCaseId = linkedSignal<NavigationRuntime | null, string | null>({
    source: () => this.runtime(),
    computation: (runtime, previous) => {
      const visible = runtime?.useCases() ?? [];
      const keep = previous?.value && visible.some((u) => u.id === previous.value);
      return keep ? previous!.value : (visible[0]?.id ?? null);
    },
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

  protected navigated(event: NavigateEvent): void {
    this.notifier.toast(this.i18n.t('ed.preview.navigated', { screen: event.leaf.screen }));
  }

  protected setView(index: number): void {
    this.view.set(index === 1 ? 'json' : 'preview');
  }
}
