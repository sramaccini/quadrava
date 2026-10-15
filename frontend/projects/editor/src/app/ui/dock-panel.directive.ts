import { Directive, inject, input } from '@angular/core';
import { Dock, type DockPanel } from './dock';

/**
 * Marks the element of a panel of the side (\`edDockPanel="outline"\`): pinned it sits in the column (\`ed-docked\`),
 * unpinned it floats over the central area (\`ed-floating\`), visible only when open (\`ed-open\`). The styles
 * are in styles.scss, because they apply to elements of different components.
 */
@Directive({
  selector: '[edDockPanel]',
  host: {
    '[attr.id]': "'ed-panel-' + edDockPanel()",
    '[attr.data-dock-panel]': 'edDockPanel()',
    '[class.ed-docked]': 'dock.pinned[edDockPanel()]()',
    '[class.ed-floating]': '!dock.pinned[edDockPanel()]()',
    '[class.ed-open]': 'dock.isOpen(edDockPanel())',
  },
})
export class DockPanelDirective {
  readonly edDockPanel = input.required<DockPanel>();
  protected readonly dock = inject(Dock);
}
