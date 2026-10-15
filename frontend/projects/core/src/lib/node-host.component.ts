import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { NodeDefinition } from 'schema';
import { COMPONENT_CATALOG } from './catalog';
import type { ScreenRuntime } from './screen-runtime';
import type { Scope } from './types';

/**
 * Draws a node choosing the component from the catalogue. `visibleIf`/`hiddenIf` are applied here, centrally:
 * a component cannot forget to honour them. The `data-node-id` and `data-node-type` attributes
 * serve the editor preview (selection from the drawing) and the tests; they contain no data.
 */
@Component({
  selector: 'lc-node',
  imports: [NgComponentOutlet, NzTooltipModule],
  styles: `.tip { display: block; } .tip.fit { width: fit-content; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-node-id]': 'node().id ?? null', '[attr.data-node-type]': 'node().type' },
  template: `
    @if (component(); as c) {
      @if (visible()) {
        @if (tooltip(); as tip) {
          <div class="tip" [class.fit]="fit()" nz-tooltip [nzTooltipTitle]="tip">
            <ng-container *ngComponentOutlet="c; inputs: inputs()" />
          </div>
        } @else {
          <ng-container *ngComponentOutlet="c; inputs: inputs()" />
        }
      }
    }
  `,
})
export class NodeHostComponent {
  readonly node = input.required<NodeDefinition>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  private readonly catalog = inject(COMPONENT_CATALOG);

  protected readonly component = computed(() => {
    const type = this.node().type;
    const found = this.catalog[type] ?? null;
    if (!found) this.runtime().report(`node ${type}`, 'component type not in the catalogue');
    return found;
  });
  protected readonly visible = computed(() => this.runtime().isVisible(this.node(), this.scope()));
  /** Tooltip text already resolved (`{{ }}`), shown as plain text, never as HTML. */
  protected readonly tooltip = computed(() => {
    const raw = this.node().tooltip;
    return raw ? this.runtime().text(raw, this.scope()) || null : null;
  });
  protected readonly fit = computed(() => this.node().type === 'button');
  protected readonly inputs = computed(() => ({ node: this.node(), runtime: this.runtime(), scope: this.scope() }));
}
