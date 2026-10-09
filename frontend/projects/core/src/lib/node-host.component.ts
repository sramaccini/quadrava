import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { NodeDefinition } from 'schema';
import { COMPONENT_CATALOG } from './catalog';
import type { ScreenRuntime } from './screen-runtime';
import type { Scope } from './types';

/**
 * Disegna un nodo scegliendo il componente dal catalogo. Qui si applica in modo centralizzato
 * `visibleIf`/`hiddenIf`: un componente non può dimenticarsi di rispettarli.
 */
@Component({
  selector: 'lc-node',
  imports: [NgComponentOutlet, NzTooltipModule],
  styles: `.tip { display: block; } .tip.fit { width: fit-content; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    if (!found) this.runtime().report(`nodo ${type}`, 'tipo di componente non presente nel catalogo');
    return found;
  });
  protected readonly visible = computed(() => this.runtime().isVisible(this.node(), this.scope()));
  /** Testo del tooltip già risolto (`{{ }}`), mostrato come testo semplice mai come HTML. */
  protected readonly tooltip = computed(() => {
    const raw = this.node().tooltip;
    return raw ? this.runtime().text(raw, this.scope()) || null : null;
  });
  protected readonly fit = computed(() => this.node().type === 'button');
  protected readonly inputs = computed(() => ({ node: this.node(), runtime: this.runtime(), scope: this.scope() }));
}
