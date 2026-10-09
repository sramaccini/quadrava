import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { NodeHostComponent, type ScreenRuntime, type Scope } from 'core';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import type { TabDefinition, TabsNode } from 'schema';

/**
 * Schede. Si vede una scheda alla volta ma tutte restano nella pagina (nascoste): i dati inseriti in un form
 * non si perdono cambiando scheda. Una scheda con `visibleIf` falso non compare. La tastiera (frecce, Home, Fine)
 * è quella di NG-ZORRO.
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
  /** Indice della scheda mostrata: quella scelta, se è ancora visibile, altrimenti la prima. */
  protected readonly active = computed(() => Math.max(0, this.visibleTabs().indexOf(this.selected() as TabDefinition)));

  protected select(index: number): void {
    const tab = this.visibleTabs()[index];
    if (tab) this.selected.set(tab);
  }
}
