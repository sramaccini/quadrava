import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NodeHostComponent, type ScreenRuntime, type Scope } from 'core';
import type { SectionNode } from 'schema';

@Component({
  selector: 'lc-section',
  imports: [NodeHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section { border: 1px solid var(--lc-color-border, #d5dbe3); border-radius: var(--lc-radius, 6px); background: var(--lc-color-surface, #fff); padding: var(--lc-gap, 12px); }
    h2 { margin: 0 0 var(--lc-gap, 12px); font-size: 1.15em; }
    .body { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }
  `,
  template: `
    <section [attr.aria-label]="node().title">
      @if (node().title) {
        <h2>{{ runtime().text(node().title, scope()) }}</h2>
      }
      <div class="body">
        @for (child of node().components; track $index) {
          <lc-node [node]="child" [runtime]="runtime()" [scope]="scope()" />
        }
      </div>
    </section>
  `,
})
export class SectionComponent {
  readonly node = input.required<SectionNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
}
