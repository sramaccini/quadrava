import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NodeHostComponent, type ScreenRuntime, type Scope } from 'core';
import { NzCardModule } from 'ng-zorro-antd/card';
import type { SectionNode } from 'schema';

@Component({
  selector: 'lc-section',
  imports: [NodeHostComponent, NzCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .body { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }
    /* Affiancati: ognuno largo quanto il suo contenuto (almeno 200px), a capo quando manca spazio, allineati in basso. */
    .body.row { flex-direction: row; flex-wrap: wrap; align-items: flex-end; }
    .body.row > lc-node { flex: 0 1 auto; min-width: 200px; }
  `,
  template: `
    <nz-card role="region" [attr.aria-label]="node().title ? runtime().text(node().title, scope()) : null" [nzTitle]="node().title ? runtime().text(node().title, scope())  : undefined">
      <div class="body" [class.row]="node().layout === 'row'">
        @for (child of node().components; track $index) {
          <lc-node [node]="child" [runtime]="runtime()" [scope]="scope()" />
        }
      </div>
    </nz-card>
  `,
})
export class SectionComponent {
  readonly node = input.required<SectionNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
}
