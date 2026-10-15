import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { DockPinComponent } from './dock-pin.component';
import { fromPointer, getIn, isObject, samePath, toPointer, type Path } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { definitionProperties, nodeProperties, ownerOf, screenProperties, targetAt, type PropertyInfo } from '../model/schema-info';
import { FieldsComponent } from './fields.component';

/** Properties gathered in the «Conditions and help» group, closed if none is set. */
const CONDITIONS = new Set(['visibleIf', 'hiddenIf', 'enabledIf', 'readOnlyIf', 'nextIf', 'tooltip']);

/**
 * Panel of the properties of the selected element (screen, node, tab or step). The fields come from the schema
 * (see `ed-fields`); the conditions are in a separate group, open only if one of them is set. At the top the
 * path of the element (a click goes up to a container) and a filter by property name, which starts empty again at
 * every change of selection.
 */
@Component({
  selector: 'ed-inspector',
  imports: [DockPinComponent, FieldsComponent, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './inspector.component.scss',
  templateUrl: './inspector.component.html',
})
export class InspectorComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  /** Filter of the properties by name. */
  protected readonly filter = signal('');

  constructor() {
    effect(() => {
      this.store.selection();
      this.filter.set('');
    });
  }

  /** Path from the screen to the selected element, through the containers (nodes, tabs, steps). */
  protected readonly crumbs = computed(() => {
    const doc = this.store.doc();
    const paths: Path[] = [];
    for (let path = this.store.selection(); path.length; path = ownerOf(doc, path.slice(0, -1))) paths.unshift(path);
    paths.unshift([]);
    return paths.map((path) => {
      const target = targetAt(doc, path);
      const label = !target || target.kind === 'screen' ? this.i18n.t('ed.screen') : target.kind === 'node' ? this.i18n.t('ed.type.' + target.type) : this.i18n.t('ed.' + target.kind);
      return { path, key: path.join('/'), label };
    });
  });

  protected readonly heading = computed(() => {
    const target = this.store.target();
    if (!target) return '';
    if (target.kind === 'node') return this.i18n.t('ed.type.' + target.type);
    return this.i18n.t('ed.' + target.kind);
  });

  private readonly properties = computed<PropertyInfo[]>(() => {
    const target = this.store.target();
    if (!target) return [];
    const all =
      target.kind === 'screen'
        ? screenProperties()
        : target.kind === 'node'
          ? nodeProperties(target.type)
          : definitionProperties(target.kind === 'tab' ? 'tab' : 'wizardStep');
    return all.filter((info) => info.kind !== 'children');
  });

  /** Properties passing the filter (property name, regardless of case). */
  private readonly filtered = computed(() => {
    const query = this.filter().trim().toLowerCase();
    return query ? this.properties().filter((p) => p.name.toLowerCase().includes(query)) : this.properties();
  });
  protected readonly main = computed(() => this.filtered().filter((p) => !CONDITIONS.has(p.name)));
  protected readonly conditions = computed(() => this.filtered().filter((p) => CONDITIONS.has(p.name)));

  /** The conditions group opens by itself if a condition is set or has problems. */
  protected readonly conditionsOpen = computed(() => {
    const path = this.store.selection();
    const value = getIn(this.store.doc(), path);
    const names = this.conditions().map((p) => p.name);
    const pointers = names.map((n) => toPointer([...path, n]));
    return (isObject(value) && names.some((n) => value[n] !== undefined)) || this.store.issues().some((i) => pointers.includes(i.pointer));
  });

  /** Common explanation of expressions, shown once at the top of the group instead of under every field. */
  protected readonly expressionHelp = computed(() => this.conditions().find((p) => p.kind === 'expression')?.description ?? '');

  /** Problems of the element not concerning a shown property (required properties missing, unknown ones). */
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
}
