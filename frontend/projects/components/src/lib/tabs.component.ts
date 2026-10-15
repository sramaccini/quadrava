import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NodeHostComponent, type ScreenRuntime, type Scope } from 'core';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import type { TabDefinition, TabsNode } from 'schema';

/**
 * Tabs. One tab is visible at a time but all of them stay in the page (hidden): data entered in a form
 * is not lost when switching tabs. A tab with a false `visibleIf` does not appear. The keyboard (arrows, Home, End)
 * is NG-ZORRO's.
 */
@Component({
  selector: 'lc-tabs',
  imports: [NodeHostComponent, NzTabsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.body { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }`,
  template: `
    <nz-tabs [nzSelectedIndex]="active()" (nzSelectedIndexChange)="select($event)">
      @for (tab of visibleTabs(); track tab) {
        <nz-tab [nzTitle]="runtime().text(tab.label, scope())" nzForceRender>
          <div class="body">
            @for (child of tab.components; track $index) {
              <lc-node [node]="child" [runtime]="runtime()" [scope]="scope()" />
            }
          </div>
        </nz-tab>
      }
    </nz-tabs>
  `,
})
export class TabsComponent {
  readonly node = input.required<TabsNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  private readonly selected = signal<TabDefinition | null>(null);

  protected readonly visibleTabs = computed(() => this.node().tabs.filter((t) => this.runtime().isVisible(t, this.scope())));
  /** Index of the shown tab: the chosen one, if it is still visible, otherwise the first. */
  protected readonly active = computed(() => Math.max(0, this.visibleTabs().indexOf(this.selected() as TabDefinition)));

  protected select(index: number): void {
    const tab = this.visibleTabs()[index];
    if (tab) this.selected.set(tab);
  }
}
