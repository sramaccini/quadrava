import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
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
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (component(); as c) {
      @if (visible()) {
        <ng-container *ngComponentOutlet="c; inputs: inputs()" />
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
  protected readonly inputs = computed(() => ({ node: this.node(), runtime: this.runtime(), scope: this.scope() }));
}
