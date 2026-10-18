import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { fromPointer, samePath } from '../model/doc-ops';
import { navProperties, NavigationStore } from '../model/navigation-store';
import { DockPinComponent } from './dock-pin.component';
import { FieldsComponent } from './fields.component';
import { navKindLabel } from './nav-outline.component';

/**
 * Properties of the element selected in the navigation, with the fields generated from the navigation schema. A side panel
 * of the workspace: it shows the navigation of the active window.
 */
@Component({
  selector: 'ed-nav-inspector',
  imports: [DockPinComponent, FieldsComponent, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nav-inspector.component.scss',
  templateUrl: './nav-inspector.component.html',
})
export class NavInspectorComponent {
  protected readonly store = inject(NavigationStore);
  protected readonly i18n = inject(I18n);

  protected readonly heading = computed(() => {
    const target = this.store.target();
    return target ? (target.kind === 'root' ? this.i18n.t('ed.nav.kind.root') : navKindLabel(this.i18n, target)) : '';
  });

  protected readonly properties = computed(() => {
    const target = this.store.target();
    return target ? navProperties(target) : [];
  });

  /** Problems of the element not tied to one of its fields. */
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
